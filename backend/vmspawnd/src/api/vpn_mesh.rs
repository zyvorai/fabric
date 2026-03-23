use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use security::{RequireRead, RequireWrite};
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

use vpn_mesh::compiler::VMSnapshot;
use vpn_mesh::models::{
    CreateVpnNetworkRequest, CreateVpnTunnelRequest, VpnNetwork, VpnNetworkStatus, VpnTunnel,
    VpnTunnelStatus,
};

use crate::server::AppState;

const TUNNEL_STORE_KEY: &str = "vpn_tunnels";
const NETWORK_STORE_KEY: &str = "vpn_networks";

// ── VPN Tunnel CRUD ─────────────────────────────────────────────────

pub async fn create_vpn_tunnel(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateVpnTunnelRequest>,
) -> impl IntoResponse {
    tracing::debug!("vpn_mesh::{}", stringify!(create_vpn_tunnel));
    let now = Utc::now();
    let tunnel = VpnTunnel {
        id: Uuid::new_v4(),
        name: req.name,
        description: req.description,
        interface_name: req.interface_name,
        listen_port: req.listen_port,
        address: req.address,
        private_key_ref: req.private_key_ref,
        peers: req.peers,
        enabled: req.enabled,
        created: now,
        updated: now,
    };

    if let Err(e) = state
        .store
        .save_entity(TUNNEL_STORE_KEY, &tunnel.id.to_string(), &tunnel)
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_vpn(&state).await {
        tracing::warn!("Post-create VPN reconciliation failed: {}", e);
    }

    (StatusCode::CREATED, Json(tunnel)).into_response()
}

pub async fn list_vpn_tunnels(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::debug!("vpn_mesh::{}", stringify!(list_vpn_tunnels));
    match state.store.list_entities::<VpnTunnel>(TUNNEL_STORE_KEY) {
        Ok(tunnels) => (StatusCode::OK, Json(tunnels)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_vpn_tunnel(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("vpn_mesh::{}", stringify!(get_vpn_tunnel));
    match state.store.get_entity::<VpnTunnel>(TUNNEL_STORE_KEY, &id) {
        Ok(Some(tunnel)) => (StatusCode::OK, Json(tunnel)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "VPN tunnel not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn update_vpn_tunnel(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<CreateVpnTunnelRequest>,
) -> impl IntoResponse {
    tracing::debug!("vpn_mesh::{}", stringify!(update_vpn_tunnel));
    let existing = match state.store.get_entity::<VpnTunnel>(TUNNEL_STORE_KEY, &id) {
        Ok(Some(t)) => t,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "VPN tunnel not found" })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let tunnel = VpnTunnel {
        id: existing.id,
        name: req.name,
        description: req.description,
        interface_name: req.interface_name,
        listen_port: req.listen_port,
        address: req.address,
        private_key_ref: req.private_key_ref,
        peers: req.peers,
        enabled: req.enabled,
        created: existing.created,
        updated: Utc::now(),
    };

    if let Err(e) = state.store.save_entity(TUNNEL_STORE_KEY, &id, &tunnel) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_vpn(&state).await {
        tracing::warn!("Post-update VPN reconciliation failed: {}", e);
    }

    (StatusCode::OK, Json(tunnel)).into_response()
}

pub async fn delete_vpn_tunnel(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("vpn_mesh::{}", stringify!(delete_vpn_tunnel));
    if let Err(e) = state.store.delete_entity(TUNNEL_STORE_KEY, &id) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_vpn(&state).await {
        tracing::warn!("Post-delete VPN reconciliation failed: {}", e);
    }

    StatusCode::NO_CONTENT.into_response()
}

// ── VPN Network CRUD ────────────────────────────────────────────────

pub async fn create_vpn_network(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateVpnNetworkRequest>,
) -> impl IntoResponse {
    tracing::debug!("vpn_mesh::{}", stringify!(create_vpn_network));
    let now = Utc::now();
    let network = VpnNetwork {
        id: Uuid::new_v4(),
        name: req.name,
        description: req.description,
        selector: req.selector,
        subnet: req.subnet,
        topology: req.topology,
        listen_port: req.listen_port,
        enabled: req.enabled,
        created: now,
        updated: now,
    };

    if let Err(e) = state
        .store
        .save_entity(NETWORK_STORE_KEY, &network.id.to_string(), &network)
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_vpn(&state).await {
        tracing::warn!("Post-create VPN network reconciliation failed: {}", e);
    }

    (StatusCode::CREATED, Json(network)).into_response()
}

pub async fn list_vpn_networks(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::debug!("vpn_mesh::{}", stringify!(list_vpn_networks));
    match state.store.list_entities::<VpnNetwork>(NETWORK_STORE_KEY) {
        Ok(networks) => (StatusCode::OK, Json(networks)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_vpn_network(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("vpn_mesh::{}", stringify!(get_vpn_network));
    match state
        .store
        .get_entity::<VpnNetwork>(NETWORK_STORE_KEY, &id)
    {
        Ok(Some(network)) => (StatusCode::OK, Json(network)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "VPN network not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn update_vpn_network(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<CreateVpnNetworkRequest>,
) -> impl IntoResponse {
    tracing::debug!("vpn_mesh::{}", stringify!(update_vpn_network));
    let existing = match state
        .store
        .get_entity::<VpnNetwork>(NETWORK_STORE_KEY, &id)
    {
        Ok(Some(n)) => n,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "VPN network not found" })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let network = VpnNetwork {
        id: existing.id,
        name: req.name,
        description: req.description,
        selector: req.selector,
        subnet: req.subnet,
        topology: req.topology,
        listen_port: req.listen_port,
        enabled: req.enabled,
        created: existing.created,
        updated: Utc::now(),
    };

    if let Err(e) = state.store.save_entity(NETWORK_STORE_KEY, &id, &network) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_vpn(&state).await {
        tracing::warn!("Post-update VPN network reconciliation failed: {}", e);
    }

    (StatusCode::OK, Json(network)).into_response()
}

pub async fn delete_vpn_network(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("vpn_mesh::{}", stringify!(delete_vpn_network));
    if let Err(e) = state.store.delete_entity(NETWORK_STORE_KEY, &id) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_vpn(&state).await {
        tracing::warn!("Post-delete VPN network reconciliation failed: {}", e);
    }

    StatusCode::NO_CONTENT.into_response()
}

// ── Sync and status ─────────────────────────────────────────────────

pub async fn sync_vpn_tunnels(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::debug!("vpn_mesh::{}", stringify!(sync_vpn_tunnels));
    match reconcile_vpn(&state).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "synced" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_vpn_tunnel_status(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::debug!("vpn_mesh::{}", stringify!(get_vpn_tunnel_status));
    let tunnels: Vec<VpnTunnel> = match state.store.list_entities(TUNNEL_STORE_KEY) {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let statuses: Vec<VpnTunnelStatus> = tunnels
        .iter()
        .map(|t| VpnTunnelStatus {
            tunnel_id: t.id,
            name: t.name.clone(),
            interface_name: t.interface_name.clone(),
            peer_count: t.peers.len(),
            enforced: t.enabled,
        })
        .collect();

    (StatusCode::OK, Json(statuses)).into_response()
}

pub async fn get_vpn_network_status(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::debug!("vpn_mesh::{}", stringify!(get_vpn_network_status));
    let networks: Vec<VpnNetwork> = match state.store.list_entities(NETWORK_STORE_KEY) {
        Ok(n) => n,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let vms = build_vm_snapshots(state.as_ref());
    let statuses: Vec<VpnNetworkStatus> = networks
        .iter()
        .map(|net| {
            let matching = vms
                .iter()
                .filter(|vm| net.selector.matches(&vm.labels))
                .count();
            let interfaces = state
                .vpn_mesh
                .compiler
                .compile_network(net, &vms);

            VpnNetworkStatus {
                network_id: net.id,
                name: net.name.clone(),
                matching_vms: matching,
                generated_interfaces: interfaces.len(),
                enforced: net.enabled,
            }
        })
        .collect();

    (StatusCode::OK, Json(statuses)).into_response()
}

// ── Reconciliation ──────────────────────────────────────────────────

pub async fn reconcile_vpn(state: &AppState) -> anyhow::Result<()> {
    tracing::debug!("vpn_mesh::{}", stringify!(reconcile_vpn));
    let tunnels: Vec<VpnTunnel> = state.store.list_entities(TUNNEL_STORE_KEY)?;
    let networks: Vec<VpnNetwork> = state.store.list_entities(NETWORK_STORE_KEY)?;

    let vms = build_vm_snapshots(state);

    let enabled_tunnels: Vec<VpnTunnel> = tunnels.into_iter().filter(|t| t.enabled).collect();
    let enabled_networks: Vec<VpnNetwork> = networks.into_iter().filter(|n| n.enabled).collect();

    let interfaces = state
        .vpn_mesh
        .compiler
        .compile_all(&enabled_tunnels, &enabled_networks, &vms);

    state.vpn_mesh.enforcer.sync_all(&interfaces)?;

    tracing::info!(
        "Reconciled {} tunnels + {} networks → {} WireGuard interfaces",
        enabled_tunnels.len(),
        enabled_networks.len(),
        interfaces.len()
    );

    Ok(())
}

fn build_vm_snapshots(state: &AppState) -> Vec<VMSnapshot> {
    let vms = match state.store.list_vms() {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    vms.into_iter()
        .map(|vm| {
            VMSnapshot {
                name: vm.name,
                labels: vm.labels.clone().unwrap_or_default(),
                ip: vm.ip,
            }
        })
        .collect()
}
