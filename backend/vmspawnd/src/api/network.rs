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
use distributed_firewall::{
    CreateLoadBalancerRequest, CreateOverlayRequest, CreatePortGroupRequest, CreateRuleRequest,
    CreateSectionRequest, CreateSecurityGroupRequest, CreateSwitchRequest, DistributedSwitch,
    FirewallRule, FirewallSection, LoadBalancer, OverlayNetwork, PortGroup, SecurityGroup,
    SwitchStatus, UpdatePortGroupRequest, UpdateRuleRequest,
};

// ============================================================================
// Distributed switch handlers
// ============================================================================

pub async fn list_switches(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<DistributedSwitch> = state.store.list_entities("dist_switches").unwrap_or_default();
    Json(items)
}

pub async fn create_switch(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateSwitchRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let sw = DistributedSwitch {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        cluster_id: req.cluster_id,
        mtu: req.mtu.unwrap_or(1500),
        uplinks: req.uplinks,
        port_groups: Vec::new(),
        nioc_enabled: req.nioc_enabled.unwrap_or(false),
        status: SwitchStatus::Active,
        hosts: req.hosts,
        created_at: now,
        updated_at: now,
    };
    match state.store.save_entity("dist_switches", &sw.id, &sw) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&sw).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_switch(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<DistributedSwitch>("dist_switches", &id) {
        Ok(Some(s)) => Json(serde_json::to_value(&s).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_switch(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("dist_switches", &id);
    StatusCode::NO_CONTENT
}

// ============================================================================
// Port group handlers
// ============================================================================

pub async fn list_port_groups(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<PortGroup> = state.store.list_entities("port_groups").unwrap_or_default();
    Json(items)
}

pub async fn create_port_group(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreatePortGroupRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let pg = PortGroup {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        switch_id: req.switch_id,
        vlan_id: req.vlan_id,
        vlan_trunk: req.vlan_trunk,
        security_policy: req.security_policy.unwrap_or_default(),
        traffic_shaping: req.traffic_shaping,
        teaming_policy: req.teaming_policy,
        created_at: now,
        updated_at: now,
    };
    match state.store.save_entity("port_groups", &pg.id, &pg) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&pg).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn update_port_group(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdatePortGroupRequest>,
) -> impl IntoResponse {
    let mut pg = match state.store.get_entity::<PortGroup>("port_groups", &id) {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    if let Some(name) = req.name { pg.name = name; }
    if let Some(vlan_id) = req.vlan_id { pg.vlan_id = Some(vlan_id); }
    if let Some(vlan_trunk) = req.vlan_trunk { pg.vlan_trunk = Some(vlan_trunk); }
    if let Some(sp) = req.security_policy { pg.security_policy = sp; }
    if let Some(ts) = req.traffic_shaping { pg.traffic_shaping = Some(ts); }
    if let Some(tp) = req.teaming_policy { pg.teaming_policy = tp; }
    pg.updated_at = Utc::now();
    let _ = state.store.save_entity("port_groups", &pg.id, &pg);
    Json(serde_json::to_value(&pg).unwrap()).into_response()
}

pub async fn delete_port_group(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("port_groups", &id);
    StatusCode::NO_CONTENT
}

// ============================================================================
// Firewall section and rule handlers
// ============================================================================

pub async fn list_firewall_sections(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<FirewallSection> = state.store.list_entities("firewall_sections").unwrap_or_default();
    Json(items)
}

pub async fn create_firewall_section(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateSectionRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let section = FirewallSection {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        priority: req.priority,
        rules: Vec::new(),
        created_at: now,
        updated_at: now,
    };
    match state.store.save_entity("firewall_sections", &section.id, &section) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&section).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn list_firewall_rules(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<FirewallRule> = state.store.list_entities("firewall_rules").unwrap_or_default();
    Json(items)
}

pub async fn create_firewall_rule(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateRuleRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let rule = FirewallRule {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        section_id: req.section_id,
        priority: req.priority,
        action: req.action,
        direction: req.direction,
        protocol: req.protocol,
        source: req.source,
        destination: req.destination,
        port_range: req.port_range,
        enabled: req.enabled.unwrap_or(true),
        logged: req.logged.unwrap_or(false),
        hit_count: 0,
        created_at: now,
        updated_at: now,
    };
    match state.store.save_entity("firewall_rules", &rule.id, &rule) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&rule).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_firewall_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<FirewallRule>("firewall_rules", &id) {
        Ok(Some(r)) => Json(serde_json::to_value(&r).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn update_firewall_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateRuleRequest>,
) -> impl IntoResponse {
    let mut rule = match state.store.get_entity::<FirewallRule>("firewall_rules", &id) {
        Ok(Some(r)) => r,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    if let Some(name) = req.name { rule.name = name; }
    if let Some(priority) = req.priority { rule.priority = priority; }
    if let Some(action) = req.action { rule.action = action; }
    if let Some(direction) = req.direction { rule.direction = direction; }
    if req.protocol.is_some() { rule.protocol = req.protocol; }
    if let Some(source) = req.source { rule.source = source; }
    if let Some(destination) = req.destination { rule.destination = destination; }
    if req.port_range.is_some() { rule.port_range = req.port_range; }
    if let Some(enabled) = req.enabled { rule.enabled = enabled; }
    if let Some(logged) = req.logged { rule.logged = logged; }
    rule.updated_at = Utc::now();
    let _ = state.store.save_entity("firewall_rules", &rule.id, &rule);
    Json(serde_json::to_value(&rule).unwrap()).into_response()
}

pub async fn delete_firewall_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("firewall_rules", &id);
    StatusCode::NO_CONTENT
}

// ============================================================================
// Security group handlers
// ============================================================================

pub async fn list_security_groups(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<SecurityGroup> = state.store.list_entities("security_groups").unwrap_or_default();
    Json(items)
}

pub async fn create_security_group(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateSecurityGroupRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let sg = SecurityGroup {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        description: req.description,
        members: Vec::new(),
        rules: Vec::new(),
        created_at: now,
        updated_at: now,
    };
    match state.store.save_entity("security_groups", &sg.id, &sg) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&sg).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

// ============================================================================
// Overlay network handlers
// ============================================================================

pub async fn list_overlays(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<OverlayNetwork> = state.store.list_entities("overlays").unwrap_or_default();
    Json(items)
}

pub async fn create_overlay(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateOverlayRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let overlay = OverlayNetwork {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        vni: req.vni,
        network_type: req.network_type,
        subnet: req.subnet,
        gateway: req.gateway,
        tunnel_endpoints: Vec::new(),
        arp_suppression: req.arp_suppression.unwrap_or(false),
        created_at: now,
        updated_at: now,
    };
    match state.store.save_entity("overlays", &overlay.id, &overlay) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&overlay).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_overlay(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<OverlayNetwork>("overlays", &id) {
        Ok(Some(o)) => Json(serde_json::to_value(&o).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_overlay(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("overlays", &id);
    StatusCode::NO_CONTENT
}

// ============================================================================
// Load balancer handlers
// ============================================================================

pub async fn list_load_balancers(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<LoadBalancer> = state.store.list_entities("load_balancers").unwrap_or_default();
    Json(items)
}

pub async fn create_load_balancer(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateLoadBalancerRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let lb = LoadBalancer {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        vip: req.vip,
        port: req.port,
        algorithm: req.algorithm,
        members: Vec::new(),
        health_check: req.health_check.unwrap_or_default(),
        status: distributed_firewall::LbStatus::Active,
        created_at: now,
        updated_at: now,
    };
    match state.store.save_entity("load_balancers", &lb.id, &lb) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&lb).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_load_balancer(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<LoadBalancer>("load_balancers", &id) {
        Ok(Some(lb)) => Json(serde_json::to_value(&lb).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_load_balancer(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("load_balancers", &id);
    StatusCode::NO_CONTENT
}
