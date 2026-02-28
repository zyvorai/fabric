use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path,
    },
    response::IntoResponse,
};
use futures::{sink::SinkExt, stream::StreamExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use state_store::StateStore;

/// VNC WebSocket proxy handler
/// Bridges WebSocket (browser) <-> VNC server (TCP)
pub async fn vnc_handler(ws: WebSocketUpgrade, Path(vm_name): Path<String>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_vnc(socket, vm_name))
}

async fn handle_vnc(socket: WebSocket, vm_name: String) {
    tracing::info!("VNC WebSocket connection for VM: {}", vm_name);

    // Connect to VNC server (typically on localhost:590X where X is VM index)
    let vnc_port = get_vnc_port(&vm_name).await;
    let vnc_addr = format!("127.0.0.1:{}", vnc_port);

    let tcp_stream = match TcpStream::connect(&vnc_addr).await {
        Ok(stream) => stream,
        Err(e) => {
            tracing::error!("Failed to connect to VNC server at {}: {}", vnc_addr, e);
            return;
        }
    };

    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (mut tcp_read, mut tcp_write) = tcp_stream.into_split();

    // VNC -> WebSocket
    let vm_name_clone = vm_name.clone();
    let vnc_to_ws = tokio::spawn(async move {
        let mut buf = vec![0u8; 8192];
        loop {
            match tcp_read.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    if ws_sender
                        .send(Message::Binary(buf[..n].to_vec().into()))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Err(e) => {
                    tracing::error!("VNC read error: {}", e);
                    break;
                }
            }
        }
        tracing::info!("VNC to WS task ended for VM: {}", vm_name_clone);
    });

    // WebSocket -> VNC
    let vm_name_clone = vm_name.clone();
    let ws_to_vnc = tokio::spawn(async move {
        while let Some(msg) = ws_receiver.next().await {
            match msg {
                Ok(Message::Binary(data)) => {
                    if tcp_write.write_all(&data).await.is_err() {
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
        tracing::info!("WS to VNC task ended for VM: {}", vm_name_clone);
    });

    let _ = tokio::join!(vnc_to_ws, ws_to_vnc);

    tracing::info!("VNC connection closed for VM: {}", vm_name);
}

async fn get_vnc_port(vm_name: &str) -> u16 {
    // Get VNC port from VM metadata
    let state_dir = std::env::var("STATE_DIR").unwrap_or_else(|_| "/var/lib/vmspawnd".to_string());

    if let Ok(store) = StateStore::new(&state_dir) {
        if let Ok(Some(vm)) = store.get_vm(vm_name) {
            if let Some(port) = vm.vnc_port {
                tracing::info!("Using VNC port {} from VM metadata for '{}'", port, vm_name);
                return port;
            }
        }
    }

    // Fallback: use hash-based port assignment
    tracing::warn!("VNC port not set for VM '{}', using hash-based assignment", vm_name);
    let hash = vm_name.bytes().fold(0u32, |acc, b| acc.wrapping_add(b as u32));
    5900 + (hash % 100) as u16
}

pub fn configure_vnc_for_vm(vm_name: &str, vnc_port: u16) -> anyhow::Result<()> {
    tracing::info!("Configuring VNC for VM {} on port {}", vm_name, vnc_port);

    // Add VNC device to VM configuration
    // Store VNC port in VM metadata
    let state_dir = std::env::var("STATE_DIR").unwrap_or_else(|_| "/var/lib/vmspawnd".to_string());

    if let Ok(store) = StateStore::new(&state_dir) {
        if let Ok(Some(mut vm)) = store.get_vm(vm_name) {
            vm.vnc_port = Some(vnc_port);
            store.save_vm(&vm)?;
            tracing::info!("VNC port {} saved to VM '{}' metadata", vnc_port, vm_name);
        } else {
            tracing::warn!("VM '{}' not found in state store, cannot save VNC port", vm_name);
        }
    } else {
        tracing::warn!("Failed to open state store, cannot save VNC port");
    }

    // Generate QEMU VNC arguments for systemd-vmspawn integration
    // The actual QEMU args would be: -vnc :X where X = vnc_port - 5900
    let vnc_display = vnc_port - 5900;
    tracing::info!(
        "VNC configured for VM '{}': use QEMU arg '-vnc :{}' or '-vnc 0.0.0.0:{}'",
        vm_name,
        vnc_display,
        vnc_port
    );

    Ok(())
}
