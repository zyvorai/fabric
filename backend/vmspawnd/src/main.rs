mod api;
mod config;
mod daemon;
mod routes;
mod server;

use anyhow::Result;
use daemon::Daemon;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "vmspawnd=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting vmspawnd");

    let daemon = Daemon::new().await?;
    daemon.start().await?;

    Ok(())
}
