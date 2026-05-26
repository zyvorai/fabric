// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

mod daemon;

use anyhow::Result;
use daemon::Daemon;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing with VSPAWN_LOG_LEVEL or RUST_LOG support
    // Priority: VSPAWN_LOG_LEVEL > RUST_LOG > default (info)
    let env_filter = if let Ok(level) = std::env::var("VSPAWN_LOG_LEVEL") {
        tracing_subscriber::EnvFilter::new(format!("vmspawnd={level},tower_http={level}"))
    } else {
        tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "vmspawnd=info,tower_http=info".into())
    };

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting vmspawnd");
    tracing::info!("Press Ctrl+C to quit");
    tracing::debug!("Debug logging enabled");

    let daemon = Daemon::new()?;
    daemon.start().await?;

    Ok(())
}
