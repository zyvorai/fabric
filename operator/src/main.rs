// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

mod crd;
mod controller;
mod error;
mod reconcile;

use anyhow::Result;
use kube::Client;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "zyvor_fabricd_operator=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting zyvor-fabricd Kubernetes operator");

    let client = Client::try_default().await?;

    controller::run(client).await?;

    Ok(())
}
