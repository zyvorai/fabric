use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use std::sync::Arc;
use uuid::Uuid;

use crate::server::AppState;
use security::{RequireRead, RequireWrite, RequireAdmin};
use networking::models::{
    BondConfig, BridgeConfig, CreateBondRequest, CreateBridgeRequest, CreateLinkFileRequest,
    CreateMacvtapRequest, CreateNetworkFileRequest, CreatePortForwardRequest, CreateSriovRequest,
    CreateTapRequest, CreateVlanRequest, CreateVxlanRequest, LinkFileConfig, MacvtapConfig,
    NetworkFileConfig, PortForwardConfig, SriovConfig, TapConfig, VlanConfig, VxlanConfig,
};
use networking::nftables::NftManager;
use networking::NetworkdManager;

fn networkd_manager(state: &AppState) -> NetworkdManager {
    NetworkdManager::new(
        &state.config.network.networkd_config_dir,
        &state.config.network.networkd_file_prefix,
    )
}

// ============================================================================
// Bridge handlers
// ============================================================================

pub async fn list_bridges(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(list_bridges));
    let items: Vec<BridgeConfig> = state.store.list_entities("networkd_bridges").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    Json(items)
}

pub async fn create_bridge(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateBridgeRequest>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(create_bridge));
    let now = Utc::now().to_rfc3339();
    let cfg = BridgeConfig {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        stp: req.stp,
        forward_delay_sec: req.forward_delay_sec,
        hello_time_sec: req.hello_time_sec,
        max_age_sec: req.max_age_sec,
        vlan_filtering: req.vlan_filtering,
        mtu: req.mtu,
        mac_address: req.mac_address,
        addresses: req.addresses,
        gateway: req.gateway,
        dns: req.dns,
        dhcp: req.dhcp,
        created: now.clone(),
        updated: now,
    };

    let mgr = networkd_manager(&state);
    if let Err(e) = mgr.apply_bridge(&cfg) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response();
    }

    match state.store.save_entity("networkd_bridges", &cfg.id, &cfg) {
        Ok(_) => {
            if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
            (StatusCode::CREATED, Json(cfg)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_bridge(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(get_bridge));
    match state.store.get_entity::<BridgeConfig>("networkd_bridges", &id) {
        Ok(Some(b)) => Json(b).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn update_bridge(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<CreateBridgeRequest>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(update_bridge));
    let existing = match state.store.get_entity::<BridgeConfig>("networkd_bridges", &id) {
        Ok(Some(b)) => b,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let mgr = networkd_manager(&state);

    // Remove old config files if name changed
    if existing.name != req.name {
        if let Err(e) = mgr.remove_device(&existing.name) { tracing::warn!("Failed to remove device: {}", e); }
    }

    let cfg = BridgeConfig {
        id: id.clone(),
        name: req.name,
        stp: req.stp,
        forward_delay_sec: req.forward_delay_sec,
        hello_time_sec: req.hello_time_sec,
        max_age_sec: req.max_age_sec,
        vlan_filtering: req.vlan_filtering,
        mtu: req.mtu,
        mac_address: req.mac_address,
        addresses: req.addresses,
        gateway: req.gateway,
        dns: req.dns,
        dhcp: req.dhcp,
        created: existing.created,
        updated: Utc::now().to_rfc3339(),
    };

    if let Err(e) = mgr.apply_bridge(&cfg) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response();
    }

    match state.store.save_entity("networkd_bridges", &cfg.id, &cfg) {
        Ok(_) => {
            if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
            Json(cfg).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn delete_bridge(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(delete_bridge));
    let mgr = networkd_manager(&state);
    if let Ok(Some(cfg)) = state.store.get_entity::<BridgeConfig>("networkd_bridges", &id) {
        if let Err(e) = mgr.remove_device(&cfg.name) { tracing::warn!("Failed to remove device: {}", e); }
        if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
    }
    if let Err(e) = state.store.delete_entity("networkd_bridges", &id) { tracing::error!("Failed to delete entity: {}", e); }
    StatusCode::NO_CONTENT
}

// ============================================================================
// VLAN handlers
// ============================================================================

pub async fn list_vlans(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(list_vlans));
    let items: Vec<VlanConfig> = state.store.list_entities("networkd_vlans").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    Json(items)
}

pub async fn create_vlan(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateVlanRequest>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(create_vlan));
    let now = Utc::now().to_rfc3339();
    let cfg = VlanConfig {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        vlan_id: req.vlan_id,
        parent_interface: req.parent_interface,
        mtu: req.mtu,
        addresses: req.addresses,
        gateway: req.gateway,
        dns: req.dns,
        dhcp: req.dhcp,
        created: now.clone(),
        updated: now,
    };

    let mgr = networkd_manager(&state);
    if let Err(e) = mgr.apply_vlan(&cfg) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response();
    }

    match state.store.save_entity("networkd_vlans", &cfg.id, &cfg) {
        Ok(_) => {
            if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
            (StatusCode::CREATED, Json(cfg)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_vlan(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(get_vlan));
    match state.store.get_entity::<VlanConfig>("networkd_vlans", &id) {
        Ok(Some(v)) => Json(v).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn update_vlan(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<CreateVlanRequest>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(update_vlan));
    let existing = match state.store.get_entity::<VlanConfig>("networkd_vlans", &id) {
        Ok(Some(v)) => v,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let mgr = networkd_manager(&state);
    if existing.name != req.name {
        if let Err(e) = mgr.remove_device(&existing.name) { tracing::warn!("Failed to remove device: {}", e); }
    }

    let cfg = VlanConfig {
        id: id.clone(),
        name: req.name,
        vlan_id: req.vlan_id,
        parent_interface: req.parent_interface,
        mtu: req.mtu,
        addresses: req.addresses,
        gateway: req.gateway,
        dns: req.dns,
        dhcp: req.dhcp,
        created: existing.created,
        updated: Utc::now().to_rfc3339(),
    };

    if let Err(e) = mgr.apply_vlan(&cfg) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response();
    }

    match state.store.save_entity("networkd_vlans", &cfg.id, &cfg) {
        Ok(_) => {
            if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
            Json(cfg).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn delete_vlan(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(delete_vlan));
    let mgr = networkd_manager(&state);
    if let Ok(Some(cfg)) = state.store.get_entity::<VlanConfig>("networkd_vlans", &id) {
        if let Err(e) = mgr.remove_device(&cfg.name) { tracing::warn!("Failed to remove device: {}", e); }
        if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
    }
    if let Err(e) = state.store.delete_entity("networkd_vlans", &id) { tracing::error!("Failed to delete entity: {}", e); }
    StatusCode::NO_CONTENT
}

// ============================================================================
// Macvtap handlers
// ============================================================================

pub async fn list_macvtaps(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(list_macvtaps));
    let items: Vec<MacvtapConfig> = state.store.list_entities("networkd_macvtaps").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    Json(items)
}

pub async fn create_macvtap(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateMacvtapRequest>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(create_macvtap));
    let now = Utc::now().to_rfc3339();
    let mac = req.mac_address.unwrap_or_else(|| NetworkdManager::generate_mac_address());
    let cfg = MacvtapConfig {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        parent_interface: req.parent_interface,
        mode: req.mode,
        mtu: req.mtu,
        mac_address: Some(mac),
        created: now.clone(),
        updated: now,
    };

    let mgr = networkd_manager(&state);
    if let Err(e) = mgr.apply_macvtap(&cfg) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response();
    }

    match state.store.save_entity("networkd_macvtaps", &cfg.id, &cfg) {
        Ok(_) => {
            if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
            (StatusCode::CREATED, Json(cfg)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_macvtap(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(get_macvtap));
    match state.store.get_entity::<MacvtapConfig>("networkd_macvtaps", &id) {
        Ok(Some(m)) => Json(m).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_macvtap(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(delete_macvtap));
    let mgr = networkd_manager(&state);
    if let Ok(Some(cfg)) = state.store.get_entity::<MacvtapConfig>("networkd_macvtaps", &id) {
        if let Err(e) = mgr.remove_device(&cfg.name) { tracing::warn!("Failed to remove device: {}", e); }
        if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
    }
    if let Err(e) = state.store.delete_entity("networkd_macvtaps", &id) { tracing::error!("Failed to delete entity: {}", e); }
    StatusCode::NO_CONTENT
}

// ============================================================================
// Tap handlers
// ============================================================================

pub async fn list_taps(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(list_taps));
    let items: Vec<TapConfig> = state.store.list_entities("networkd_taps").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    Json(items)
}

pub async fn create_tap(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateTapRequest>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(create_tap));
    let now = Utc::now().to_rfc3339();
    let cfg = TapConfig {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        user: req.user,
        group: req.group,
        multi_queue: req.multi_queue,
        vnet_hdr: req.vnet_hdr,
        bridge: req.bridge,
        mtu: req.mtu,
        mac_address: req.mac_address,
        created: now.clone(),
        updated: now,
    };

    let mgr = networkd_manager(&state);
    if let Err(e) = mgr.apply_tap(&cfg) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response();
    }

    match state.store.save_entity("networkd_taps", &cfg.id, &cfg) {
        Ok(_) => {
            if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
            (StatusCode::CREATED, Json(cfg)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_tap(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(get_tap));
    match state.store.get_entity::<TapConfig>("networkd_taps", &id) {
        Ok(Some(t)) => Json(t).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_tap(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(delete_tap));
    let mgr = networkd_manager(&state);
    if let Ok(Some(cfg)) = state.store.get_entity::<TapConfig>("networkd_taps", &id) {
        if let Err(e) = mgr.remove_device(&cfg.name) { tracing::warn!("Failed to remove device: {}", e); }
        if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
    }
    if let Err(e) = state.store.delete_entity("networkd_taps", &id) { tracing::error!("Failed to delete entity: {}", e); }
    StatusCode::NO_CONTENT
}

// ============================================================================
// Status & control handlers
// ============================================================================

pub async fn list_links(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(list_links));
    let mgr = networkd_manager(&state);
    match mgr.list_links() {
        Ok(links) => Json(links).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_device_status(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(get_device_status));
    let mgr = networkd_manager(&state);
    match mgr.device_status(&name) {
        Ok(status) => Json(serde_json::json!({"name": name, "status": status})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn reload_networkd(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(reload_networkd));
    let mgr = networkd_manager(&state);
    match mgr.reload() {
        Ok(_) => Json(serde_json::json!({"status": "reloaded"})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn list_managed_files(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(list_managed_files));
    let mgr = networkd_manager(&state);
    match mgr.list_managed_files() {
        Ok(files) => Json(files).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

// ============================================================================
// Bond handlers
// ============================================================================

pub async fn list_bonds(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(list_bonds));
    let items: Vec<BondConfig> = state.store.list_entities("networkd_bonds").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    Json(items)
}

pub async fn create_bond(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateBondRequest>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(create_bond));
    let now = Utc::now().to_rfc3339();
    let cfg = BondConfig {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        mode: req.mode,
        mii_monitor_sec: req.mii_monitor_sec,
        up_delay_sec: req.up_delay_sec,
        down_delay_sec: req.down_delay_sec,
        lacp_rate: req.lacp_rate,
        transmit_hash_policy: req.transmit_hash_policy,
        min_links: req.min_links,
        primary_slave: req.primary_slave,
        slave_interfaces: req.slave_interfaces,
        mtu: req.mtu,
        mac_address: req.mac_address,
        addresses: req.addresses,
        gateway: req.gateway,
        dns: req.dns,
        dhcp: req.dhcp,
        routes: req.routes,
        created: now.clone(),
        updated: now,
    };

    let mgr = networkd_manager(&state);
    if let Err(e) = mgr.apply_bond(&cfg) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response();
    }

    match state.store.save_entity("networkd_bonds", &cfg.id, &cfg) {
        Ok(_) => {
            if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
            (StatusCode::CREATED, Json(cfg)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_bond(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(get_bond));
    match state.store.get_entity::<BondConfig>("networkd_bonds", &id) {
        Ok(Some(b)) => Json(b).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn update_bond(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<CreateBondRequest>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(update_bond));
    let existing = match state.store.get_entity::<BondConfig>("networkd_bonds", &id) {
        Ok(Some(b)) => b,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let mgr = networkd_manager(&state);
    if existing.name != req.name {
        if let Err(e) = mgr.remove_device(&existing.name) { tracing::warn!("Failed to remove device: {}", e); }
    }

    let cfg = BondConfig {
        id: id.clone(),
        name: req.name,
        mode: req.mode,
        mii_monitor_sec: req.mii_monitor_sec,
        up_delay_sec: req.up_delay_sec,
        down_delay_sec: req.down_delay_sec,
        lacp_rate: req.lacp_rate,
        transmit_hash_policy: req.transmit_hash_policy,
        min_links: req.min_links,
        primary_slave: req.primary_slave,
        slave_interfaces: req.slave_interfaces,
        mtu: req.mtu,
        mac_address: req.mac_address,
        addresses: req.addresses,
        gateway: req.gateway,
        dns: req.dns,
        dhcp: req.dhcp,
        routes: req.routes,
        created: existing.created,
        updated: Utc::now().to_rfc3339(),
    };

    if let Err(e) = mgr.apply_bond(&cfg) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response();
    }

    match state.store.save_entity("networkd_bonds", &cfg.id, &cfg) {
        Ok(_) => {
            if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
            Json(cfg).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn delete_bond(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(delete_bond));
    let mgr = networkd_manager(&state);
    if let Ok(Some(cfg)) = state.store.get_entity::<BondConfig>("networkd_bonds", &id) {
        if let Err(e) = mgr.remove_device(&cfg.name) { tracing::warn!("Failed to remove device: {}", e); }
        if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
    }
    if let Err(e) = state.store.delete_entity("networkd_bonds", &id) { tracing::error!("Failed to delete entity: {}", e); }
    StatusCode::NO_CONTENT
}

// ============================================================================
// Network file handlers (physical interface config)
// ============================================================================

pub async fn list_network_files(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(list_network_files));
    let items: Vec<NetworkFileConfig> = state.store.list_entities("networkd_netfiles").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    Json(items)
}

pub async fn create_network_file(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateNetworkFileRequest>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(create_network_file));
    let now = Utc::now().to_rfc3339();
    let cfg = NetworkFileConfig {
        id: Uuid::new_v4().to_string(),
        match_name: req.match_name,
        match_mac: req.match_mac,
        addresses: req.addresses,
        gateway: req.gateway,
        dns: req.dns,
        dhcp: req.dhcp,
        bridge: req.bridge,
        bond: req.bond,
        mtu: req.mtu,
        routes: req.routes,
        description: req.description,
        created: now.clone(),
        updated: now,
    };

    let mgr = networkd_manager(&state);
    if let Err(e) = mgr.apply_network_file(&cfg) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response();
    }

    match state.store.save_entity("networkd_netfiles", &cfg.id, &cfg) {
        Ok(_) => {
            if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
            (StatusCode::CREATED, Json(cfg)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_network_file(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(get_network_file));
    match state.store.get_entity::<NetworkFileConfig>("networkd_netfiles", &id) {
        Ok(Some(n)) => Json(n).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_network_file(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(delete_network_file));
    let mgr = networkd_manager(&state);
    if let Ok(Some(cfg)) = state.store.get_entity::<NetworkFileConfig>("networkd_netfiles", &id) {
        if let Err(e) = mgr.remove_device(&format!("net-{}", cfg.match_name)) { tracing::warn!("Failed to remove device: {}", e); }
        if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
    }
    if let Err(e) = state.store.delete_entity("networkd_netfiles", &id) { tracing::error!("Failed to delete entity: {}", e); }
    StatusCode::NO_CONTENT
}

// ============================================================================
// Link file handlers
// ============================================================================

pub async fn list_link_files(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(list_link_files));
    let items: Vec<LinkFileConfig> = state.store.list_entities("networkd_linkfiles").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    Json(items)
}

pub async fn create_link_file(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateLinkFileRequest>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(create_link_file));
    let now = Utc::now().to_rfc3339();
    let cfg = LinkFileConfig {
        id: Uuid::new_v4().to_string(),
        match_mac: req.match_mac,
        match_path: req.match_path,
        match_driver: req.match_driver,
        match_original_name: req.match_original_name,
        name: req.name,
        mtu: req.mtu,
        mac_address: req.mac_address,
        wake_on_lan: req.wake_on_lan,
        description: req.description,
        created: now.clone(),
        updated: now,
    };

    let mgr = networkd_manager(&state);
    if let Err(e) = mgr.apply_link_file(&cfg) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response();
    }

    match state.store.save_entity("networkd_linkfiles", &cfg.id, &cfg) {
        Ok(_) => {
            if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
            (StatusCode::CREATED, Json(cfg)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn delete_link_file(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(delete_link_file));
    let mgr = networkd_manager(&state);
    if let Ok(Some(cfg)) = state.store.get_entity::<LinkFileConfig>("networkd_linkfiles", &id) {
        let file_id = cfg.name.as_deref()
            .or(cfg.match_original_name.as_deref())
            .unwrap_or(&cfg.id);
        if let Err(e) = mgr.remove_device(&format!("link-{}", file_id)) { tracing::warn!("Failed to remove device: {}", e); }
        if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
    }
    if let Err(e) = state.store.delete_entity("networkd_linkfiles", &id) { tracing::error!("Failed to delete entity: {}", e); }
    StatusCode::NO_CONTENT
}

// ============================================================================
// Port forwarding handlers (nftables DNAT)
// ============================================================================

pub async fn list_port_forwards(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(list_port_forwards));
    let items: Vec<PortForwardConfig> = state
        .store
        .list_entities("networkd_port_forwards")
        .unwrap_or_default();
    Json(items)
}

pub async fn create_port_forward(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreatePortForwardRequest>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(create_port_forward));
    let now = Utc::now().to_rfc3339();
    let cfg = PortForwardConfig {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        protocol: req.protocol,
        host_port: req.host_port,
        guest_ip: req.guest_ip,
        guest_port: req.guest_port,
        interface: req.interface,
        enabled: req.enabled,
        description: req.description,
        created: now.clone(),
        updated: now,
    };

    if cfg.enabled {
        let nft = NftManager::new();
        if let Err(e) = nft.apply(&cfg) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response();
        }
    }

    match state
        .store
        .save_entity("networkd_port_forwards", &cfg.id, &cfg)
    {
        Ok(_) => (
            StatusCode::CREATED,
            Json(cfg),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn get_port_forward(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(get_port_forward));
    match state
        .store
        .get_entity::<PortForwardConfig>("networkd_port_forwards", &id)
    {
        Ok(Some(pf)) => Json(pf).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_port_forward(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(delete_port_forward));
    if let Ok(Some(cfg)) = state
        .store
        .get_entity::<PortForwardConfig>("networkd_port_forwards", &id)
    {
        let nft = NftManager::new();
        if let Err(e) = nft.remove(&cfg) { tracing::warn!("Failed to remove nft rule: {}", e); }
    }
    if let Err(e) = state.store.delete_entity("networkd_port_forwards", &id) { tracing::error!("Failed to delete entity: {}", e); }
    StatusCode::NO_CONTENT
}

pub async fn sync_port_forwards(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(sync_port_forwards));
    let configs: Vec<PortForwardConfig> = state
        .store
        .list_entities("networkd_port_forwards")
        .unwrap_or_default();

    let nft = NftManager::new();
    match nft.sync_all(&configs) {
        Ok(_) => Json(serde_json::json!({
            "status": "synced",
            "rules": configs.len(),
        }))
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ============================================================================
// VXLAN handlers
// ============================================================================

pub async fn list_vxlans(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(list_vxlans));
    let items: Vec<VxlanConfig> = state.store.list_entities("networkd_vxlans").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    Json(items)
}

pub async fn create_vxlan(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateVxlanRequest>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(create_vxlan));
    let now = Utc::now().to_rfc3339();
    let cfg = VxlanConfig {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        vni: req.vni,
        remote: req.remote,
        local: req.local,
        port: req.port,
        parent_interface: req.parent_interface,
        mtu: req.mtu,
        addresses: req.addresses,
        gateway: req.gateway,
        dns: req.dns,
        dhcp: req.dhcp,
        created: now.clone(),
        updated: now,
    };

    let mgr = networkd_manager(&state);
    if let Err(e) = mgr.apply_vxlan(&cfg) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response();
    }

    match state.store.save_entity("networkd_vxlans", &cfg.id, &cfg) {
        Ok(_) => {
            if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
            (StatusCode::CREATED, Json(cfg)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_vxlan(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(get_vxlan));
    match state.store.get_entity::<VxlanConfig>("networkd_vxlans", &id) {
        Ok(Some(v)) => Json(v).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_vxlan(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(delete_vxlan));
    let mgr = networkd_manager(&state);
    if let Ok(Some(cfg)) = state.store.get_entity::<VxlanConfig>("networkd_vxlans", &id) {
        if let Err(e) = mgr.remove_device(&cfg.name) { tracing::warn!("Failed to remove device: {}", e); }
        if let Err(e) = mgr.reload() { tracing::warn!("Failed to reload networkd: {}", e); }
    }
    if let Err(e) = state.store.delete_entity("networkd_vxlans", &id) { tracing::error!("Failed to delete entity: {}", e); }
    StatusCode::NO_CONTENT
}

// ============================================================================
// SR-IOV handlers
// ============================================================================

pub async fn list_sriov(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(list_sriov));
    let items: Vec<SriovConfig> = state.store.list_entities("networkd_sriov").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    Json(items)
}

pub async fn create_sriov(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateSriovRequest>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(create_sriov));
    let now = Utc::now().to_rfc3339();
    let cfg = SriovConfig {
        id: Uuid::new_v4().to_string(),
        pf_name: req.pf_name,
        num_vfs: req.num_vfs,
        vf_configs: req.vf_configs,
        created: now.clone(),
        updated: now,
    };

    let mgr = networkd_manager(&state);
    if let Err(e) = mgr.apply_sriov(&cfg) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response();
    }

    match state.store.save_entity("networkd_sriov", &cfg.id, &cfg) {
        Ok(_) => (StatusCode::CREATED, Json(cfg)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_sriov(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(get_sriov));
    match state.store.get_entity::<SriovConfig>("networkd_sriov", &id) {
        Ok(Some(s)) => Json(s).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_sriov(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(delete_sriov));
    if let Ok(Some(cfg)) = state.store.get_entity::<SriovConfig>("networkd_sriov", &id) {
        let mgr = networkd_manager(&state);
        if let Err(e) = mgr.remove_sriov(&cfg.pf_name) { tracing::warn!("Failed to remove device: {}", e); }
    }
    if let Err(e) = state.store.delete_entity("networkd_sriov", &id) { tracing::error!("Failed to delete entity: {}", e); }
    StatusCode::NO_CONTENT
}

// ============================================================================
// Scan existing configs (parser)
// ============================================================================

pub async fn scan_configs(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("networkd::{}", stringify!(scan_configs));
    let dir = std::path::Path::new(&state.config.network.networkd_config_dir);
    match networking::parser::scan_networkd_dir(dir) {
        Ok(configs) => Json(configs).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}
