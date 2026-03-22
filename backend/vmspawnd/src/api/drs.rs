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
use predictive_drs::{
    AffinityRule, DrsConfig, HostSnapshot, MigrationRecommendation,
    PlacementRequest, VmSnapshot,
};

pub async fn configure_drs(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(config): Json<DrsConfig>,
) -> impl IntoResponse {
    tracing::debug!("drs::{}", stringify!(configure_drs));
    match state.store.save_entity("drs_configs", &config.cluster_id, &config) {
        Ok(_) => (StatusCode::OK, Json(config)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_drs_config(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(cluster_id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("drs::{}", stringify!(get_drs_config));
    match state.store.get_entity::<DrsConfig>("drs_configs", &cluster_id) {
        Ok(Some(c)) => Json(c).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn compute_placement(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Json(req): Json<PlacementRequest>,
) -> impl IntoResponse {
    tracing::debug!("drs::{}", stringify!(compute_placement));
    let mgr = predictive_drs::DrsManager::new();
    let hosts: Vec<HostSnapshot> = state.store.list_entities("host_snapshots").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    match mgr.compute_placement(&hosts, &req) {
        Ok(result) => Json(result).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

#[derive(serde::Deserialize)]
pub struct BalanceRequest {
    pub hosts: Vec<HostSnapshot>,
}

pub async fn analyze_balance(
    RequireRead(_claims): RequireRead,
    State(_state): State<Arc<AppState>>,
    Json(req): Json<BalanceRequest>,
) -> impl IntoResponse {
    tracing::debug!("drs::{}", stringify!(analyze_balance));
    let mgr = predictive_drs::DrsManager::new();
    let balance = mgr.analyze_cluster_balance(&req.hosts);
    Json(balance)
}

#[derive(serde::Deserialize)]
pub struct RecommendationRequest {
    pub cluster_id: String,
    pub hosts: Vec<HostSnapshot>,
    pub vms: Vec<VmSnapshot>,
}

pub async fn generate_recommendations(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Json(req): Json<RecommendationRequest>,
) -> impl IntoResponse {
    tracing::debug!("drs::{}", stringify!(generate_recommendations));
    let mgr = predictive_drs::DrsManager::new();
    let recs = mgr.generate_recommendations(&req.cluster_id, &req.hosts, &req.vms);
    for rec in &recs {
        if let Err(e) = state.store.save_entity("drs_recommendations", &rec.id, rec) {
            tracing::error!("Failed to save entity: {}", e);
        }
    }
    Json(recs)
}

pub async fn list_recommendations(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::debug!("drs::{}", stringify!(list_recommendations));
    let items: Vec<MigrationRecommendation> = state.store.list_entities("drs_recommendations").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    Json(items)
}

pub async fn approve_recommendation(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("drs::{}", stringify!(approve_recommendation));
    let mut rec = match state.store.get_entity::<MigrationRecommendation>("drs_recommendations", &id) {
        Ok(Some(r)) => r,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    rec.status = predictive_drs::RecommendationStatus::Approved;
    if let Err(e) = state.store.save_entity("drs_recommendations", &rec.id, &rec) {
        tracing::error!("Failed to save entity: {}", e);
    }
    Json(rec).into_response()
}

pub async fn reject_recommendation(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("drs::{}", stringify!(reject_recommendation));
    let mut rec = match state.store.get_entity::<MigrationRecommendation>("drs_recommendations", &id) {
        Ok(Some(r)) => r,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    rec.status = predictive_drs::RecommendationStatus::Rejected;
    if let Err(e) = state.store.save_entity("drs_recommendations", &rec.id, &rec) {
        tracing::error!("Failed to save entity: {}", e);
    }
    StatusCode::OK.into_response()
}

// ============================================================================
// Affinity rules
// ============================================================================

pub async fn list_affinity_rules(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("drs::{}", stringify!(list_affinity_rules));
    let items: Vec<AffinityRule> = state.store.list_entities("affinity_rules").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    Json(items)
}

pub async fn create_affinity_rule(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(mut rule): Json<AffinityRule>,
) -> impl IntoResponse {
    tracing::debug!("drs::{}", stringify!(create_affinity_rule));
    if rule.id.is_empty() {
        rule.id = Uuid::new_v4().to_string();
    }
    rule.created = Utc::now();
    rule.updated = Utc::now();
    match state.store.save_entity("affinity_rules", &rule.id, &rule) {
        Ok(_) => (StatusCode::CREATED, Json(rule)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_affinity_rule(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("drs::{}", stringify!(get_affinity_rule));
    match state.store.get_entity::<AffinityRule>("affinity_rules", &id) {
        Ok(Some(r)) => Json(r).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn update_affinity_rule(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(mut rule): Json<AffinityRule>,
) -> impl IntoResponse {
    tracing::debug!("drs::{}", stringify!(update_affinity_rule));
    rule.id = id.clone();
    rule.updated = Utc::now();
    if let Err(e) = state.store.save_entity("affinity_rules", &id, &rule) {
        tracing::error!("Failed to save entity: {}", e);
    }
    Json(rule)
}

pub async fn delete_affinity_rule(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("drs::{}", stringify!(delete_affinity_rule));
    if let Err(e) = state.store.delete_entity("affinity_rules", &id) {
        tracing::error!("Failed to delete entity: {}", e);
    }
    StatusCode::NO_CONTENT
}
