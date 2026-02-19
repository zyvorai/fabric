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
    State(_state): State<Arc<AppState>>,
    Query(query): Query<BackupQuery>,
) -> Result<Json<Vec<Backup>>, StatusCode> {
    // TODO: Load from state store
    let mut backups = vec![
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
    ];

    // Filter by VM if specified
    if let Some(vm_name) = query.vm {
        backups.retain(|b| b.vm_name == vm_name);
    }

    Ok(Json(backups))
}

pub async fn get_backup(
    State(_state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Backup>, StatusCode> {
    // TODO: Load from state store
    let backup = Backup {
        id,
        vm_name: "web-server-01".to_string(),
        backup_type: BackupType::Full,
        size_bytes: 10 * 1024 * 1024 * 1024,
        compressed: true,
        created: Utc::now() - Duration::days(1),
        status: BackupStatus::Completed,
        storage_location: "/var/lib/vmspawnd/backups/web-server-01-full-20260218.tar.gz".to_string(),
        retention_days: 30,
        expires_at: Some(Utc::now() + Duration::days(29)),
        metadata: None,
    };

    Ok(Json(backup))
}

pub async fn create_backup(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<CreateBackupRequest>,
) -> Result<(StatusCode, Json<BackupJob>), StatusCode> {
    // TODO: Validate VM exists
    // TODO: Create backup job
    // TODO: Start backup process in background

    let job = BackupJob {
        id: Uuid::new_v4().to_string(),
        backup_id: None,
        vm_name: req.vm_name,
        operation: JobOperation::Backup,
        status: JobStatus::Queued,
        progress: 0.0,
        started_at: None,
        completed_at: None,
        error: None,
    };

    Ok((StatusCode::CREATED, Json(job)))
}

pub async fn delete_backup(
    State(_state): State<Arc<AppState>>,
    Path(_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // TODO: Remove backup files
    // TODO: Remove from state store

    Ok(StatusCode::NO_CONTENT)
}

pub async fn restore_backup(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<RestoreOptions>,
) -> Result<(StatusCode, Json<BackupJob>), StatusCode> {
    // TODO: Validate backup exists
    // TODO: Create restore job
    // TODO: Start restore process in background

    let target_vm = req.target_vm_name.clone()
        .unwrap_or_else(|| "restored-vm".to_string());

    let job = BackupJob {
        id: Uuid::new_v4().to_string(),
        backup_id: Some(req.backup_id),
        vm_name: target_vm,
        operation: JobOperation::Restore,
        status: JobStatus::Queued,
        progress: 0.0,
        started_at: None,
        completed_at: None,
        error: None,
    };

    Ok((StatusCode::CREATED, Json(job)))
}

// ============================================================================
// Job Handlers
// ============================================================================

pub async fn get_backup_jobs(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<Vec<BackupJob>>, StatusCode> {
    // TODO: Load from state store
    let jobs = vec![
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
    ];

    Ok(Json(jobs))
}

pub async fn get_backup_job(
    State(_state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<BackupJob>, StatusCode> {
    // TODO: Load from state store
    let job = BackupJob {
        id,
        backup_id: Some(Uuid::new_v4().to_string()),
        vm_name: "web-server-01".to_string(),
        operation: JobOperation::Backup,
        status: JobStatus::Running,
        progress: 65.5,
        started_at: Some(Utc::now() - Duration::minutes(10)),
        completed_at: None,
        error: None,
    };

    Ok(Json(job))
}

// ============================================================================
// Policy Handlers
// ============================================================================

pub async fn list_backup_policies(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<Vec<BackupPolicy>>, StatusCode> {
    // TODO: Load from state store
    let policies = vec![
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
    ];

    Ok(Json(policies))
}

pub async fn create_backup_policy(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<CreateBackupPolicyRequest>,
) -> Result<(StatusCode, Json<BackupPolicy>), StatusCode> {
    // TODO: Save to state store

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

    Ok((StatusCode::CREATED, Json(policy)))
}

pub async fn delete_backup_policy(
    State(_state): State<Arc<AppState>>,
    Path(_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // TODO: Remove from state store

    Ok(StatusCode::NO_CONTENT)
}

pub async fn enable_backup_policy(
    State(_state): State<Arc<AppState>>,
    Path(_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // TODO: Load policy from state store
    // TODO: Set enabled = true
    // TODO: Calculate next_run
    // TODO: Save to state store

    Ok(StatusCode::OK)
}

pub async fn disable_backup_policy(
    State(_state): State<Arc<AppState>>,
    Path(_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // TODO: Load policy from state store
    // TODO: Set enabled = false
    // TODO: Clear next_run
    // TODO: Save to state store

    Ok(StatusCode::OK)
}

// ============================================================================
// Stats Handler
// ============================================================================

pub async fn get_backup_stats(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<BackupStats>, StatusCode> {
    // TODO: Calculate from state store

    let mut by_type = HashMap::new();
    by_type.insert("full".to_string(), 5);
    by_type.insert("incremental".to_string(), 15);

    let mut by_vm = HashMap::new();
    by_vm.insert("web-server-01".to_string(), 8);
    by_vm.insert("database-01".to_string(), 6);
    by_vm.insert("app-server-01".to_string(), 4);
    by_vm.insert("cache-server".to_string(), 2);

    let stats = BackupStats {
        total_backups: 20,
        total_size_bytes: 500 * 1024 * 1024 * 1024, // 500GB
        by_type,
        by_vm,
        oldest_backup: Utc::now() - Duration::days(30),
        newest_backup: Utc::now(),
    };

    Ok(Json(stats))
}
