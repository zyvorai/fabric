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
use resource_pools::{
    AdmissionControlResult, CreateResourcePoolRequest, CpuShares, MemoryShares, ResourcePool,
    ResourcePoolSummary, UpdateResourcePoolRequest,
};

pub async fn list_pools(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<ResourcePool> = state.store.list_entities("resource_pools").unwrap_or_default();
    Json(items)
}

pub async fn create_pool(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateResourcePoolRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let pool = ResourcePool {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        parent_id: req.parent_id,
        cluster_id: req.cluster_id,
        cpu_shares: req.cpu_shares,
        cpu_reservation_mhz: req.cpu_reservation_mhz,
        cpu_limit_mhz: req.cpu_limit_mhz,
        cpu_expandable_reservation: req.cpu_expandable_reservation,
        memory_shares: req.memory_shares,
        memory_reservation_mb: req.memory_reservation_mb,
        memory_limit_mb: req.memory_limit_mb,
        memory_expandable_reservation: req.memory_expandable_reservation,
        vms: Vec::new(),
        children: Vec::new(),
        created: now,
        updated: None,
    };
    match state.store.save_entity("resource_pools", &pool.id, &pool) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&pool).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_pool(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<ResourcePool>("resource_pools", &id) {
        Ok(Some(p)) => Json(serde_json::to_value(&p).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn update_pool(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateResourcePoolRequest>,
) -> impl IntoResponse {
    let mut pool = match state.store.get_entity::<ResourcePool>("resource_pools", &id) {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    if let Some(name) = req.name { pool.name = name; }
    if let Some(shares) = req.cpu_shares { pool.cpu_shares = shares; }
    if let Some(v) = req.cpu_reservation_mhz { pool.cpu_reservation_mhz = v; }
    if let Some(v) = req.cpu_limit_mhz { pool.cpu_limit_mhz = v; }
    if let Some(v) = req.cpu_expandable_reservation { pool.cpu_expandable_reservation = v; }
    if let Some(shares) = req.memory_shares { pool.memory_shares = shares; }
    if let Some(v) = req.memory_reservation_mb { pool.memory_reservation_mb = v; }
    if let Some(v) = req.memory_limit_mb { pool.memory_limit_mb = v; }
    if let Some(v) = req.memory_expandable_reservation { pool.memory_expandable_reservation = v; }
    pool.updated = Some(Utc::now());
    let _ = state.store.save_entity("resource_pools", &pool.id, &pool);
    Json(serde_json::to_value(&pool).unwrap()).into_response()
}

pub async fn delete_pool(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("resource_pools", &id);
    StatusCode::NO_CONTENT
}

pub async fn get_pool_summary(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let pool = match state.store.get_entity::<ResourcePool>("resource_pools", &id) {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let summary = ResourcePoolSummary {
        id: pool.id.clone(),
        name: pool.name.clone(),
        parent_id: pool.parent_id.clone(),
        cluster_id: pool.cluster_id.clone(),
        cpu_reservation_mhz: pool.cpu_reservation_mhz,
        cpu_limit_mhz: pool.cpu_limit_mhz,
        cpu_used_mhz: 0,
        memory_reservation_mb: pool.memory_reservation_mb,
        memory_limit_mb: pool.memory_limit_mb,
        memory_used_mb: 0,
        vm_count: pool.vms.len(),
        child_pool_count: pool.children.len(),
    };
    Json(serde_json::to_value(&summary).unwrap()).into_response()
}

#[derive(serde::Deserialize)]
pub struct VmAssignment {
    pub vm_name: String,
}

pub async fn assign_vm(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<VmAssignment>,
) -> impl IntoResponse {
    let mut pool = match state.store.get_entity::<ResourcePool>("resource_pools", &id) {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    if pool.vms.contains(&req.vm_name) {
        return (StatusCode::CONFLICT, Json(serde_json::json!({"error": "VM already assigned"}))).into_response();
    }
    pool.vms.push(req.vm_name);
    pool.updated = Some(Utc::now());
    let _ = state.store.save_entity("resource_pools", &pool.id, &pool);
    StatusCode::OK.into_response()
}

pub async fn unassign_vm(
    State(state): State<Arc<AppState>>,
    Path((id, vm_name)): Path<(String, String)>,
) -> impl IntoResponse {
    let mut pool = match state.store.get_entity::<ResourcePool>("resource_pools", &id) {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    pool.vms.retain(|v| v != &vm_name);
    pool.updated = Some(Utc::now());
    let _ = state.store.save_entity("resource_pools", &pool.id, &pool);
    StatusCode::OK.into_response()
}

#[derive(serde::Deserialize)]
pub struct MoveVmRequest {
    pub vm_name: String,
    pub target_pool_id: String,
}

pub async fn move_vm(
    State(state): State<Arc<AppState>>,
    Path(from_id): Path<String>,
    Json(req): Json<MoveVmRequest>,
) -> impl IntoResponse {
    let mut src = match state.store.get_entity::<ResourcePool>("resource_pools", &from_id) {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let mut dst = match state.store.get_entity::<ResourcePool>("resource_pools", &req.target_pool_id) {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    src.vms.retain(|v| v != &req.vm_name);
    dst.vms.push(req.vm_name);
    let now = Some(Utc::now());
    src.updated = now;
    dst.updated = now;
    let _ = state.store.save_entity("resource_pools", &src.id, &src);
    let _ = state.store.save_entity("resource_pools", &dst.id, &dst);
    StatusCode::OK.into_response()
}

#[derive(serde::Deserialize)]
pub struct AdmissionCheckRequest {
    pub cpu_mhz: u64,
    pub memory_mb: u64,
}

pub async fn check_admission(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<AdmissionCheckRequest>,
) -> impl IntoResponse {
    let pool = match state.store.get_entity::<ResourcePool>("resource_pools", &id) {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let avail_cpu = pool.cpu_limit_mhz.unwrap_or(pool.cpu_reservation_mhz);
    let avail_mem = pool.memory_limit_mb.unwrap_or(pool.memory_reservation_mb);
    let allowed = req.cpu_mhz <= avail_cpu && req.memory_mb <= avail_mem;
    let result = AdmissionControlResult {
        allowed,
        reason: if allowed { None } else { Some("Insufficient resources".to_string()) },
        available_cpu_mhz: avail_cpu,
        available_memory_mb: avail_mem,
    };
    Json(serde_json::to_value(&result).unwrap()).into_response()
}
