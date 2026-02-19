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
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

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
    State(_state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, StatusCode> {
    // Validate VM name to prevent command injection
    validate_vm_name(&vm_name).map_err(|_| StatusCode::BAD_REQUEST)?;

    // Require authentication token
    let token = query.token.as_deref().ok_or_else(|| {
        tracing::warn!(
            "WebSocket console connection rejected: no auth token for VM '{}'",
            vm_name
        );
        StatusCode::UNAUTHORIZED
    })?;

    // Validate JWT token
    let jwt_secret = match std::env::var("VMSPAWND_JWT_SECRET") {
        Ok(secret) => secret,
        Err(_) => {
            tracing::warn!(
                "VMSPAWND_JWT_SECRET not set - WebSocket auth is using an insecure default secret. \
                 Set this environment variable in production."
            );
            "vmspawnd-default-dev-secret".to_string()
        }
    };
    let jwt_config = security::JwtConfig::new(jwt_secret);
    let _claims = jwt_config.validate_token(token).map_err(|e| {
        tracing::warn!("WebSocket auth failed for VM '{}': {}", vm_name, e);
        StatusCode::UNAUTHORIZED
    })?;

    Ok(ws
        .max_message_size(MAX_MESSAGE_SIZE)
        .on_upgrade(move |socket| handle_console(socket, vm_name)))
}

async fn handle_console(socket: WebSocket, vm_name: String) {
    tracing::info!(
        "WebSocket console connection established for VM: {}",
        vm_name
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
            return;
        }
    };

    let mut stdin = child.stdin.take().unwrap();
    let mut stdout = child.stdout.take().unwrap();

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Read from stdout and send to WebSocket
    let vm_name_clone = vm_name.clone();
    let stdout_task = tokio::spawn(async move {
        let mut buf = [0u8; 1024];
        loop {
            match timeout(IDLE_TIMEOUT, stdout.read(&mut buf)).await {
                Ok(Ok(0)) => break,
                Ok(Ok(n)) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    if ws_sender.send(Message::Text(data)).await.is_err() {
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
                            "\r\n[Session timed out due to inactivity]\r\n".to_string(),
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

    tracing::info!("WebSocket console closed for VM: {}", vm_name);
}
