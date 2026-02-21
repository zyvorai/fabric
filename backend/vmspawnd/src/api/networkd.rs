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
use networking::models::{
    BridgeConfig, CreateBridgeRequest, CreateMacvtapRequest, CreateTapRequest,
    CreateVlanRequest, MacvtapConfig, TapConfig, VlanConfig,
};
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
    let items: Vec<BridgeConfig> = state.store.list_entities("networkd_bridges").unwrap_or_default();
    Json(items)
}

pub async fn create_bridge(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateBridgeRequest>,
) -> impl IntoResponse {
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
            let _ = mgr.reload();
            (StatusCode::CREATED, Json(serde_json::to_value(&cfg).unwrap())).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_bridge(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<BridgeConfig>("networkd_bridges", &id) {
        Ok(Some(b)) => Json(serde_json::to_value(&b).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn update_bridge(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<CreateBridgeRequest>,
) -> impl IntoResponse {
    let existing = match state.store.get_entity::<BridgeConfig>("networkd_bridges", &id) {
        Ok(Some(b)) => b,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let mgr = networkd_manager(&state);

    // Remove old config files if name changed
    if existing.name != req.name {
        let _ = mgr.remove_device(&existing.name);
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
            let _ = mgr.reload();
            Json(serde_json::to_value(&cfg).unwrap()).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn delete_bridge(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mgr = networkd_manager(&state);
    if let Ok(Some(cfg)) = state.store.get_entity::<BridgeConfig>("networkd_bridges", &id) {
        let _ = mgr.remove_device(&cfg.name);
        let _ = mgr.reload();
    }
    let _ = state.store.delete_entity("networkd_bridges", &id);
    StatusCode::NO_CONTENT
}

// ============================================================================
// VLAN handlers
// ============================================================================

pub async fn list_vlans(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<VlanConfig> = state.store.list_entities("networkd_vlans").unwrap_or_default();
    Json(items)
}

pub async fn create_vlan(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateVlanRequest>,
) -> impl IntoResponse {
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
            let _ = mgr.reload();
            (StatusCode::CREATED, Json(serde_json::to_value(&cfg).unwrap())).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_vlan(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<VlanConfig>("networkd_vlans", &id) {
        Ok(Some(v)) => Json(serde_json::to_value(&v).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn update_vlan(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<CreateVlanRequest>,
) -> impl IntoResponse {
    let existing = match state.store.get_entity::<VlanConfig>("networkd_vlans", &id) {
        Ok(Some(v)) => v,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let mgr = networkd_manager(&state);
    if existing.name != req.name {
        let _ = mgr.remove_device(&existing.name);
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
            let _ = mgr.reload();
            Json(serde_json::to_value(&cfg).unwrap()).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn delete_vlan(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mgr = networkd_manager(&state);
    if let Ok(Some(cfg)) = state.store.get_entity::<VlanConfig>("networkd_vlans", &id) {
        let _ = mgr.remove_device(&cfg.name);
        let _ = mgr.reload();
    }
    let _ = state.store.delete_entity("networkd_vlans", &id);
    StatusCode::NO_CONTENT
}

// ============================================================================
// Macvtap handlers
// ============================================================================

pub async fn list_macvtaps(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<MacvtapConfig> = state.store.list_entities("networkd_macvtaps").unwrap_or_default();
    Json(items)
}

pub async fn create_macvtap(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateMacvtapRequest>,
) -> impl IntoResponse {
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
            let _ = mgr.reload();
            (StatusCode::CREATED, Json(serde_json::to_value(&cfg).unwrap())).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_macvtap(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<MacvtapConfig>("networkd_macvtaps", &id) {
        Ok(Some(m)) => Json(serde_json::to_value(&m).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_macvtap(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mgr = networkd_manager(&state);
    if let Ok(Some(cfg)) = state.store.get_entity::<MacvtapConfig>("networkd_macvtaps", &id) {
        let _ = mgr.remove_device(&cfg.name);
        let _ = mgr.reload();
    }
    let _ = state.store.delete_entity("networkd_macvtaps", &id);
    StatusCode::NO_CONTENT
}

// ============================================================================
// Tap handlers
// ============================================================================

pub async fn list_taps(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<TapConfig> = state.store.list_entities("networkd_taps").unwrap_or_default();
    Json(items)
}

pub async fn create_tap(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateTapRequest>,
) -> impl IntoResponse {
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
            let _ = mgr.reload();
            (StatusCode::CREATED, Json(serde_json::to_value(&cfg).unwrap())).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_tap(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<TapConfig>("networkd_taps", &id) {
        Ok(Some(t)) => Json(serde_json::to_value(&t).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_tap(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mgr = networkd_manager(&state);
    if let Ok(Some(cfg)) = state.store.get_entity::<TapConfig>("networkd_taps", &id) {
        let _ = mgr.remove_device(&cfg.name);
        let _ = mgr.reload();
    }
    let _ = state.store.delete_entity("networkd_taps", &id);
    StatusCode::NO_CONTENT
}

// ============================================================================
// Status & control handlers
// ============================================================================

pub async fn list_links(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let mgr = networkd_manager(&state);
    match mgr.list_links() {
        Ok(links) => Json(serde_json::to_value(&links).unwrap()).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_device_status(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    let mgr = networkd_manager(&state);
    match mgr.device_status(&name) {
        Ok(status) => Json(serde_json::json!({"name": name, "status": status})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn reload_networkd(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let mgr = networkd_manager(&state);
    match mgr.reload() {
        Ok(_) => Json(serde_json::json!({"status": "reloaded"})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn list_managed_files(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let mgr = networkd_manager(&state);
    match mgr.list_managed_files() {
        Ok(files) => Json(serde_json::to_value(&files).unwrap()).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}
