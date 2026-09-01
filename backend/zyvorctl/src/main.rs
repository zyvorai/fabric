// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

mod cli;

use anyhow::Result;
use clap::Parser;
use cli::Cli;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing with ZYVOR_FABRICD_LOG_LEVEL or RUST_LOG support
    let env_filter = if let Ok(level) = std::env::var("ZYVOR_FABRICD_LOG_LEVEL") {
        tracing_subscriber::EnvFilter::new(format!("zyvorctl={level}"))
    } else {
        tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "zyvorctl=warn".into())
    };

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer().with_target(false))
        .init();

    tracing::debug!("zyvorctl starting");

    let cli = Cli::parse();
    cli.run().await
}
