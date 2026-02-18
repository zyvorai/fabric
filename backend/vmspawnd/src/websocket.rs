use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    response::IntoResponse,
};
use futures::{sink::SinkExt, stream::StreamExt};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

use crate::server::AppState;

pub async fn console_handler(
    ws: WebSocketUpgrade,
    Path(vm_name): Path<String>,
    State(_state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_console(socket, vm_name))
}

async fn handle_console(socket: WebSocket, vm_name: String) {
    tracing::info!("WebSocket console connection established for VM: {}", vm_name);

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
            match stdout.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    if ws_sender.send(Message::Text(data)).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    tracing::error!("Error reading from stdout: {}", e);
                    break;
                }
            }
        }
        tracing::info!("Console stdout task ended for VM: {}", vm_name_clone);
    });

    // Read from WebSocket and write to stdin
    let vm_name_clone = vm_name.clone();
    let stdin_task = tokio::spawn(async move {
        while let Some(msg) = ws_receiver.next().await {
            match msg {
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
