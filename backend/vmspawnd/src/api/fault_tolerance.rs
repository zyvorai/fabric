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
use fault_tolerance::{
    FailoverResult, FtCompatibility, FtConfig, FtEvent, FtMetrics, FtStatus, ReplicationState,
};

#[derive(serde::Deserialize)]
pub struct EnableFtRequest {
    pub vm_name: String,
    pub primary_host_id: String,
    pub secondary_host_id: String,
}

pub async fn enable_ft(
    State(state): State<Arc<AppState>>,
    Json(req): Json<EnableFtRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let config = FtConfig {
        vm_name: req.vm_name.clone(),
        primary_host_id: req.primary_host_id,
        secondary_host_id: req.secondary_host_id,
        status: FtStatus::Enabled,
        replication_state: ReplicationState::Syncing,
        bandwidth_limit_mbps: None,
        last_sync: None,
        failover_count: 0,
        created: now,
        updated: now,
    };
    match state.store.save_entity("ft_configs", &req.vm_name, &config) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&config).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn disable_ft(
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("ft_configs", &vm_name);
    let _ = state.store.delete_entity("ft_metrics", &vm_name);
    StatusCode::NO_CONTENT
}

pub async fn get_ft_config(
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<FtConfig>("ft_configs", &vm_name) {
        Ok(Some(c)) => Json(serde_json::to_value(&c).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn list_ft_vms(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<FtConfig> = state.store.list_entities("ft_configs").unwrap_or_default();
    Json(items)
}

#[derive(serde::Deserialize)]
pub struct CompatibilityRequest {
    pub vm_name: String,
    pub cpus: u32,
    pub memory_mb: u64,
}

pub async fn check_ft_compatibility(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<CompatibilityRequest>,
) -> impl IntoResponse {
    let mgr = fault_tolerance::FaultToleranceManager::new();
    let compat = mgr.check_compatibility(&req.vm_name, req.cpus, req.memory_mb);
    Json(serde_json::to_value(&compat).unwrap())
}

pub async fn trigger_failover(
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    let mut config = match state.store.get_entity::<FtConfig>("ft_configs", &vm_name) {
        Ok(Some(c)) => c,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let old_primary = config.primary_host_id.clone();
    let new_primary = config.secondary_host_id.clone();
    config.primary_host_id = new_primary.clone();
    config.secondary_host_id = String::new();
    config.status = FtStatus::NeedSecondary;
    config.replication_state = ReplicationState::OutOfSync;
    config.failover_count += 1;
    config.updated = Utc::now();
    let _ = state.store.save_entity("ft_configs", &vm_name, &config);
    let result = FailoverResult {
        vm_name,
        old_primary,
        new_primary,
        downtime_ms: 0,
        data_loss: false,
        success: true,
        error: None,
    };
    Json(serde_json::to_value(&result).unwrap()).into_response()
}

pub async fn test_failover(
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    let config = match state.store.get_entity::<FtConfig>("ft_configs", &vm_name) {
        Ok(Some(c)) => c,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let result = FailoverResult {
        vm_name,
        old_primary: config.primary_host_id,
        new_primary: config.secondary_host_id,
        downtime_ms: 0,
        data_loss: false,
        success: true,
        error: None,
    };
    Json(serde_json::to_value(&result).unwrap()).into_response()
}

pub async fn suspend_replication(
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    let mut config = match state.store.get_entity::<FtConfig>("ft_configs", &vm_name) {
        Ok(Some(c)) => c,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    config.replication_state = ReplicationState::Suspended;
    config.updated = Utc::now();
    let _ = state.store.save_entity("ft_configs", &vm_name, &config);
    StatusCode::OK.into_response()
}

pub async fn resume_replication(
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    let mut config = match state.store.get_entity::<FtConfig>("ft_configs", &vm_name) {
        Ok(Some(c)) => c,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    config.replication_state = ReplicationState::Syncing;
    config.updated = Utc::now();
    let _ = state.store.save_entity("ft_configs", &vm_name, &config);
    StatusCode::OK.into_response()
}

pub async fn get_ft_metrics(
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<FtMetrics>("ft_metrics", &vm_name) {
        Ok(Some(m)) => Json(serde_json::to_value(&m).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn get_ft_events(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<FtEvent> = state.store.list_entities("ft_events").unwrap_or_default();
    Json(items)
}
