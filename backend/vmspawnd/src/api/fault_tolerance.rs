use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use std::sync::Arc;
use crate::server::AppState;
use security::{RequireRead, RequireWrite};
use fault_tolerance::{
    FailoverResult, FtConfig, FtEvent, FtMetrics, FtStatus, ReplicationState,
};

#[derive(serde::Deserialize)]
pub struct EnableFtRequest {
    pub vm_name: String,
    pub primary_host_id: String,
    pub secondary_host_id: String,
}

pub async fn enable_ft(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<EnableFtRequest>,
) -> impl IntoResponse {
    tracing::debug!("fault_tolerance::{}", stringify!(enable_ft));
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
        lock_lease_id: None,
        zfs_dataset: None,
        zfs_last_replicated_snap: None,
        fence_token: None,
    };
    match state.store.save_entity("ft_configs", &req.vm_name, &config) {
        Ok(_) => (StatusCode::CREATED, Json(config)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn disable_ft(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("fault_tolerance::{}", stringify!(disable_ft));
    if let Err(e) = state.store.delete_entity("ft_configs", &vm_name) {
        tracing::error!("Failed to delete entity: {}", e);
    }
    if let Err(e) = state.store.delete_entity("ft_metrics", &vm_name) {
        tracing::error!("Failed to delete entity: {}", e);
    }
    StatusCode::NO_CONTENT
}

pub async fn get_ft_config(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("fault_tolerance::{}", stringify!(get_ft_config));
    match state.store.get_entity::<FtConfig>("ft_configs", &vm_name) {
        Ok(Some(c)) => Json(c).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn list_ft_vms(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("fault_tolerance::{}", stringify!(list_ft_vms));
    let items: Vec<FtConfig> = state.store.list_entities("ft_configs").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    Json(items)
}

#[derive(serde::Deserialize)]
pub struct CompatibilityRequest {
    pub vm_name: String,
    pub cpus: u32,
    pub memory_mb: u64,
}

pub async fn check_ft_compatibility(
    RequireRead(_claims): RequireRead,
    State(_state): State<Arc<AppState>>,
    Json(req): Json<CompatibilityRequest>,
) -> impl IntoResponse {
    tracing::debug!("fault_tolerance::{}", stringify!(check_ft_compatibility));
    let mgr = fault_tolerance::FaultToleranceManager::new();
    let compat = mgr.check_compatibility(&req.vm_name, req.cpus, req.memory_mb);
    Json(compat)
}

pub async fn trigger_failover(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("fault_tolerance::{}", stringify!(trigger_failover));
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
    if let Err(e) = state.store.save_entity("ft_configs", &vm_name, &config) {
        tracing::error!("Failed to save entity: {}", e);
    }
    let result = FailoverResult {
        vm_name,
        old_primary,
        new_primary,
        downtime_ms: 0,
        data_loss: false,
        success: true,
        error: None,
        fence_method: None,
        storage_promoted: false,
        replication_lag_secs: None,
    };
    Json(result).into_response()
}

pub async fn test_failover(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("fault_tolerance::{}", stringify!(test_failover));
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
        fence_method: None,
        storage_promoted: false,
        replication_lag_secs: None,
    };
    Json(result).into_response()
}

pub async fn suspend_replication(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("fault_tolerance::{}", stringify!(suspend_replication));
    let mut config = match state.store.get_entity::<FtConfig>("ft_configs", &vm_name) {
        Ok(Some(c)) => c,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    config.replication_state = ReplicationState::Suspended;
    config.updated = Utc::now();
    if let Err(e) = state.store.save_entity("ft_configs", &vm_name, &config) {
        tracing::error!("Failed to save entity: {}", e);
    }
    StatusCode::OK.into_response()
}

pub async fn resume_replication(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("fault_tolerance::{}", stringify!(resume_replication));
    let mut config = match state.store.get_entity::<FtConfig>("ft_configs", &vm_name) {
        Ok(Some(c)) => c,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    config.replication_state = ReplicationState::Syncing;
    config.updated = Utc::now();
    if let Err(e) = state.store.save_entity("ft_configs", &vm_name, &config) {
        tracing::error!("Failed to save entity: {}", e);
    }
    StatusCode::OK.into_response()
}

pub async fn get_ft_metrics(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("fault_tolerance::{}", stringify!(get_ft_metrics));
    match state.store.get_entity::<FtMetrics>("ft_metrics", &vm_name) {
        Ok(Some(m)) => Json(m).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn get_ft_events(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    tracing::debug!("fault_tolerance::{}", stringify!(get_ft_events));
    let items: Vec<FtEvent> = state.store.list_entities("ft_events").unwrap_or_else(|e| { tracing::warn!("Failed to load data: {}", e); Vec::new() });
    Json(items)
}
