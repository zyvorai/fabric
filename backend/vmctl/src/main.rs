mod cli;

use anyhow::Result;
use cli::Cli;
use clap::Parser;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing with VSPAWN_LOG_LEVEL or RUST_LOG support
    let env_filter = if let Ok(level) = std::env::var("VSPAWN_LOG_LEVEL") {
        tracing_subscriber::EnvFilter::new(format!("vmctl={level}"))
    } else {
        tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "vmctl=warn".into())
    };

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer().with_target(false))
        .init();

    tracing::debug!("vmctl starting");

    let cli = Cli::parse();
    cli.run().await
}
