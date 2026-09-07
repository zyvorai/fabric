// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Per-VM FluxVM Network Fabric dataplane — orthogonal to Fabric's
//! label→nftables `/network-policies` SDN. Proxies FluxVM's
//! `/v1/vms/{id}/network/*` and `/v1/network/{groups,cnp,…}` via
//! `VmDataplaneDriver` (schema v4).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use zyvor_fabric_driver_core::{
    DataplaneHealth, DataplaneStats, DataplaneStatus, FlowRecord, IdentityInfo, IpcacheEntry,
    SecurityGroup, VmNetworkPolicy,
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

#[derive(Debug, serde::Serialize)]
pub struct GroupListResponse {
    pub items: Vec<SecurityGroup>,
}

#[derive(Debug, serde::Serialize)]
pub struct IdentityListResponse {
    pub items: Vec<IdentityInfo>,
}

#[derive(Debug, serde::Serialize)]
pub struct IpcacheListResponse {
    pub items: Vec<IpcacheEntry>,
}

#[derive(Debug, serde::Serialize)]
pub struct RefreshDnsResponse {
    pub refreshed: usize,
}

#[derive(Debug, serde::Serialize)]
pub struct DeletedResponse {
    pub deleted: String,
}

fn map_driver_err(status: StatusCode, ctx: &str, e: impl std::fmt::Display) -> (StatusCode, Json<serde_json::Value>) {
    crate::api_error::json_error(status, format!("{ctx}: {e}"))
}

/// GET /api/vms/:name/dataplane/status
pub async fn dataplane_status(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<DataplaneStatus>, (StatusCode, Json<serde_json::Value>)> {
    validate_vm_name(&name).map_err(|(s, m)| crate::api_error::json_error(s, m))?;
    let status = state.driver.dataplane_status(&name).await.map_err(|e| {
        map_driver_err(StatusCode::NOT_FOUND, &format!("Dataplane status for VM '{name}'"), e)
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
            map_driver_err(StatusCode::NOT_FOUND, &format!("Dataplane policy for VM '{name}'"), e)
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
            map_driver_err(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Failed to set dataplane policy for VM '{name}'"),
                e,
            )
        })?;
    tracing::info!("Updated VM edge dataplane policy for '{name}'");
    Ok(Json(saved))
}

/// POST /api/vms/:name/dataplane/policy/control
/// Cilium-style Guard / Audit / Open / Invert / Block / Allow.
pub async fn dataplane_policy_control(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Json(req): Json<zyvor_fabric_driver_core::policy_control::ControlRequest>,
) -> Result<Json<VmNetworkPolicy>, (StatusCode, Json<serde_json::Value>)> {
    validate_vm_name(&name).map_err(|(s, m)| crate::api_error::json_error(s, m))?;
    let current = state
        .driver
        .get_dataplane_policy(&name)
        .await
        .map_err(|e| {
            map_driver_err(StatusCode::NOT_FOUND, &format!("Dataplane policy for VM '{name}'"), e)
        })?;
    let next = zyvor_fabric_driver_core::policy_control::apply_control(current, &req)
        .map_err(|m| crate::api_error::json_error(StatusCode::BAD_REQUEST, m))?;
    let saved = state
        .driver
        .set_dataplane_policy(&name, &next)
        .await
        .map_err(|e| {
            map_driver_err(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Failed to apply dataplane control for VM '{name}'"),
                e,
            )
        })?;
    tracing::info!("Applied dataplane flow control for '{name}'");
    Ok(Json(saved))
}

#[derive(Debug, Deserialize)]
pub struct ExplainQuery {
    pub dest: String,
    pub port: Option<u16>,
    pub proto: Option<String>,
}

/// GET /api/vms/:name/dataplane/explain?dest=&port=&proto=
pub async fn dataplane_explain(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Query(q): Query<ExplainQuery>,
) -> Result<
    Json<zyvor_fabric_driver_core::policy_control::ExplainResult>,
    (StatusCode, Json<serde_json::Value>),
> {
    validate_vm_name(&name).map_err(|(s, m)| crate::api_error::json_error(s, m))?;
    let policy = state.driver.get_dataplane_policy(&name).await.map_err(|e| {
        map_driver_err(StatusCode::NOT_FOUND, &format!("Dataplane policy for VM '{name}'"), e)
    })?;
    Ok(Json(zyvor_fabric_driver_core::policy_control::explain(
        &policy,
        &q.dest,
        q.port.unwrap_or(0),
        q.proto.as_deref().unwrap_or("any"),
    )))
}

/// GET /api/vms/:name/dataplane/dry-run
pub async fn dataplane_dry_run(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Query(q): Query<FlowsQuery>,
) -> Result<
    Json<zyvor_fabric_driver_core::policy_control::DryRunReport>,
    (StatusCode, Json<serde_json::Value>),
> {
    validate_vm_name(&name).map_err(|(s, m)| crate::api_error::json_error(s, m))?;
    let policy = state.driver.get_dataplane_policy(&name).await.map_err(|e| {
        map_driver_err(StatusCode::NOT_FOUND, &format!("Dataplane policy for VM '{name}'"), e)
    })?;
    let flows = state
        .driver
        .dataplane_flows(&name, q.limit)
        .await
        .unwrap_or_default();
    Ok(Json(zyvor_fabric_driver_core::policy_control::dry_run_guard(
        &policy, &flows,
    )))
}

/// GET /api/dataplane/templates
pub async fn dataplane_templates(RequireRead(_claims): RequireRead) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "items": ["open", "guard", "web", "dns-only", "no-world"]
    }))
}

/// GET /api/vms/:name/dataplane/stats
pub async fn dataplane_stats(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<DataplaneStats>, (StatusCode, Json<serde_json::Value>)> {
    validate_vm_name(&name).map_err(|(s, m)| crate::api_error::json_error(s, m))?;
    let stats = state.driver.dataplane_stats(&name).await.map_err(|e| {
        map_driver_err(StatusCode::NOT_FOUND, &format!("Dataplane stats for VM '{name}'"), e)
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
            map_driver_err(StatusCode::NOT_FOUND, &format!("Dataplane flows for VM '{name}'"), e)
        })?;
    Ok(Json(FlowListResponse { items }))
}

/// GET /api/vms/:name/dataplane/effective
pub async fn dataplane_effective(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    validate_vm_name(&name).map_err(|(s, m)| crate::api_error::json_error(s, m))?;
    let body = state.driver.dataplane_effective(&name).await.map_err(|e| {
        map_driver_err(
            StatusCode::NOT_FOUND,
            &format!("Dataplane effective policy for VM '{name}'"),
            e,
        )
    })?;
    Ok(Json(body))
}

/// GET /api/dataplane/groups
pub async fn list_groups(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<GroupListResponse>, (StatusCode, Json<serde_json::Value>)> {
    let items = state.driver.dataplane_list_groups().await.map_err(|e| {
        map_driver_err(StatusCode::BAD_GATEWAY, "Dataplane groups", e)
    })?;
    Ok(Json(GroupListResponse { items }))
}

/// GET /api/dataplane/groups/:name
pub async fn get_group(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<SecurityGroup>, (StatusCode, Json<serde_json::Value>)> {
    let group = state.driver.dataplane_get_group(&name).await.map_err(|e| {
        map_driver_err(StatusCode::NOT_FOUND, &format!("Dataplane group '{name}'"), e)
    })?;
    Ok(Json(group))
}

/// POST /api/dataplane/groups
pub async fn upsert_group(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Json(group): Json<SecurityGroup>,
) -> Result<Json<SecurityGroup>, (StatusCode, Json<serde_json::Value>)> {
    let saved = state
        .driver
        .dataplane_upsert_group(&group)
        .await
        .map_err(|e| {
            map_driver_err(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Failed to upsert dataplane group '{}'", group.name),
                e,
            )
        })?;
    tracing::info!("Upserted edge dataplane group '{}'", saved.name);
    Ok(Json(saved))
}

/// DELETE /api/dataplane/groups/:name
pub async fn delete_group(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<DeletedResponse>, (StatusCode, Json<serde_json::Value>)> {
    state.driver.dataplane_delete_group(&name).await.map_err(|e| {
        map_driver_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Failed to delete dataplane group '{name}'"),
            e,
        )
    })?;
    Ok(Json(DeletedResponse { deleted: name }))
}

/// GET /api/dataplane/cnp
pub async fn list_cnp(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let body = state.driver.dataplane_list_cnp().await.map_err(|e| {
        map_driver_err(StatusCode::BAD_GATEWAY, "Dataplane CNP list", e)
    })?;
    Ok(Json(body))
}

/// GET /api/dataplane/cnp/:name
pub async fn get_cnp(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let body = state.driver.dataplane_get_cnp(&name).await.map_err(|e| {
        map_driver_err(StatusCode::NOT_FOUND, &format!("Dataplane CNP '{name}'"), e)
    })?;
    Ok(Json(body))
}

/// POST /api/dataplane/cnp
pub async fn apply_cnp(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Json(doc): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let body = state.driver.dataplane_apply_cnp(&doc).await.map_err(|e| {
        map_driver_err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to apply dataplane CNP", e)
    })?;
    tracing::info!("Applied edge dataplane CNP");
    Ok(Json(body))
}

/// DELETE /api/dataplane/cnp/:name
pub async fn delete_cnp(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<DeletedResponse>, (StatusCode, Json<serde_json::Value>)> {
    state.driver.dataplane_delete_cnp(&name).await.map_err(|e| {
        map_driver_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Failed to delete dataplane CNP '{name}'"),
            e,
        )
    })?;
    Ok(Json(DeletedResponse { deleted: name }))
}

/// GET /api/dataplane/identities
pub async fn list_identities(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<IdentityListResponse>, (StatusCode, Json<serde_json::Value>)> {
    let items = state.driver.dataplane_list_identities().await.map_err(|e| {
        map_driver_err(StatusCode::BAD_GATEWAY, "Dataplane identities", e)
    })?;
    Ok(Json(IdentityListResponse { items }))
}

/// GET /api/dataplane/observe
pub async fn observe(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let body = state.driver.dataplane_observe().await.map_err(|e| {
        map_driver_err(StatusCode::BAD_GATEWAY, "Dataplane observe", e)
    })?;
    Ok(Json(body))
}

/// GET /api/dataplane/hubble/flows?limit=
pub async fn hubble_flows(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Query(q): Query<FlowsQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let body = state
        .driver
        .dataplane_hubble_flows(q.limit)
        .await
        .map_err(|e| map_driver_err(StatusCode::BAD_GATEWAY, "Dataplane Hubble flows", e))?;
    Ok(Json(body))
}

/// GET /api/dataplane/health
pub async fn health(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<DataplaneHealth>, (StatusCode, Json<serde_json::Value>)> {
    let body = state.driver.dataplane_health().await.map_err(|e| {
        map_driver_err(StatusCode::BAD_GATEWAY, "Dataplane health", e)
    })?;
    Ok(Json(body))
}

/// GET /api/dataplane/ipcache
pub async fn ipcache(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<IpcacheListResponse>, (StatusCode, Json<serde_json::Value>)> {
    let items = state.driver.dataplane_ipcache().await.map_err(|e| {
        map_driver_err(StatusCode::BAD_GATEWAY, "Dataplane ipcache", e)
    })?;
    Ok(Json(IpcacheListResponse { items }))
}

/// POST /api/dataplane/refresh-dns
pub async fn refresh_dns(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
) -> Result<Json<RefreshDnsResponse>, (StatusCode, Json<serde_json::Value>)> {
    let refreshed = state.driver.dataplane_refresh_dns().await.map_err(|e| {
        map_driver_err(StatusCode::INTERNAL_SERVER_ERROR, "Dataplane refresh-dns", e)
    })?;
    Ok(Json(RefreshDnsResponse { refreshed }))
}
