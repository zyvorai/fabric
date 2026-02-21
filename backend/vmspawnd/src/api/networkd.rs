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

// ============================================================================
// Bond handlers
// ============================================================================

pub async fn list_bonds(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<BondConfig> = state.store.list_entities("networkd_bonds").unwrap_or_default();
    Json(items)
}

pub async fn create_bond(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateBondRequest>,
) -> impl IntoResponse {
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
            let _ = mgr.reload();
            (StatusCode::CREATED, Json(serde_json::to_value(&cfg).unwrap())).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_bond(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<BondConfig>("networkd_bonds", &id) {
        Ok(Some(b)) => Json(serde_json::to_value(&b).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn update_bond(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<CreateBondRequest>,
) -> impl IntoResponse {
    let existing = match state.store.get_entity::<BondConfig>("networkd_bonds", &id) {
        Ok(Some(b)) => b,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let mgr = networkd_manager(&state);
    if existing.name != req.name {
        let _ = mgr.remove_device(&existing.name);
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
            let _ = mgr.reload();
            Json(serde_json::to_value(&cfg).unwrap()).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn delete_bond(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mgr = networkd_manager(&state);
    if let Ok(Some(cfg)) = state.store.get_entity::<BondConfig>("networkd_bonds", &id) {
        let _ = mgr.remove_device(&cfg.name);
        let _ = mgr.reload();
    }
    let _ = state.store.delete_entity("networkd_bonds", &id);
    StatusCode::NO_CONTENT
}

// ============================================================================
// Network file handlers (physical interface config)
// ============================================================================

pub async fn list_network_files(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<NetworkFileConfig> = state.store.list_entities("networkd_netfiles").unwrap_or_default();
    Json(items)
}

pub async fn create_network_file(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateNetworkFileRequest>,
) -> impl IntoResponse {
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
            let _ = mgr.reload();
            (StatusCode::CREATED, Json(serde_json::to_value(&cfg).unwrap())).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_network_file(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<NetworkFileConfig>("networkd_netfiles", &id) {
        Ok(Some(n)) => Json(serde_json::to_value(&n).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_network_file(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mgr = networkd_manager(&state);
    if let Ok(Some(cfg)) = state.store.get_entity::<NetworkFileConfig>("networkd_netfiles", &id) {
        let _ = mgr.remove_device(&format!("net-{}", cfg.match_name));
        let _ = mgr.reload();
    }
    let _ = state.store.delete_entity("networkd_netfiles", &id);
    StatusCode::NO_CONTENT
}

// ============================================================================
// Link file handlers
// ============================================================================

pub async fn list_link_files(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<LinkFileConfig> = state.store.list_entities("networkd_linkfiles").unwrap_or_default();
    Json(items)
}

pub async fn create_link_file(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateLinkFileRequest>,
) -> impl IntoResponse {
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
            let _ = mgr.reload();
            (StatusCode::CREATED, Json(serde_json::to_value(&cfg).unwrap())).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn delete_link_file(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mgr = networkd_manager(&state);
    if let Ok(Some(cfg)) = state.store.get_entity::<LinkFileConfig>("networkd_linkfiles", &id) {
        let file_id = cfg.name.as_deref()
            .or(cfg.match_original_name.as_deref())
            .unwrap_or(&cfg.id);
        let _ = mgr.remove_device(&format!("link-{}", file_id));
        let _ = mgr.reload();
    }
    let _ = state.store.delete_entity("networkd_linkfiles", &id);
    StatusCode::NO_CONTENT
}

// ============================================================================
// Port forwarding handlers (nftables DNAT)
// ============================================================================

pub async fn list_port_forwards(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<PortForwardConfig> = state
        .store
        .list_entities("networkd_port_forwards")
        .unwrap_or_default();
    Json(items)
}

pub async fn create_port_forward(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreatePortForwardRequest>,
) -> impl IntoResponse {
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
            Json(serde_json::to_value(&cfg).unwrap()),
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
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state
        .store
        .get_entity::<PortForwardConfig>("networkd_port_forwards", &id)
    {
        Ok(Some(pf)) => Json(serde_json::to_value(&pf).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_port_forward(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Ok(Some(cfg)) = state
        .store
        .get_entity::<PortForwardConfig>("networkd_port_forwards", &id)
    {
        let nft = NftManager::new();
        let _ = nft.remove(&cfg);
    }
    let _ = state.store.delete_entity("networkd_port_forwards", &id);
    StatusCode::NO_CONTENT
}

pub async fn sync_port_forwards(State(state): State<Arc<AppState>>) -> impl IntoResponse {
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
    let items: Vec<VxlanConfig> = state.store.list_entities("networkd_vxlans").unwrap_or_default();
    Json(items)
}

pub async fn create_vxlan(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateVxlanRequest>,
) -> impl IntoResponse {
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
            let _ = mgr.reload();
            (StatusCode::CREATED, Json(serde_json::to_value(&cfg).unwrap())).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_vxlan(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<VxlanConfig>("networkd_vxlans", &id) {
        Ok(Some(v)) => Json(serde_json::to_value(&v).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_vxlan(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mgr = networkd_manager(&state);
    if let Ok(Some(cfg)) = state.store.get_entity::<VxlanConfig>("networkd_vxlans", &id) {
        let _ = mgr.remove_device(&cfg.name);
        let _ = mgr.reload();
    }
    let _ = state.store.delete_entity("networkd_vxlans", &id);
    StatusCode::NO_CONTENT
}

// ============================================================================
// SR-IOV handlers
// ============================================================================

pub async fn list_sriov(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<SriovConfig> = state.store.list_entities("networkd_sriov").unwrap_or_default();
    Json(items)
}

pub async fn create_sriov(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateSriovRequest>,
) -> impl IntoResponse {
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
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&cfg).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_sriov(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<SriovConfig>("networkd_sriov", &id) {
        Ok(Some(s)) => Json(serde_json::to_value(&s).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_sriov(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Ok(Some(cfg)) = state.store.get_entity::<SriovConfig>("networkd_sriov", &id) {
        let mgr = networkd_manager(&state);
        let _ = mgr.remove_sriov(&cfg.pf_name);
    }
    let _ = state.store.delete_entity("networkd_sriov", &id);
    StatusCode::NO_CONTENT
}

// ============================================================================
// Scan existing configs (parser)
// ============================================================================

pub async fn scan_configs(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let dir = std::path::Path::new(&state.config.network.networkd_config_dir);
    match networking::parser::scan_networkd_dir(dir) {
        Ok(configs) => Json(serde_json::to_value(&configs).unwrap()).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}
