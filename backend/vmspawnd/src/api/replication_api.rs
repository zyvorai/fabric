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
use replication::{
    ReplicationConfig, ReplicationHealthSummary, ReplicationInstance, ReplicationMetrics,
    ReplicationSite, ReplicationStatus,
};

// ============================================================================
// Site handlers
// ============================================================================

pub async fn list_sites(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("replication_api::{}", stringify!(list_sites));
    let items: Vec<ReplicationSite> = state.store.list_entities("replication_sites").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    Json(items)
}

pub async fn register_site(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Json(mut site): Json<ReplicationSite>,
) -> impl IntoResponse {
    tracing::debug!("replication_api::{}", stringify!(register_site));
    if site.id.is_empty() { site.id = Uuid::new_v4().to_string(); }
    let now = Utc::now();
    site.created = now;
    site.updated = now;
    match state.store.save_entity("replication_sites", &site.id, &site) {
        Ok(_) => (StatusCode::CREATED, Json(site)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn remove_site(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("replication_api::{}", stringify!(remove_site));
    if let Err(e) = state.store.delete_entity("replication_sites", &id) {
        tracing::error!("Failed to delete entity: {}", e);
    }
    StatusCode::NO_CONTENT
}

// ============================================================================
// Replication configuration handlers
// ============================================================================

pub async fn list_replications(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("replication_api::{}", stringify!(list_replications));
    let items: Vec<ReplicationConfig> = state.store.list_entities("replications").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    Json(items)
}

pub async fn configure_replication(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(mut config): Json<ReplicationConfig>,
) -> impl IntoResponse {
    tracing::debug!("replication_api::{}", stringify!(configure_replication));
    if config.id.is_empty() { config.id = Uuid::new_v4().to_string(); }
    let now = Utc::now();
    config.created = now;
    config.updated = now;
    match state.store.save_entity("replications", &config.id, &config) {
        Ok(_) => (StatusCode::CREATED, Json(config)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_replication(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("replication_api::{}", stringify!(get_replication));
    match state.store.get_entity::<ReplicationConfig>("replications", &id) {
        Ok(Some(r)) => Json(r).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn pause_replication(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("replication_api::{}", stringify!(pause_replication));
    let mut repl = match state.store.get_entity::<ReplicationConfig>("replications", &id) {
        Ok(Some(r)) => r,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    repl.status = ReplicationStatus::Paused;
    repl.updated = Utc::now();
    if let Err(e) = state.store.save_entity("replications", &repl.id, &repl) {
        tracing::error!("Failed to save entity: {}", e);
    }
    StatusCode::OK.into_response()
}

pub async fn resume_replication(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("replication_api::{}", stringify!(resume_replication));
    let mut repl = match state.store.get_entity::<ReplicationConfig>("replications", &id) {
        Ok(Some(r)) => r,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    repl.status = ReplicationStatus::Active;
    repl.updated = Utc::now();
    if let Err(e) = state.store.save_entity("replications", &repl.id, &repl) {
        tracing::error!("Failed to save entity: {}", e);
    }
    StatusCode::OK.into_response()
}

pub async fn remove_replication(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("replication_api::{}", stringify!(remove_replication));
    if let Err(e) = state.store.delete_entity("replications", &id) {
        tracing::error!("Failed to delete entity: {}", e);
    }
    StatusCode::NO_CONTENT
}

#[derive(serde::Deserialize)]
pub struct StartSyncRequest {
    pub replication_id: String,
}

pub async fn start_sync(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<StartSyncRequest>,
) -> impl IntoResponse {
    tracing::debug!("replication_api::{}", stringify!(start_sync));
    let repl = match state.store.get_entity::<ReplicationConfig>("replications", &req.replication_id) {
        Ok(Some(r)) => r,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    Json(serde_json::json!({"status": "sync_started", "replication_id": repl.id})).into_response()
}

pub async fn get_replication_metrics(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("replication_api::{}", stringify!(get_replication_metrics));
    match state.store.get_entity::<ReplicationMetrics>("replication_metrics", &id) {
        Ok(Some(m)) => Json(m).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn check_rpo_violations(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("replication_api::{}", stringify!(check_rpo_violations));
    let replications: Vec<ReplicationConfig> = state.store.list_entities("replications").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    let now = Utc::now();
    let violations: Vec<_> = replications
        .into_iter()
        .filter(|r| {
            r.status == ReplicationStatus::Active
                && r.last_sync.map_or(true, |last| (now - last).num_minutes() as u32 > r.rpo_minutes)
        })
        .collect();
    Json(violations)
}

pub async fn get_replication_health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("replication_api::{}", stringify!(get_replication_health));
    let replications: Vec<ReplicationConfig> = state.store.list_entities("replications").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    let now = Utc::now();
    let mut summary = ReplicationHealthSummary {
        total: replications.len() as u32,
        active: 0,
        paused: 0,
        error: 0,
        rpo_violations: 0,
    };
    for r in &replications {
        match r.status {
            ReplicationStatus::Active => {
                summary.active += 1;
                if r.last_sync.map_or(true, |last| (now - last).num_minutes() as u32 > r.rpo_minutes) {
                    summary.rpo_violations += 1;
                }
            }
            ReplicationStatus::Paused => summary.paused += 1,
            ReplicationStatus::Error => summary.error += 1,
            _ => {}
        }
    }
    Json(summary)
}

pub async fn list_recovery_instances(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("replication_api::{}", stringify!(list_recovery_instances));
    let items: Vec<ReplicationInstance> = state.store.list_entities("recovery_instances").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    Json(items)
}
