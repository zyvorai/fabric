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
use distributed_storage::{
    ComplianceReport, CreateDatastoreClusterRequest, CreatePoolRequest, DatastoreCluster,
    DistributedStoragePool, MigrationStatus, PoolHealth, PoolHealthReport, PoolStatus,
    StorageHost, StorageMigration, StoragePolicy, StorageTier,
};

// ============================================================================
// Storage pool handlers
// ============================================================================

pub async fn list_storage_pools(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<DistributedStoragePool> = state.store.list_entities("dist_storage_pools").unwrap_or_default();
    Json(items)
}

pub async fn create_storage_pool(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreatePoolRequest>,
) -> impl IntoResponse {
    let total_capacity_gb: u64 = req.hosts.iter().flat_map(|h| h.disks.iter()).map(|d| d.capacity_gb).sum();
    let now = Utc::now();
    let pool = DistributedStoragePool {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        cluster_id: req.cluster_id,
        hosts: req.hosts,
        replication_factor: req.replication_factor,
        erasure_coding: req.erasure_coding,
        fault_domains: req.fault_domains,
        total_capacity_gb,
        used_capacity_gb: 0,
        free_capacity_gb: total_capacity_gb,
        status: PoolStatus::Online,
        health: PoolHealth::Healthy,
        created: now,
        updated: now,
    };
    match state.store.save_entity("dist_storage_pools", &pool.id, &pool) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&pool).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_storage_pool(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<DistributedStoragePool>("dist_storage_pools", &id) {
        Ok(Some(p)) => Json(serde_json::to_value(&p).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_storage_pool(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("dist_storage_pools", &id);
    StatusCode::NO_CONTENT
}

pub async fn add_storage_host(
    State(state): State<Arc<AppState>>,
    Path(pool_id): Path<String>,
    Json(host): Json<StorageHost>,
) -> impl IntoResponse {
    let mut pool = match state.store.get_entity::<DistributedStoragePool>("dist_storage_pools", &pool_id) {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let added_capacity: u64 = host.disks.iter().map(|d| d.capacity_gb).sum();
    pool.hosts.push(host);
    pool.total_capacity_gb += added_capacity;
    pool.free_capacity_gb += added_capacity;
    pool.updated = Utc::now();
    let _ = state.store.save_entity("dist_storage_pools", &pool.id, &pool);
    StatusCode::OK.into_response()
}

pub async fn remove_storage_host(
    State(state): State<Arc<AppState>>,
    Path((pool_id, host_id)): Path<(String, String)>,
) -> impl IntoResponse {
    let mut pool = match state.store.get_entity::<DistributedStoragePool>("dist_storage_pools", &pool_id) {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    pool.hosts.retain(|h| h.host_id != host_id);
    pool.updated = Utc::now();
    let _ = state.store.save_entity("dist_storage_pools", &pool.id, &pool);
    StatusCode::OK.into_response()
}

#[derive(serde::Deserialize)]
pub struct DiskFailureRequest {
    pub host_id: String,
    pub disk_id: String,
}

pub async fn report_disk_failure(
    State(state): State<Arc<AppState>>,
    Path(pool_id): Path<String>,
    Json(req): Json<DiskFailureRequest>,
) -> impl IntoResponse {
    let mut pool = match state.store.get_entity::<DistributedStoragePool>("dist_storage_pools", &pool_id) {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    pool.status = PoolStatus::Degraded;
    pool.health = PoolHealth::Warning;
    pool.updated = Utc::now();
    let _ = state.store.save_entity("dist_storage_pools", &pool.id, &pool);
    StatusCode::OK.into_response()
}

pub async fn get_pool_health(
    State(state): State<Arc<AppState>>,
    Path(pool_id): Path<String>,
) -> impl IntoResponse {
    let pool = match state.store.get_entity::<DistributedStoragePool>("dist_storage_pools", &pool_id) {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let capacity_used_pct = if pool.total_capacity_gb > 0 {
        (pool.used_capacity_gb as f64 / pool.total_capacity_gb as f64) * 100.0
    } else { 0.0 };
    let report = PoolHealthReport {
        pool_id: pool.id,
        status: pool.status,
        health: pool.health,
        failed_disks: 0,
        rebuilding_disks: 0,
        capacity_used_pct,
    };
    Json(serde_json::to_value(&report).unwrap()).into_response()
}

// ============================================================================
// Storage migration handlers
// ============================================================================

#[derive(serde::Deserialize)]
pub struct StartMigrationRequest {
    pub vm_name: String,
    pub source_pool_id: String,
    pub target_pool_id: String,
    pub disk_size_gb: u64,
}

pub async fn start_storage_migration(
    State(state): State<Arc<AppState>>,
    Json(req): Json<StartMigrationRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let migration = StorageMigration {
        id: Uuid::new_v4().to_string(),
        vm_name: req.vm_name,
        source_pool_id: req.source_pool_id,
        target_pool_id: req.target_pool_id,
        disk_size_gb: req.disk_size_gb,
        bytes_transferred: 0,
        progress_pct: 0.0,
        status: MigrationStatus::InProgress,
        started: Some(now),
        completed: None,
        error: None,
    };
    match state.store.save_entity("storage_migrations", &migration.id, &migration) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&migration).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_storage_migration(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<StorageMigration>("storage_migrations", &id) {
        Ok(Some(m)) => Json(serde_json::to_value(&m).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn list_storage_migrations(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<StorageMigration> = state.store.list_entities("storage_migrations").unwrap_or_default();
    Json(items)
}

#[derive(serde::Deserialize)]
pub struct UpdateProgressRequest {
    pub bytes_transferred: u64,
}

pub async fn update_migration_progress(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateProgressRequest>,
) -> impl IntoResponse {
    let mut m = match state.store.get_entity::<StorageMigration>("storage_migrations", &id) {
        Ok(Some(m)) => m,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    m.bytes_transferred = req.bytes_transferred;
    let total_bytes = m.disk_size_gb * 1024 * 1024 * 1024;
    m.progress_pct = if total_bytes > 0 { (req.bytes_transferred as f64 / total_bytes as f64 * 100.0).min(100.0) } else { 100.0 };
    let _ = state.store.save_entity("storage_migrations", &m.id, &m);
    StatusCode::OK.into_response()
}

pub async fn complete_migration(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mut m = match state.store.get_entity::<StorageMigration>("storage_migrations", &id) {
        Ok(Some(m)) => m,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    m.status = MigrationStatus::Completed;
    m.progress_pct = 100.0;
    m.completed = Some(Utc::now());
    let _ = state.store.save_entity("storage_migrations", &m.id, &m);
    StatusCode::OK.into_response()
}

pub async fn cancel_migration(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mut m = match state.store.get_entity::<StorageMigration>("storage_migrations", &id) {
        Ok(Some(m)) => m,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    m.status = MigrationStatus::Cancelled;
    m.completed = Some(Utc::now());
    let _ = state.store.save_entity("storage_migrations", &m.id, &m);
    StatusCode::OK.into_response()
}

// ============================================================================
// Storage policy handlers
// ============================================================================

pub async fn list_storage_policies(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<StoragePolicy> = state.store.list_entities("storage_policies").unwrap_or_default();
    Json(items)
}

pub async fn create_storage_policy(
    State(state): State<Arc<AppState>>,
    Json(mut policy): Json<StoragePolicy>,
) -> impl IntoResponse {
    if policy.id.is_empty() { policy.id = Uuid::new_v4().to_string(); }
    let now = Utc::now();
    policy.created = now;
    policy.updated = now;
    match state.store.save_entity("storage_policies", &policy.id, &policy) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&policy).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_storage_policy(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<StoragePolicy>("storage_policies", &id) {
        Ok(Some(p)) => Json(serde_json::to_value(&p).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn update_storage_policy(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(mut policy): Json<StoragePolicy>,
) -> impl IntoResponse {
    policy.id = id.clone();
    policy.updated = Utc::now();
    let _ = state.store.save_entity("storage_policies", &id, &policy);
    Json(serde_json::to_value(&policy).unwrap())
}

pub async fn delete_storage_policy(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("storage_policies", &id);
    StatusCode::NO_CONTENT
}

#[derive(serde::Deserialize)]
pub struct ComplianceCheckRequest {
    pub vm_name: String,
    pub pool_id: String,
}

pub async fn check_compliance(
    State(state): State<Arc<AppState>>,
    Path(policy_id): Path<String>,
    Json(req): Json<ComplianceCheckRequest>,
) -> impl IntoResponse {
    let pool = match state.store.get_entity::<DistributedStoragePool>("dist_storage_pools", &req.pool_id) {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let mgr = distributed_storage::DistributedStorageManager::new();
    let report = ComplianceReport {
        vm_name: req.vm_name,
        policy_id: policy_id.clone(),
        policy_name: String::new(),
        compliant: true,
        violations: Vec::new(),
        checked_at: Utc::now(),
    };
    Json(serde_json::to_value(&report).unwrap()).into_response()
}

// ============================================================================
// Datastore cluster handlers
// ============================================================================

pub async fn list_datastore_clusters(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<DatastoreCluster> = state.store.list_entities("datastore_clusters").unwrap_or_default();
    Json(items)
}

pub async fn create_datastore_cluster(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateDatastoreClusterRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let dsc = DatastoreCluster {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        cluster_id: req.cluster_id,
        datastore_ids: req.datastore_ids,
        storage_drs_enabled: req.storage_drs_enabled,
        space_threshold_pct: req.space_threshold_pct,
        io_latency_threshold_ms: req.io_latency_threshold_ms,
        automation_level: req.automation_level,
        created: now,
        updated: now,
    };
    match state.store.save_entity("datastore_clusters", &dsc.id, &dsc) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&dsc).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_datastore_cluster(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<DatastoreCluster>("datastore_clusters", &id) {
        Ok(Some(c)) => Json(serde_json::to_value(&c).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_datastore_cluster(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("datastore_clusters", &id);
    StatusCode::NO_CONTENT
}

#[derive(serde::Deserialize)]
pub struct RecommendDatastoreRequest {
    pub size_gb: u64,
}

pub async fn recommend_datastore(
    State(state): State<Arc<AppState>>,
    Path(ds_cluster_id): Path<String>,
    Json(req): Json<RecommendDatastoreRequest>,
) -> impl IntoResponse {
    let dsc = match state.store.get_entity::<DatastoreCluster>("datastore_clusters", &ds_cluster_id) {
        Ok(Some(c)) => c,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    // Find the pool with the most free space
    let mut best: Option<DistributedStoragePool> = None;
    for pool_id in &dsc.datastore_ids {
        if let Ok(Some(pool)) = state.store.get_entity::<DistributedStoragePool>("dist_storage_pools", pool_id) {
            if pool.free_capacity_gb >= req.size_gb {
                if best.as_ref().map_or(true, |b| pool.free_capacity_gb > b.free_capacity_gb) {
                    best = Some(pool);
                }
            }
        }
    }
    match best {
        Some(pool) => Json(serde_json::json!({"recommended_pool_id": pool.id})).into_response(),
        None => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "No suitable datastore found"}))).into_response(),
    }
}
