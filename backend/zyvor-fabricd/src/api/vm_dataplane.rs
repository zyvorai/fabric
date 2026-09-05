// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

//! Per-VM FluxVM Network Fabric dataplane — orthogonal to Fabric's
//! label→nftables `/network-policies` SDN. Proxies FluxVM's
//! `/v1/vms/{id}/network/{policy,status,stats,flows}` via `VmDataplaneDriver`.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use zyvor_fabric_driver_core::{
    DataplaneStats, DataplaneStatus, FlowRecord, VmNetworkPolicy,
};

use crate::server::AppState;
use crate::validation::validate_vm_name;
use security::{RequireAdmin, RequireRead};

#[derive(Debug, Deserialize)]
pub struct FlowsQuery {
    pub limit: Option<usize>,
}

#[derive(Debug, serde::Serialize)]
pub struct FlowListResponse {
    pub items: Vec<FlowRecord>,
}

/// GET /api/vms/:name/dataplane/status
pub async fn dataplane_status(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<DataplaneStatus>, (StatusCode, Json<serde_json::Value>)> {
    validate_vm_name(&name).map_err(|(s, m)| crate::api_error::json_error(s, m))?;
    let status = state.driver.dataplane_status(&name).await.map_err(|e| {
        crate::api_error::json_error(
            StatusCode::NOT_FOUND,
            format!("Dataplane status for VM '{name}': {e}"),
        )
    })?;
    Ok(Json(status))
}

/// GET /api/vms/:name/dataplane/policy
pub async fn get_dataplane_policy(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<VmNetworkPolicy>, (StatusCode, Json<serde_json::Value>)> {
    validate_vm_name(&name).map_err(|(s, m)| crate::api_error::json_error(s, m))?;
    let policy = state
        .driver
        .get_dataplane_policy(&name)
        .await
        .map_err(|e| {
            crate::api_error::json_error(
                StatusCode::NOT_FOUND,
                format!("Dataplane policy for VM '{name}': {e}"),
            )
        })?;
    Ok(Json(policy))
}

/// POST /api/vms/:name/dataplane/policy
pub async fn set_dataplane_policy(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Json(policy): Json<VmNetworkPolicy>,
) -> Result<Json<VmNetworkPolicy>, (StatusCode, Json<serde_json::Value>)> {
    validate_vm_name(&name).map_err(|(s, m)| crate::api_error::json_error(s, m))?;
    let saved = state
        .driver
        .set_dataplane_policy(&name, &policy)
        .await
        .map_err(|e| {
            crate::api_error::json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to set dataplane policy for VM '{name}': {e}"),
            )
        })?;
    tracing::info!("Updated VM edge dataplane policy for '{name}'");
    Ok(Json(saved))
}

/// GET /api/vms/:name/dataplane/stats
pub async fn dataplane_stats(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<DataplaneStats>, (StatusCode, Json<serde_json::Value>)> {
    validate_vm_name(&name).map_err(|(s, m)| crate::api_error::json_error(s, m))?;
    let stats = state.driver.dataplane_stats(&name).await.map_err(|e| {
        crate::api_error::json_error(
            StatusCode::NOT_FOUND,
            format!("Dataplane stats for VM '{name}': {e}"),
        )
    })?;
    Ok(Json(stats))
}

/// GET /api/vms/:name/dataplane/flows?limit=
pub async fn dataplane_flows(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Query(q): Query<FlowsQuery>,
) -> Result<Json<FlowListResponse>, (StatusCode, Json<serde_json::Value>)> {
    validate_vm_name(&name).map_err(|(s, m)| crate::api_error::json_error(s, m))?;
    let items = state
        .driver
        .dataplane_flows(&name, q.limit)
        .await
        .map_err(|e| {
            crate::api_error::json_error(
                StatusCode::NOT_FOUND,
                format!("Dataplane flows for VM '{name}': {e}"),
            )
        })?;
    Ok(Json(FlowListResponse { items }))
}
