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

use nat_gateway::compiler::VMSnapshot;
use nat_gateway::models::{
    CreateNatGatewayRequest, CreateNatPoolRequest, CreateNatRuleRequest, NatGatewayConfig, NatPool,
    NatRule, NatStatus,
};

use crate::server::AppState;

const RULE_STORE_KEY: &str = "nat_rules";
const POOL_STORE_KEY: &str = "nat_pools";
const GATEWAY_STORE_KEY: &str = "nat_gateways";

// ── NAT Rule CRUD ───────────────────────────────────────────────────

pub async fn create_nat_rule(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateNatRuleRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let rule = NatRule {
        id: Uuid::new_v4(),
        name: req.name,
        description: req.description,
        rule_type: req.rule_type,
        selector: req.selector,
        protocol: req.protocol,
        source_cidr: req.source_cidr,
        dest_cidr: req.dest_cidr,
        dest_port: req.dest_port,
        dest_port_end: req.dest_port_end,
        translate_to: req.translate_to,
        translate_port: req.translate_port,
        pool_id: req.pool_id,
        outbound_interface: req.outbound_interface,
        enabled: req.enabled,
        created: now,
        updated: now,
    };

    if let Err(e) = state
        .store
        .save_entity(RULE_STORE_KEY, &rule.id.to_string(), &rule)
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_nat(&state).await {
        tracing::warn!("Post-create NAT reconciliation failed: {}", e);
    }

    (StatusCode::CREATED, Json(rule)).into_response()
}

pub async fn list_nat_rules(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    match state.store.list_entities::<NatRule>(RULE_STORE_KEY) {
        Ok(rules) => (StatusCode::OK, Json(rules)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_nat_rule(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<NatRule>(RULE_STORE_KEY, &id) {
        Ok(Some(rule)) => (StatusCode::OK, Json(rule)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "NAT rule not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn update_nat_rule(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<CreateNatRuleRequest>,
) -> impl IntoResponse {
    let existing = match state.store.get_entity::<NatRule>(RULE_STORE_KEY, &id) {
        Ok(Some(r)) => r,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "NAT rule not found" })),
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

    let rule = NatRule {
        id: existing.id,
        name: req.name,
        description: req.description,
        rule_type: req.rule_type,
        selector: req.selector,
        protocol: req.protocol,
        source_cidr: req.source_cidr,
        dest_cidr: req.dest_cidr,
        dest_port: req.dest_port,
        dest_port_end: req.dest_port_end,
        translate_to: req.translate_to,
        translate_port: req.translate_port,
        pool_id: req.pool_id,
        outbound_interface: req.outbound_interface,
        enabled: req.enabled,
        created: existing.created,
        updated: Utc::now(),
    };

    if let Err(e) = state.store.save_entity(RULE_STORE_KEY, &id, &rule) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_nat(&state).await {
        tracing::warn!("Post-update NAT reconciliation failed: {}", e);
    }

    (StatusCode::OK, Json(rule)).into_response()
}

pub async fn delete_nat_rule(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(e) = state.store.delete_entity(RULE_STORE_KEY, &id) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_nat(&state).await {
        tracing::warn!("Post-delete NAT reconciliation failed: {}", e);
    }

    StatusCode::NO_CONTENT.into_response()
}

// ── NAT Pool CRUD ───────────────────────────────────────────────────

pub async fn create_nat_pool(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateNatPoolRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let pool = NatPool {
        id: Uuid::new_v4(),
        name: req.name,
        ip_ranges: req.ip_ranges,
        port_range: req.port_range,
        created: now,
        updated: now,
    };

    if let Err(e) = state
        .store
        .save_entity(POOL_STORE_KEY, &pool.id.to_string(), &pool)
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    (StatusCode::CREATED, Json(pool)).into_response()
}

pub async fn list_nat_pools(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    match state.store.list_entities::<NatPool>(POOL_STORE_KEY) {
        Ok(pools) => (StatusCode::OK, Json(pools)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_nat_pool(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<NatPool>(POOL_STORE_KEY, &id) {
        Ok(Some(pool)) => (StatusCode::OK, Json(pool)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "NAT pool not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn delete_nat_pool(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(e) = state.store.delete_entity(POOL_STORE_KEY, &id) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    StatusCode::NO_CONTENT.into_response()
}

// ── NAT Gateway CRUD ────────────────────────────────────────────────

pub async fn create_nat_gateway(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateNatGatewayRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let gw = NatGatewayConfig {
        id: Uuid::new_v4(),
        name: req.name,
        description: req.description,
        subnet: req.subnet,
        outbound_interface: req.outbound_interface,
        selector: req.selector,
        enabled: req.enabled,
        created: now,
        updated: now,
    };

    if let Err(e) = state
        .store
        .save_entity(GATEWAY_STORE_KEY, &gw.id.to_string(), &gw)
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_nat(&state).await {
        tracing::warn!("Post-create NAT gateway reconciliation failed: {}", e);
    }

    (StatusCode::CREATED, Json(gw)).into_response()
}

pub async fn list_nat_gateways(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    match state
        .store
        .list_entities::<NatGatewayConfig>(GATEWAY_STORE_KEY)
    {
        Ok(gateways) => (StatusCode::OK, Json(gateways)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_nat_gateway(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state
        .store
        .get_entity::<NatGatewayConfig>(GATEWAY_STORE_KEY, &id)
    {
        Ok(Some(gw)) => (StatusCode::OK, Json(gw)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "NAT gateway not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn delete_nat_gateway(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(e) = state.store.delete_entity(GATEWAY_STORE_KEY, &id) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_nat(&state).await {
        tracing::warn!("Post-delete NAT gateway reconciliation failed: {}", e);
    }

    StatusCode::NO_CONTENT.into_response()
}

// ── Sync and status ─────────────────────────────────────────────────

pub async fn sync_nat_rules(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    match reconcile_nat(&state).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "synced" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_nat_status(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let rules: Vec<NatRule> = match state.store.list_entities(RULE_STORE_KEY) {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let vms = build_vm_snapshots(state.as_ref());
    let statuses: Vec<NatStatus> = rules
        .iter()
        .map(|rule| {
            let matching = vms
                .iter()
                .filter(|vm| rule.selector.matches(&vm.labels))
                .count();

            NatStatus {
                rule_id: rule.id,
                name: rule.name.clone(),
                rule_type: rule.rule_type.clone(),
                matching_vms: matching,
                enforced: rule.enabled,
            }
        })
        .collect();

    (StatusCode::OK, Json(statuses)).into_response()
}

// ── Reconciliation ──────────────────────────────────────────────────

pub async fn reconcile_nat(state: &AppState) -> anyhow::Result<()> {
    let rules: Vec<NatRule> = state.store.list_entities(RULE_STORE_KEY)?;
    let gateways: Vec<NatGatewayConfig> = state.store.list_entities(GATEWAY_STORE_KEY)?;
    let pools: Vec<NatPool> = state.store.list_entities(POOL_STORE_KEY)?;

    let vms = build_vm_snapshots(state);

    let enabled_rules: Vec<NatRule> = rules.into_iter().filter(|r| r.enabled).collect();
    let enabled_gateways: Vec<NatGatewayConfig> =
        gateways.into_iter().filter(|g| g.enabled).collect();

    let compiled = state.nat_gateway.compiler.compile_all(
        &enabled_rules,
        &enabled_gateways,
        &pools,
        &vms,
    );

    state.nat_gateway.enforcer.sync_all(&compiled)?;

    tracing::info!(
        "Reconciled {} NAT rules + {} gateways → {} nftables rules",
        enabled_rules.len(),
        enabled_gateways.len(),
        compiled.len()
    );

    Ok(())
}

fn build_vm_snapshots(state: &AppState) -> Vec<VMSnapshot> {
    let vms = match state.store.list_vms() {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    vms.into_iter()
        .filter_map(|vm| {
            Some(VMSnapshot {
                name: vm.name,
                labels: vm.labels.clone().unwrap_or_default(),
                ip: vm.ip,
            })
        })
        .collect()
}
