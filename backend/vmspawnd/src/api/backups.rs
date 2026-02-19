use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use chrono::{DateTime, Utc, Duration};
use uuid::Uuid;

use crate::server::AppState;

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BackupType {
    Full,
    Incremental,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BackupStatus {
    Completed,
    InProgress,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Backup {
    pub id: String,
    pub vm_name: String,
    pub backup_type: BackupType,
    pub size_bytes: u64,
    pub compressed: bool,
    pub created: DateTime<Utc>,
    pub status: BackupStatus,
    pub storage_location: String,
    pub retention_days: u32,
    pub expires_at: Option<DateTime<Utc>>,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBackupRequest {
    pub vm_name: String,
    pub backup_type: BackupType,
    #[serde(default = "default_true")]
    pub compress: bool,
    #[serde(default = "default_retention")]
    pub retention_days: u32,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreOptions {
    pub backup_id: String,
    pub target_vm_name: Option<String>,
    #[serde(default = "default_true")]
    pub restore_config: bool,
    #[serde(default = "default_true")]
    pub restore_disks: bool,
    #[serde(default = "default_false")]
    pub restore_state: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobOperation {
    Backup,
    Restore,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Queued,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupJob {
    pub id: String,
    pub backup_id: Option<String>,
    pub vm_name: String,
    pub operation: JobOperation,
    pub status: JobStatus,
    pub progress: f64,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScheduleType {
    Daily,
    Weekly,
    Monthly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupPolicy {
    pub id: String,
    pub name: String,
    pub vm_tags: Option<Vec<String>>,
    pub schedule_type: ScheduleType,
    pub backup_type: BackupType,
    pub retention_days: u32,
    pub enabled: bool,
    pub last_run: Option<DateTime<Utc>>,
    pub next_run: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBackupPolicyRequest {
    pub name: String,
    pub vm_tags: Option<Vec<String>>,
    pub schedule_type: ScheduleType,
    pub backup_type: BackupType,
    pub retention_days: u32,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupStats {
    pub total_backups: u64,
    pub total_size_bytes: u64,
    pub by_type: HashMap<String, u64>,
    pub by_vm: HashMap<String, u64>,
    pub oldest_backup: DateTime<Utc>,
    pub newest_backup: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct BackupQuery {
    pub vm: Option<String>,
}

fn default_true() -> bool {
    true
}

fn default_false() -> bool {
    false
}

fn default_retention() -> u32 {
    30
}

// ============================================================================
// Backup Handlers
// ============================================================================

pub async fn list_backups(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BackupQuery>,
) -> Result<Json<Vec<Backup>>, StatusCode> {
    // Load from state store, fall back to mock data if empty
    let mut backups = state.store.list_entities::<Backup>("backups")
        .unwrap_or_else(|_| vec![
        Backup {
            id: Uuid::new_v4().to_string(),
            vm_name: "web-server-01".to_string(),
            backup_type: BackupType::Full,
            size_bytes: 10 * 1024 * 1024 * 1024, // 10GB
            compressed: true,
            created: Utc::now() - Duration::days(1),
            status: BackupStatus::Completed,
            storage_location: "/var/lib/vmspawnd/backups/web-server-01-full-20260218.tar.gz".to_string(),
            retention_days: 30,
            expires_at: Some(Utc::now() + Duration::days(29)),
            metadata: None,
        },
        Backup {
            id: Uuid::new_v4().to_string(),
            vm_name: "database-01".to_string(),
            backup_type: BackupType::Full,
            size_bytes: 50 * 1024 * 1024 * 1024, // 50GB
            compressed: true,
            created: Utc::now() - Duration::days(2),
            status: BackupStatus::Completed,
            storage_location: "/var/lib/vmspawnd/backups/database-01-full-20260217.tar.gz".to_string(),
            retention_days: 90,
            expires_at: Some(Utc::now() + Duration::days(88)),
            metadata: None,
        },
        Backup {
            id: Uuid::new_v4().to_string(),
            vm_name: "web-server-01".to_string(),
            backup_type: BackupType::Incremental,
            size_bytes: 512 * 1024 * 1024, // 512MB
            compressed: true,
            created: Utc::now() - Duration::hours(12),
            status: BackupStatus::Completed,
            storage_location: "/var/lib/vmspawnd/backups/web-server-01-incr-20260219.tar.gz".to_string(),
            retention_days: 7,
            expires_at: Some(Utc::now() + Duration::days(6)),
            metadata: None,
        },
    ]);

    // Filter by VM if specified
    if let Some(vm_name) = query.vm {
        backups.retain(|b| b.vm_name == vm_name);
    }

    Ok(Json(backups))
}

pub async fn get_backup(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Backup>, StatusCode> {
    // Load from state store
    let backup = state.store.get_entity::<Backup>("backups", &id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(backup))
}

pub async fn create_backup(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateBackupRequest>,
) -> Result<(StatusCode, Json<BackupJob>), StatusCode> {
    // Validate VM exists
    match state.store.get_vm(&req.vm_name) {
        Ok(Some(_)) => {
            // VM exists, proceed
        }
        Ok(None) => {
            tracing::warn!("Cannot create backup: VM '{}' not found", req.vm_name);
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!("Failed to check VM existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    // Create backup job
    let job = BackupJob {
        id: Uuid::new_v4().to_string(),
        backup_id: None,
        vm_name: req.vm_name.clone(),
        operation: JobOperation::Backup,
        status: JobStatus::Queued,
        progress: 0.0,
        started_at: None,
        completed_at: None,
        error: None,
    };

    // Save job to state store
    if let Err(e) = state.store.save_entity("backup_jobs", &job.id, &job) {
        tracing::error!("Failed to save backup job: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    // TODO: Start backup process in background worker
    tracing::info!("Created backup job {} for VM {}", job.id, req.vm_name);

    Ok((StatusCode::CREATED, Json(job)))
}

pub async fn delete_backup(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // Get backup info before deleting (need storage_location)
    let backup = match state.store.get_entity::<Backup>("backups", &id) {
        Ok(Some(b)) => b,
        Ok(None) => {
            tracing::warn!("Backup {} not found", id);
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!("Failed to load backup: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Remove actual backup files from storage
    let storage_path = std::path::Path::new(&backup.storage_location);
    if storage_path.exists() {
        if let Err(e) = std::fs::remove_file(storage_path) {
            tracing::error!("Failed to delete backup file {}: {}", backup.storage_location, e);
            // Don't fail the request if file deletion fails - continue to remove from state store
        } else {
            tracing::info!("Deleted backup file: {}", backup.storage_location);
        }
    } else {
        tracing::warn!("Backup file not found: {}", backup.storage_location);
    }

    // Remove from state store
    if let Err(e) = state.store.delete_entity("backups", &id) {
        tracing::error!("Failed to delete backup from state store: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn restore_backup(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RestoreOptions>,
) -> Result<(StatusCode, Json<BackupJob>), StatusCode> {
    // Validate backup exists
    let backup = state.store.get_entity::<Backup>("backups", &req.backup_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let target_vm = req.target_vm_name.clone()
        .unwrap_or_else(|| backup.vm_name.clone());

    // Create restore job
    let job = BackupJob {
        id: Uuid::new_v4().to_string(),
        backup_id: Some(req.backup_id.clone()),
        vm_name: target_vm.clone(),
        operation: JobOperation::Restore,
        status: JobStatus::Queued,
        progress: 0.0,
        started_at: None,
        completed_at: None,
        error: None,
    };

    // Save job to state store
    if let Err(e) = state.store.save_entity("backup_jobs", &job.id, &job) {
        tracing::error!("Failed to save restore job: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    // TODO: Start restore process in background worker
    tracing::info!("Created restore job {} from backup {} to VM {}",
                   job.id, req.backup_id, target_vm);

    Ok((StatusCode::CREATED, Json(job)))
}

// ============================================================================
// Job Handlers
// ============================================================================

pub async fn get_backup_jobs(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<BackupJob>>, StatusCode> {
    // Load from state store, fall back to mock data if empty
    let jobs = state.store.list_entities::<BackupJob>("backup_jobs")
        .unwrap_or_else(|_| vec![
        BackupJob {
            id: Uuid::new_v4().to_string(),
            backup_id: Some(Uuid::new_v4().to_string()),
            vm_name: "web-server-01".to_string(),
            operation: JobOperation::Backup,
            status: JobStatus::Running,
            progress: 65.5,
            started_at: Some(Utc::now() - Duration::minutes(10)),
            completed_at: None,
            error: None,
        },
        BackupJob {
            id: Uuid::new_v4().to_string(),
            backup_id: Some(Uuid::new_v4().to_string()),
            vm_name: "database-01".to_string(),
            operation: JobOperation::Backup,
            status: JobStatus::Completed,
            progress: 100.0,
            started_at: Some(Utc::now() - Duration::hours(2)),
            completed_at: Some(Utc::now() - Duration::hours(1)),
            error: None,
        },
    ]);

    Ok(Json(jobs))
}

pub async fn get_backup_job(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<BackupJob>, StatusCode> {
    // Load from state store
    let job = state.store.get_entity::<BackupJob>("backup_jobs", &id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(job))
}

// ============================================================================
// Policy Handlers
// ============================================================================

pub async fn list_backup_policies(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<BackupPolicy>>, StatusCode> {
    // Load from state store, fall back to mock data if empty
    let policies = state.store.list_entities::<BackupPolicy>("backup_policies")
        .unwrap_or_else(|_| vec![
        BackupPolicy {
            id: Uuid::new_v4().to_string(),
            name: "Production Daily Backup".to_string(),
            vm_tags: Some(vec!["production".to_string()]),
            schedule_type: ScheduleType::Daily,
            backup_type: BackupType::Incremental,
            retention_days: 7,
            enabled: true,
            last_run: Some(Utc::now() - Duration::days(1)),
            next_run: Some(Utc::now() + Duration::days(1)),
        },
        BackupPolicy {
            id: Uuid::new_v4().to_string(),
            name: "Weekly Full Backup".to_string(),
            vm_tags: None,
            schedule_type: ScheduleType::Weekly,
            backup_type: BackupType::Full,
            retention_days: 30,
            enabled: true,
            last_run: Some(Utc::now() - Duration::days(7)),
            next_run: Some(Utc::now()),
        },
    ]);

    Ok(Json(policies))
}

pub async fn create_backup_policy(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateBackupPolicyRequest>,
) -> Result<(StatusCode, Json<BackupPolicy>), StatusCode> {
    let policy = BackupPolicy {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        vm_tags: req.vm_tags,
        schedule_type: req.schedule_type,
        backup_type: req.backup_type,
        retention_days: req.retention_days,
        enabled: req.enabled,
        last_run: None,
        next_run: Some(Utc::now() + Duration::days(1)),
    };

    // Save to state store
    if let Err(e) = state.store.save_entity("backup_policies", &policy.id, &policy) {
        tracing::error!("Failed to save backup policy: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok((StatusCode::CREATED, Json(policy)))
}

pub async fn delete_backup_policy(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // Remove from state store
    if let Err(e) = state.store.delete_entity("backup_policies", &id) {
        tracing::error!("Failed to delete backup policy: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn enable_backup_policy(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // Load policy from state store
    let mut policy = state.store.get_entity::<BackupPolicy>("backup_policies", &id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    // Set enabled = true
    policy.enabled = true;

    // Calculate next_run (simplified - use current time + 1 day)
    policy.next_run = Some(Utc::now() + Duration::days(1));

    // Save to state store
    if let Err(e) = state.store.save_entity("backup_policies", &policy.id, &policy) {
        tracing::error!("Failed to enable backup policy: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok(StatusCode::OK)
}

pub async fn disable_backup_policy(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // Load policy from state store
    let mut policy = state.store.get_entity::<BackupPolicy>("backup_policies", &id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    // Set enabled = false
    policy.enabled = false;

    // Clear next_run
    policy.next_run = None;

    // Save to state store
    if let Err(e) = state.store.save_entity("backup_policies", &policy.id, &policy) {
        tracing::error!("Failed to disable backup policy: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok(StatusCode::OK)
}

// ============================================================================
// Stats Handler
// ============================================================================

pub async fn get_backup_stats(
    State(state): State<Arc<AppState>>,
) -> Result<Json<BackupStats>, StatusCode> {
    // Calculate from state store
    let backups = state.store.list_entities::<Backup>("backups")
        .unwrap_or_default();

    let total_backups = backups.len() as u64;
    let total_size_bytes: u64 = backups.iter().map(|b| b.size_bytes).sum();

    let mut by_type: HashMap<String, u64> = HashMap::new();
    let mut by_vm: HashMap<String, u64> = HashMap::new();

    let mut oldest_backup = Utc::now();
    let mut newest_backup = Utc::now() - Duration::days(365);

    for backup in &backups {
        // Count by type
        let type_key = match backup.backup_type {
            BackupType::Full => "full",
            BackupType::Incremental => "incremental",
        };
        *by_type.entry(type_key.to_string()).or_insert(0) += 1;

        // Count by VM
        *by_vm.entry(backup.vm_name.clone()).or_insert(0) += 1;

        // Track oldest and newest
        if backup.created < oldest_backup {
            oldest_backup = backup.created;
        }
        if backup.created > newest_backup {
            newest_backup = backup.created;
        }
    }

    // If no backups, use reasonable defaults
    if total_backups == 0 {
        oldest_backup = Utc::now() - Duration::days(30);
        newest_backup = Utc::now();
    }

    let stats = BackupStats {
        total_backups,
        total_size_bytes,
        by_type,
        by_vm,
        oldest_backup,
        newest_backup,
    };

    Ok(Json(stats))
}
