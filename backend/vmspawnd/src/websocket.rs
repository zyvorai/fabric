use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::StatusCode,
    response::IntoResponse,
};
use futures::{sink::SinkExt, stream::StreamExt};
use serde::Deserialize;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

static ACTIVE_WS_CONNECTIONS: AtomicUsize = AtomicUsize::new(0);
const MAX_WS_CONNECTIONS: usize = 50;

use crate::server::AppState;
use crate::validation::validate_vm_name;

/// Maximum WebSocket message size (64KB)
const MAX_MESSAGE_SIZE: usize = 64 * 1024;

/// Idle timeout for WebSocket connections (5 minutes)
const IDLE_TIMEOUT: Duration = Duration::from_secs(5 * 60);

#[derive(Debug, Deserialize)]
pub struct ConsoleQuery {
    pub token: Option<String>,
}

pub async fn console_handler(
    ws: WebSocketUpgrade,
    Path(vm_name): Path<String>,
    Query(query): Query<ConsoleQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, StatusCode> {
    // Check concurrent WebSocket connection limit
    let current = ACTIVE_WS_CONNECTIONS.load(Ordering::Relaxed);
    if current >= MAX_WS_CONNECTIONS {
        tracing::warn!("WebSocket connection limit reached ({}/{})", current, MAX_WS_CONNECTIONS);
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }

    // Validate VM name to prevent command injection
    validate_vm_name(&vm_name).map_err(|_| StatusCode::BAD_REQUEST)?;

    // Validate authentication - reject if auth is not configured
    let jwt_config = match state.jwt_config.as_ref() {
        Some(c) => c,
        None => {
            tracing::warn!("WebSocket console rejected: authentication not configured");
            return Err(StatusCode::UNAUTHORIZED);
        }
    };

    let token = query.token.as_deref().ok_or_else(|| {
        tracing::warn!(
            "WebSocket console connection rejected: no auth token for VM '{}'",
            vm_name
        );
        StatusCode::UNAUTHORIZED
    })?;

    let _claims = jwt_config.validate_token(token).map_err(|e| {
        tracing::warn!("WebSocket auth failed for VM '{}': {}", vm_name, e);
        StatusCode::UNAUTHORIZED
    })?;

    // Require at least write permission for console access
    if !_claims.role.can_write() {
        tracing::warn!(
            "WebSocket console rejected: user '{}' has insufficient permissions",
            _claims.sub
        );
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(ws
        .max_message_size(MAX_MESSAGE_SIZE)
        .on_upgrade(move |socket| handle_console(socket, vm_name)))
}

async fn handle_console(socket: WebSocket, vm_name: String) {
    ACTIVE_WS_CONNECTIONS.fetch_add(1, Ordering::Relaxed);
    tracing::info!(
        "WebSocket console connection established for VM: {} (active: {})",
        vm_name,
        ACTIVE_WS_CONNECTIONS.load(Ordering::Relaxed),
    );

    let mut child = match Command::new("machinectl")
        .arg("shell")
        .arg(&vm_name)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(e) => {
            tracing::error!("Failed to spawn machinectl shell: {}", e);
            ACTIVE_WS_CONNECTIONS.fetch_sub(1, Ordering::Relaxed);
            return;
        }
    };

    let mut stdin = match child.stdin.take() {
        Some(s) => s,
        None => {
            tracing::error!("Failed to capture stdin for machinectl shell");
            let _ = child.kill().await;
            let (mut sender, _) = socket.split();
            let _ = sender.send(Message::Text("\r\n[Error: failed to open console]\r\n".into())).await;
            let _ = sender.send(Message::Close(None)).await;
            ACTIVE_WS_CONNECTIONS.fetch_sub(1, Ordering::Relaxed);
            return;
        }
    };
    let mut stdout = match child.stdout.take() {
        Some(s) => s,
        None => {
            tracing::error!("Failed to capture stdout for machinectl shell");
            let _ = child.kill().await;
            let (mut sender, _) = socket.split();
            let _ = sender.send(Message::Text("\r\n[Error: failed to open console]\r\n".into())).await;
            let _ = sender.send(Message::Close(None)).await;
            ACTIVE_WS_CONNECTIONS.fetch_sub(1, Ordering::Relaxed);
            return;
        }
    };

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Read from stdout and send to WebSocket
    let vm_name_clone = vm_name.clone();
    let stdout_task = tokio::spawn(async move {
        let mut buf = [0u8; 1024];
        loop {
            match timeout(IDLE_TIMEOUT, stdout.read(&mut buf)).await {
                Ok(Ok(0)) => break,
                Ok(Ok(n)) => {
                    if ws_sender.send(Message::Binary(buf[..n].to_vec().into())).await.is_err() {
                        break;
                    }
                }
                Ok(Err(e)) => {
                    tracing::error!("Error reading from stdout: {}", e);
                    break;
                }
                Err(_) => {
                    tracing::info!(
                        "Console idle timeout reached for VM: {}",
                        vm_name_clone
                    );
                    let _ = ws_sender
                        .send(Message::Text(
                            "\r\n[Session timed out due to inactivity]\r\n".into(),
                        ))
                        .await;
                    break;
                }
            }
        }
        tracing::info!("Console stdout task ended for VM: {}", vm_name_clone);
    });

    // Read from WebSocket and write to stdin
    let vm_name_clone = vm_name.clone();
    let stdin_task = tokio::spawn(async move {
        loop {
            match timeout(IDLE_TIMEOUT, ws_receiver.next()).await {
                Ok(Some(msg)) => match msg {
                    Ok(Message::Text(text)) => {
                        if stdin.write_all(text.as_bytes()).await.is_err() {
                            break;
                        }
                    }
                    Ok(Message::Binary(data)) => {
                        if stdin.write_all(&data).await.is_err() {
                            break;
                        }
                    }
                    Ok(Message::Close(_)) => break,
                    Err(e) => {
                        tracing::error!("WebSocket error: {}", e);
                        break;
                    }
                    _ => {}
                },
                Ok(None) => break,
                Err(_) => {
                    tracing::info!(
                        "Console input idle timeout for VM: {}",
                        vm_name_clone
                    );
                    break;
                }
            }
        }
        tracing::info!("Console stdin task ended for VM: {}", vm_name_clone);
    });

    // Wait for both tasks
    let _ = tokio::join!(stdout_task, stdin_task);

    // Kill the child process
    let _ = child.kill().await;

    ACTIVE_WS_CONNECTIONS.fetch_sub(1, Ordering::Relaxed);
    tracing::info!(
        "WebSocket console closed for VM: {} (active: {})",
        vm_name,
        ACTIVE_WS_CONNECTIONS.load(Ordering::Relaxed),
    );
}
