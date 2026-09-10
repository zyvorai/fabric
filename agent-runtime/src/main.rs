// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;
use axum::{routing::post, Router};
use tower_http::trace::TraceLayer;
use zyvor_fabric_agent_runtime::{app, config::Config, egress, AppState};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = Config::from_env()?;
    let public_addr = config.listen;
    let egress_addr = config.egress_listen;
    let state = AppState::from_config(config).await?;

    let public = app::public_router(state.clone()).layer(TraceLayer::new_for_http());
    let broker = Router::new()
        .route("/v1/egress", post(egress::proxy))
        .with_state(state.clone())
        .layer(TraceLayer::new_for_http());

    tokio::spawn(app::sync_loop(state.clone()));
    tokio::spawn(app::auto_hibernate_loop(state));

    let public_listener = tokio::net::TcpListener::bind(public_addr).await?;
    let egress_listener = tokio::net::TcpListener::bind(egress_addr).await?;
    tracing::info!(%public_addr, "Fabric Agent Runtime API listening");
    tracing::info!(%egress_addr, "Fabric Agent Runtime egress broker listening");

    tokio::try_join!(
        axum::serve(public_listener, public),
        axum::serve(egress_listener, broker),
    )?;
    Ok(())
}
