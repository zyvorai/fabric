// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

mod daemon;

use anyhow::Result;
use daemon::Daemon;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing with ZYVOR_FABRICD_LOG_LEVEL or RUST_LOG support
    // Priority: ZYVOR_FABRICD_LOG_LEVEL > RUST_LOG > default (info)
    // `EnvFilter` directive targets are Rust module paths, which use
    // underscores even when the Cargo package name has hyphens — a
    // `zyvor-fabricd=...` directive silently matches nothing.
    let env_filter = if let Ok(level) = std::env::var("ZYVOR_FABRICD_LOG_LEVEL") {
        tracing_subscriber::EnvFilter::new(format!("zyvor_fabricd={level},tower_http={level}"))
    } else {
        tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "zyvor_fabricd=info,tower_http=info".into())
    };

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting zyvor-fabricd");
    tracing::info!("Press Ctrl+C to quit");
    tracing::debug!("Debug logging enabled");

    let daemon = Daemon::new()?;
    daemon.start().await?;

    Ok(())
}
