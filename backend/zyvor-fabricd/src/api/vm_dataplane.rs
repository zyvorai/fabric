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
    CiliumEndpointView, DataplaneHealth, DataplaneStats, DataplaneStatus, FlowRecord, IdentityInfo,
    IpcacheEntry, NetworkServiceSpec, NetworkServiceStatus, SecurityGroup, VmNetworkPolicy,
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
pub struct ServiceListResponse {
    pub items: Vec<NetworkServiceSpec>,
}

#[derive(Debug, serde::Serialize)]
pub struct IdentityListResponse {
    pub items: Vec<IdentityInfo>,
}

#[derive(Debug, serde::Serialize)]
pub struct EndpointListResponse {
    pub items: Vec<CiliumEndpointView>,
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

fn map_driver_err(
    status: StatusCode,
    ctx: &str,
    e: impl std::fmt::Display,
) -> (StatusCode, Json<serde_json::Value>) {
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
        map_driver_err(
            StatusCode::NOT_FOUND,
            &format!("Dataplane status for VM '{name}'"),
            e,
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
            map_driver_err(
                StatusCode::NOT_FOUND,
                &format!("Dataplane policy for VM '{name}'"),
                e,
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
            map_driver_err(
                StatusCode::NOT_FOUND,
                &format!("Dataplane policy for VM '{name}'"),
                e,
            )
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
    let policy = state
        .driver
        .get_dataplane_policy(&name)
        .await
        .map_err(|e| {
            map_driver_err(
                StatusCode::NOT_FOUND,
                &format!("Dataplane policy for VM '{name}'"),
                e,
            )
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
    let policy = state
        .driver
        .get_dataplane_policy(&name)
        .await
        .map_err(|e| {
            map_driver_err(
                StatusCode::NOT_FOUND,
                &format!("Dataplane policy for VM '{name}'"),
                e,
            )
        })?;
    let flows = state
        .driver
        .dataplane_flows(&name, q.limit)
        .await
        .unwrap_or_default();
    Ok(Json(
        zyvor_fabric_driver_core::policy_control::dry_run_guard(&policy, &flows),
    ))
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
        map_driver_err(
            StatusCode::NOT_FOUND,
            &format!("Dataplane stats for VM '{name}'"),
            e,
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
            map_driver_err(
                StatusCode::NOT_FOUND,
                &format!("Dataplane flows for VM '{name}'"),
                e,
            )
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
    let items = state
        .driver
        .dataplane_list_groups()
        .await
        .map_err(|e| map_driver_err(StatusCode::BAD_GATEWAY, "Dataplane groups", e))?;
    Ok(Json(GroupListResponse { items }))
}

/// GET /api/dataplane/groups/:name
pub async fn get_group(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<SecurityGroup>, (StatusCode, Json<serde_json::Value>)> {
    let group = state.driver.dataplane_get_group(&name).await.map_err(|e| {
        map_driver_err(
            StatusCode::NOT_FOUND,
            &format!("Dataplane group '{name}'"),
            e,
        )
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
    state
        .driver
        .dataplane_delete_group(&name)
        .await
        .map_err(|e| {
            map_driver_err(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Failed to delete dataplane group '{name}'"),
                e,
            )
        })?;
    Ok(Json(DeletedResponse { deleted: name }))
}

/// GET /api/dataplane/services — Maglev/eBPF Service Fabric (not SDN `/api/services`).
pub async fn list_services(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<ServiceListResponse>, (StatusCode, Json<serde_json::Value>)> {
    let items = state
        .driver
        .dataplane_list_services()
        .await
        .map_err(|e| map_driver_err(StatusCode::BAD_GATEWAY, "Dataplane services", e))?;
    Ok(Json(ServiceListResponse { items }))
}

/// GET /api/dataplane/services/:name
pub async fn get_service(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<NetworkServiceSpec>, (StatusCode, Json<serde_json::Value>)> {
    let service = state
        .driver
        .dataplane_get_service(&name)
        .await
        .map_err(|e| {
            map_driver_err(
                StatusCode::NOT_FOUND,
                &format!("Dataplane service '{name}'"),
                e,
            )
        })?;
    Ok(Json(service))
}

/// POST /api/dataplane/services
pub async fn upsert_service(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Json(service): Json<NetworkServiceSpec>,
) -> Result<Json<NetworkServiceStatus>, (StatusCode, Json<serde_json::Value>)> {
    let spec = to_service_lb_spec(&service)?;
    let nodes = service_nodes(&state);
    let orch =
        service_lb::ServiceOrchestrator::new(service_lb::FluxVmHttpClient::new().map_err(|e| {
            map_driver_err(StatusCode::INTERNAL_SERVER_ERROR, "service-lb client", e)
        })?);
    let report = orch.apply(&spec, &nodes).await.map_err(|e| {
        map_driver_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Failed to upsert dataplane service '{}'", service.name),
            e,
        )
    })?;
    tracing::info!(
        service = %report.service,
        nodes = ?report.applied_nodes,
        "Upserted Maglev service via service-lb"
    );
    // Return status from the primary (local) FluxVM node for UI counters.
    let saved = state.driver.dataplane_get_service(&service.name).await.ok();
    let active = saved
        .as_ref()
        .map(|s| s.backends.iter().filter(|b| b.enabled).count())
        .unwrap_or_else(|| service.backends.iter().filter(|b| b.enabled).count());
    Ok(Json(NetworkServiceStatus {
        schema_version: 3,
        service_id: 0,
        name: service.name.clone(),
        active_backends: active,
        maglev_table_size: service.maglev_table_size.unwrap_or(4093),
        family: Some(if service.vip.contains(':') {
            "ipv6".into()
        } else {
            "ipv4".into()
        }),
        mode: Some(service.mode),
        exposure: Some(service.exposure),
        snat_address: service.snat_address,
    }))
}

/// DELETE /api/dataplane/services/:name
pub async fn delete_service(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<DeletedResponse>, (StatusCode, Json<serde_json::Value>)> {
    let nodes = service_nodes(&state);
    let orch =
        service_lb::ServiceOrchestrator::new(service_lb::FluxVmHttpClient::new().map_err(|e| {
            map_driver_err(StatusCode::INTERNAL_SERVER_ERROR, "service-lb client", e)
        })?);
    let report = orch.delete(&name, &nodes).await.map_err(|e| {
        map_driver_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Failed to delete dataplane service '{name}'"),
            e,
        )
    })?;
    tracing::info!(
        service = %name,
        nodes = ?report.applied_nodes,
        "Deleted Maglev service via service-lb"
    );
    Ok(Json(DeletedResponse { deleted: name }))
}

/// GET /api/dataplane/services/status — FluxVM host service dataplane status (schema v3).
pub async fn services_host_status(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let nodes = service_nodes(&state);
    let client = service_lb::FluxVmHttpClient::new()
        .map_err(|e| map_driver_err(StatusCode::INTERNAL_SERVER_ERROR, "service-lb client", e))?;
    use service_lb::ServiceNodeClient;
    // Primary node status is enough for the console; multi-node topology is
    // visible via each node's FluxVM URL when configured.
    let status = client
        .get_status(&nodes[0])
        .await
        .map_err(|e| map_driver_err(StatusCode::BAD_GATEWAY, "FluxVM service host status", e))?;
    Ok(Json(serde_json::to_value(status).unwrap_or_default()))
}

/// GET /api/dataplane/services/stats — FluxVM host service counters.
pub async fn services_host_stats(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    fluxvm_json_get(&state, "/v1/network/services/stats").await
}

/// GET /api/dataplane/services/health — backend health report (schema v3).
pub async fn services_health(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    fluxvm_json_get(&state, "/v1/network/services/health").await
}

/// POST /api/dataplane/services/health/reconcile — run active health probes.
pub async fn services_health_reconcile(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    fluxvm_json_post_empty(&state, "/v1/network/services/health/reconcile").await
}

/// POST /api/dataplane/services/conntrack/gc — expire forward/reverse state.
pub async fn services_conntrack_gc(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    fluxvm_json_post_empty(&state, "/v1/network/services/conntrack/gc").await
}

/// GET /api/dataplane/services/advertisements — VIP advertise snapshot.
pub async fn services_advertisements(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    fluxvm_json_get(&state, "/v1/network/services/advertisements").await
}

async fn fluxvm_json_get(
    state: &AppState,
    path: &str,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let url = format!(
        "{}{}",
        state.config.driver.fluxvm_url.trim_end_matches('/'),
        path
    );
    let mut req = reqwest::Client::new().get(&url);
    if let Some(token) = state.config.driver.fluxvm_token.as_deref() {
        req = req.bearer_auth(token);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| map_driver_err(StatusCode::BAD_GATEWAY, &format!("FluxVM GET {path}"), e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": format!("FluxVM {path} HTTP {status}: {body}") })),
        ));
    }
    let body = resp
        .json::<serde_json::Value>()
        .await
        .map_err(|e| map_driver_err(StatusCode::BAD_GATEWAY, &format!("FluxVM {path} JSON"), e))?;
    Ok(Json(body))
}

async fn fluxvm_json_post_empty(
    state: &AppState,
    path: &str,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let url = format!(
        "{}{}",
        state.config.driver.fluxvm_url.trim_end_matches('/'),
        path
    );
    let mut req = reqwest::Client::new().post(&url);
    if let Some(token) = state.config.driver.fluxvm_token.as_deref() {
        req = req.bearer_auth(token);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| map_driver_err(StatusCode::BAD_GATEWAY, &format!("FluxVM POST {path}"), e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": format!("FluxVM {path} HTTP {status}: {body}") })),
        ));
    }
    let body = resp
        .json::<serde_json::Value>()
        .await
        .map_err(|e| map_driver_err(StatusCode::BAD_GATEWAY, &format!("FluxVM {path} JSON"), e))?;
    Ok(Json(body))
}

fn service_nodes(state: &AppState) -> Vec<service_lb::NodeTarget> {
    let mut nodes = vec![service_lb::NodeTarget {
        name: "local".into(),
        base_url: state.config.driver.fluxvm_url.clone(),
        token: state.config.driver.fluxvm_token.clone(),
    }];
    for n in &state.config.driver.fluxvm_nodes {
        nodes.push(service_lb::NodeTarget {
            name: n.name.clone(),
            base_url: n.url.clone(),
            token: n
                .token
                .clone()
                .or_else(|| state.config.driver.fluxvm_token.clone()),
        });
    }
    nodes
}

fn to_service_lb_spec(
    service: &NetworkServiceSpec,
) -> Result<service_lb::ServiceSpec, (StatusCode, Json<serde_json::Value>)> {
    use service_lb::{
        BackendState, HealthCheckKind, ServiceAlgorithm, ServiceBackend, ServiceExposure,
        ServiceHealthCheck, ServiceMode, ServiceProtocol,
    };
    use std::net::IpAddr;

    let bad = |msg: String| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": msg })),
        )
    };

    let vip: IpAddr = service
        .vip
        .parse()
        .map_err(|_| bad(format!("invalid VIP '{}'", service.vip)))?;
    let protocol = match service.protocol {
        zyvor_fabric_driver_core::NetworkServiceProtocol::Tcp => ServiceProtocol::Tcp,
        zyvor_fabric_driver_core::NetworkServiceProtocol::Udp => ServiceProtocol::Udp,
    };
    let mode = match service.mode {
        zyvor_fabric_driver_core::NetworkServiceMode::Nat => ServiceMode::Nat,
        zyvor_fabric_driver_core::NetworkServiceMode::Dsr => ServiceMode::Dsr,
    };
    let exposure = match service.exposure {
        zyvor_fabric_driver_core::NetworkServiceExposure::EastWest => ServiceExposure::EastWest,
        zyvor_fabric_driver_core::NetworkServiceExposure::NorthSouth => ServiceExposure::NorthSouth,
        zyvor_fabric_driver_core::NetworkServiceExposure::Both => ServiceExposure::Both,
    };
    let snat_address = match &service.snat_address {
        Some(raw) => Some(
            raw.parse::<IpAddr>()
                .map_err(|_| bad(format!("invalid SNAT address '{raw}'")))?,
        ),
        None => None,
    };
    let health_check = service.health_check.as_ref().map(|h| ServiceHealthCheck {
        kind: match h.kind {
            zyvor_fabric_driver_core::NetworkHealthCheckKind::Tcp => HealthCheckKind::Tcp,
        },
        timeout_ms: h.timeout_ms,
        unhealthy_threshold: h.unhealthy_threshold,
        healthy_threshold: h.healthy_threshold,
    });
    let mut backends = Vec::with_capacity(service.backends.len());
    for b in &service.backends {
        let address: IpAddr = b
            .address
            .parse()
            .map_err(|_| bad(format!("invalid backend address '{}'", b.address)))?;
        backends.push(ServiceBackend {
            address,
            port: b.port,
            weight: b.weight,
            enabled: b.enabled,
            state: match b.state {
                zyvor_fabric_driver_core::NetworkBackendState::Ready => BackendState::Ready,
                zyvor_fabric_driver_core::NetworkBackendState::Draining => BackendState::Draining,
                zyvor_fabric_driver_core::NetworkBackendState::Unhealthy => BackendState::Unhealthy,
            },
            drain_until_unix_ms: b.drain_until_unix_ms,
        });
    }
    Ok(service_lb::ServiceSpec {
        name: service.name.clone(),
        vip,
        port: service.port,
        protocol,
        algorithm: ServiceAlgorithm::Maglev,
        mode,
        exposure,
        backends,
        maglev_table_size: service.maglev_table_size,
        snat_address,
        health_check,
        advertise: service.advertise,
    })
}

/// GET /api/dataplane/cnp
pub async fn list_cnp(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let body = state
        .driver
        .dataplane_list_cnp()
        .await
        .map_err(|e| map_driver_err(StatusCode::BAD_GATEWAY, "Dataplane CNP list", e))?;
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
        map_driver_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to apply dataplane CNP",
            e,
        )
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
    state
        .driver
        .dataplane_delete_cnp(&name)
        .await
        .map_err(|e| {
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
    let items = state
        .driver
        .dataplane_list_identities()
        .await
        .map_err(|e| map_driver_err(StatusCode::BAD_GATEWAY, "Dataplane identities", e))?;
    Ok(Json(IdentityListResponse { items }))
}

/// GET /api/dataplane/endpoints — FluxVM CEP-*shaped* views (+ identity_source).
pub async fn list_endpoints(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<EndpointListResponse>, (StatusCode, Json<serde_json::Value>)> {
    let items = state
        .driver
        .dataplane_list_endpoints()
        .await
        .map_err(|e| map_driver_err(StatusCode::BAD_GATEWAY, "Dataplane endpoints", e))?;
    Ok(Json(EndpointListResponse { items }))
}

/// GET /api/dataplane/microvm-metrics — Prometheus text from FluxVM MicroVM histograms.
pub async fn microvm_metrics(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<axum::response::Response, (StatusCode, Json<serde_json::Value>)> {
    use axum::response::IntoResponse;
    let url = state
        .config
        .driver
        .microvm_metrics_url
        .as_deref()
        .unwrap_or("http://127.0.0.1:9108/metrics");
    if url.is_empty() || url == "off" {
        return Ok((
            [(
                axum::http::header::CONTENT_TYPE,
                "text/plain; charset=utf-8",
            )],
            "# microvm metrics disabled\n",
        )
            .into_response());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| map_driver_err(StatusCode::INTERNAL_SERVER_ERROR, "metrics client", e))?;
    match client.get(url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let body = resp
                .text()
                .await
                .unwrap_or_else(|_| "# empty metrics body\n".into());
            Ok((
                [(
                    axum::http::header::CONTENT_TYPE,
                    "text/plain; version=0.0.4",
                )],
                body,
            )
                .into_response())
        }
        Ok(resp) => Err(map_driver_err(
            StatusCode::BAD_GATEWAY,
            "MicroVM metrics",
            format!("upstream HTTP {}", resp.status()),
        )),
        Err(e) => Err(map_driver_err(
            StatusCode::BAD_GATEWAY,
            "MicroVM metrics unreachable",
            e,
        )),
    }
}

/// GET /api/dataplane/observe
pub async fn observe(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let body = state
        .driver
        .dataplane_observe()
        .await
        .map_err(|e| map_driver_err(StatusCode::BAD_GATEWAY, "Dataplane observe", e))?;
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
    let body = state
        .driver
        .dataplane_health()
        .await
        .map_err(|e| map_driver_err(StatusCode::BAD_GATEWAY, "Dataplane health", e))?;
    Ok(Json(body))
}

/// GET /api/dataplane/ipcache
pub async fn ipcache(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<IpcacheListResponse>, (StatusCode, Json<serde_json::Value>)> {
    let items = state
        .driver
        .dataplane_ipcache()
        .await
        .map_err(|e| map_driver_err(StatusCode::BAD_GATEWAY, "Dataplane ipcache", e))?;
    Ok(Json(IpcacheListResponse { items }))
}

/// POST /api/dataplane/refresh-dns
pub async fn refresh_dns(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
) -> Result<Json<RefreshDnsResponse>, (StatusCode, Json<serde_json::Value>)> {
    let refreshed = state.driver.dataplane_refresh_dns().await.map_err(|e| {
        map_driver_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Dataplane refresh-dns",
            e,
        )
    })?;
    Ok(Json(RefreshDnsResponse { refreshed }))
}
