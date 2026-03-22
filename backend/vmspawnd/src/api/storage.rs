use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use vmspawnd_storage::{
    NfsConfig, NfsVersion, StoragePool,
};

use crate::server::AppState;
use security::{RequireRead, RequireWrite, RequireAdmin};

// Request/Response types
#[derive(Debug, Deserialize)]
pub struct CreateLocalPoolRequest {
    pub name: String,
    pub path: String,
    pub auto_start: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateNfsPoolRequest {
    pub name: String,
    pub config: NfsConfigDto,
}

#[derive(Debug, Deserialize)]
pub struct CreateLvmPoolRequest {
    pub name: String,
    pub volume_group: String,
    #[serde(default)]
    pub auto_start: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateLvmThinPoolRequest {
    pub name: String,
    pub volume_group: String,
    pub thin_pool: String,
    #[serde(default)]
    pub auto_start: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateZfsPoolRequest {
    pub name: String,
    pub zpool: String,
    #[serde(default)]
    pub dataset: Option<String>,
    #[serde(default)]
    pub auto_start: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct NfsConfigDto {
    pub server: String,
    pub export_path: String,
    pub mount_path: String,
    pub mount_options: Vec<String>,
    pub auto_start: bool,
    pub nfs_version: NfsVersionDto,
}

#[derive(Debug, Deserialize, Serialize)]
pub enum NfsVersionDto {
    V3,
    V4,
    #[serde(rename = "V4_1")]
    V4_1,
    #[serde(rename = "V4_2")]
    V4_2,
}

impl From<NfsVersionDto> for NfsVersion {
    fn from(dto: NfsVersionDto) -> Self {
        match dto {
            NfsVersionDto::V3 => NfsVersion::V3,
            NfsVersionDto::V4 => NfsVersion::V4,
            NfsVersionDto::V4_1 => NfsVersion::V4_1,
            NfsVersionDto::V4_2 => NfsVersion::V4_2,
        }
    }
}

impl From<NfsVersion> for NfsVersionDto {
    fn from(version: NfsVersion) -> Self {
        match version {
            NfsVersion::V3 => NfsVersionDto::V3,
            NfsVersion::V4 => NfsVersionDto::V4,
            NfsVersion::V4_1 => NfsVersionDto::V4_1,
            NfsVersion::V4_2 => NfsVersionDto::V4_2,
        }
    }
}

// API Handlers

/// GET /api/storage/pools - List all storage pools
pub async fn list_pools(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<StoragePool>>, (StatusCode, String)> {
    tracing::debug!("storage::{}", stringify!(list_pools));
    // Clone the pool list under the lock, then release it before returning
    let pools = {
        let manager = state.storage_manager.read().await;
        manager.list_pools().await
    };
    Ok(Json(pools))
}

/// GET /api/storage/pools/:name - Get storage pool details
pub async fn get_pool(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<StoragePool>, (StatusCode, String)> {
    tracing::debug!("storage::{}", stringify!(get_pool));
    let result = {
        let manager = state.storage_manager.read().await;
        manager.get_pool(&name).await
    };

    match result {
        Ok(pool) => Ok(Json(pool)),
        Err(e) => Err((StatusCode::NOT_FOUND, format!("Pool not found: {}", e))),
    }
}

/// POST /api/storage/pools/local - Create local storage pool
pub async fn create_local_pool(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateLocalPoolRequest>,
) -> Result<Json<StoragePool>, (StatusCode, String)> {
    tracing::debug!("storage::{}", stringify!(create_local_pool));

    // Validate path is within allowed directories
    crate::validation::validate_host_path(&req.path)
        .map_err(|(_, msg)| (StatusCode::BAD_REQUEST, msg))?;

    let path = std::path::PathBuf::from(&req.path);
    let result = {
        let manager = state.storage_manager.read().await;
        manager.create_local_pool(req.name, path, req.auto_start).await
    };

    match result {
        Ok(pool) => Ok(Json(pool)),
        Err(e) => Err((StatusCode::BAD_REQUEST, format!("Failed to create pool: {}", e))),
    }
}

/// POST /api/storage/pools/nfs - Create NFS storage pool
pub async fn create_nfs_pool(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateNfsPoolRequest>,
) -> Result<Json<StoragePool>, (StatusCode, String)> {
    tracing::debug!("storage::{}", stringify!(create_nfs_pool));

    // Validate NFS server hostname
    crate::validation::validate_hostname(&req.config.server)
        .map_err(|msg| (StatusCode::BAD_REQUEST, format!("Invalid NFS server: {}", msg)))?;

    // Validate mount path
    crate::validation::validate_host_path(&req.config.mount_path)
        .map_err(|(_, msg)| (StatusCode::BAD_REQUEST, msg))?;

    let nfs_config = NfsConfig {
        server: req.config.server,
        export_path: req.config.export_path,
        mount_path: std::path::PathBuf::from(&req.config.mount_path),
        mount_options: req.config.mount_options,
        auto_start: req.config.auto_start,
        nfs_version: req.config.nfs_version.into(),
    };

    let result = {
        let manager = state.storage_manager.read().await;
        manager.create_nfs_pool(req.name, nfs_config).await
    };

    match result {
        Ok(pool) => Ok(Json(pool)),
        Err(e) => Err((StatusCode::BAD_REQUEST, format!("Failed to create NFS pool: {}", e))),
    }
}

/// DELETE /api/storage/pools/:name - Delete storage pool
pub async fn delete_pool(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::debug!("storage::{}", stringify!(delete_pool));
    let result = {
        let manager = state.storage_manager.read().await;
        manager.delete_pool(&name).await
    };

    match result {
        Ok(_) => Ok(StatusCode::NO_CONTENT),
        Err(e) => Err((StatusCode::BAD_REQUEST, format!("Failed to delete pool: {}", e))),
    }
}

/// POST /api/storage/pools/:name/start - Start storage pool
pub async fn start_pool(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::debug!("storage::{}", stringify!(start_pool));
    let result = {
        let manager = state.storage_manager.read().await;
        manager.start_pool(&name).await
    };
    match result {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err((StatusCode::BAD_REQUEST, format!("Failed to start pool: {}", e))),
    }
}

/// POST /api/storage/pools/:name/stop - Stop storage pool
pub async fn stop_pool(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::debug!("storage::{}", stringify!(stop_pool));
    let result = {
        let manager = state.storage_manager.read().await;
        manager.stop_pool(&name).await
    };
    match result {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err((StatusCode::BAD_REQUEST, format!("Failed to stop pool: {}", e))),
    }
}

/// GET /api/storage/pools/:name/health - Get NFS pool health
pub async fn get_pool_health(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::debug!("storage::{}", stringify!(get_pool_health));
    let result = {
        let manager = state.storage_manager.read().await;
        manager.get_nfs_health(&name).await
    };
    match result {
        Ok(health) => Ok(Json(health)),
        Err(e) => Err((StatusCode::NOT_FOUND, format!("Failed to get health: {}", e))),
    }
}

/// GET /api/storage/pools/:name/stats - Get NFS pool stats
pub async fn get_pool_stats(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::debug!("storage::{}", stringify!(get_pool_stats));
    let result = {
        let manager = state.storage_manager.read().await;
        manager.get_nfs_stats(&name).await
    };
    match result {
        Ok(stats) => Ok(Json(stats)),
        Err(e) => Err((StatusCode::NOT_FOUND, format!("Failed to get stats: {}", e))),
    }
}

/// POST /api/storage/pools/:name/refresh - Refresh pool statistics
pub async fn refresh_pool_stats(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::debug!("storage::{}", stringify!(refresh_pool_stats));
    let result = {
        let manager = state.storage_manager.read().await;
        manager.refresh_pool_stats(&name).await
    };
    match result {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err((StatusCode::BAD_REQUEST, format!("Failed to refresh stats: {}", e))),
    }
}

/// POST /api/storage/pools/lvm - Create LVM storage pool
pub async fn create_lvm_pool(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateLvmPoolRequest>,
) -> Result<Json<StoragePool>, (StatusCode, String)> {
    tracing::debug!("storage::{}", stringify!(create_lvm_pool));
    let result = {
        let manager = state.storage_manager.read().await;
        manager.create_lvm_pool(req.name, req.volume_group, req.auto_start).await
    };
    match result
    {
        Ok(pool) => Ok(Json(pool)),
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            format!("Failed to create LVM pool: {}", e),
        )),
    }
}

/// POST /api/storage/pools/lvm-thin - Create LVM thin storage pool
pub async fn create_lvm_thin_pool(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateLvmThinPoolRequest>,
) -> Result<Json<StoragePool>, (StatusCode, String)> {
    tracing::debug!("storage::{}", stringify!(create_lvm_thin_pool));
    let result = {
        let manager = state.storage_manager.read().await;
        manager.create_lvm_thin_pool(req.name, req.volume_group, req.thin_pool, req.auto_start).await
    };
    match result
    {
        Ok(pool) => Ok(Json(pool)),
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            format!("Failed to create LVM thin pool: {}", e),
        )),
    }
}

/// POST /api/storage/pools/zfs - Create ZFS storage pool
pub async fn create_zfs_pool(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateZfsPoolRequest>,
) -> Result<Json<StoragePool>, (StatusCode, String)> {
    tracing::debug!("storage::{}", stringify!(create_zfs_pool));
    let result = {
        let manager = state.storage_manager.read().await;
        manager.create_zfs_pool(req.name, req.zpool, req.dataset, req.auto_start).await
    };
    match result
    {
        Ok(pool) => Ok(Json(pool)),
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            format!("Failed to create ZFS pool: {}", e),
        )),
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateCephPoolRequest {
    pub name: String,
    pub monitors: Vec<String>,
    pub pool_name: String,
    pub user: Option<String>,
    pub keyring: Option<String>,
    #[serde(default)]
    pub auto_start: bool,
}

pub async fn create_ceph_pool(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateCephPoolRequest>,
) -> Result<Json<StoragePool>, (StatusCode, String)> {
    tracing::debug!("storage::{}", stringify!(create_ceph_pool));
    let result = {
        let manager = state.storage_manager.read().await;
        manager
        .create_ceph_pool(req.name, req.monitors, req.pool_name, req.user, req.keyring, req.auto_start)
        .await
    };
    match result {
        Ok(pool) => Ok(Json(pool)),
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            format!("Failed to create Ceph pool: {}", e),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nfs_version_conversion() {
        let v4 = NfsVersionDto::V4;
        let nfs_version: NfsVersion = v4.into();
        assert!(matches!(nfs_version, NfsVersion::V4));
    }
}
