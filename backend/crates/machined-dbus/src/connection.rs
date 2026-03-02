use anyhow::Result;
use zbus::Connection;

/// Connect to the system D-Bus.
///
/// The returned `Connection` is internally reference-counted and cheap to clone.
pub async fn system_bus() -> Result<Connection> {
    let conn = Connection::system().await?;
    tracing::debug!("Connected to system D-Bus");
    Ok(conn)
}
