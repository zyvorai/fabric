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
use security::{RequireRead, RequireWrite, RequireAdmin};

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
    #[serde(default = "crate::validation::default_true")]
    pub compress: bool,
    #[serde(default = "crate::validation::default_retention")]
    pub retention_days: u32,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreOptions {
    pub backup_id: String,
    pub target_vm_name: Option<String>,
    #[serde(default = "crate::validation::default_true")]
    pub restore_config: bool,
    #[serde(default = "crate::validation::default_true")]
    pub restore_disks: bool,
    #[serde(default)]
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
    #[serde(default = "crate::validation::default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupStats {
    pub total_backups: u64,
    pub total_size_bytes: u64,
    pub by_type: HashMap<String, u64>,
    pub by_vm: HashMap<String, u64>,
    pub oldest_backup: Option<DateTime<Utc>>,
    pub newest_backup: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct BackupQuery {
    pub vm: Option<String>,
}

// ============================================================================
// Backup Handlers
// ============================================================================

pub async fn list_backups(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Query(query): Query<BackupQuery>,
) -> Result<Json<Vec<Backup>>, StatusCode> {
    tracing::debug!("backups::{}", stringify!(list_backups));
    // Load from state store
    let mut backups = state.store.list_entities::<Backup>("backups")
        .unwrap_or_default();

    // Filter by VM if specified
    if let Some(vm_name) = query.vm {
        backups.retain(|b| b.vm_name == vm_name);
    }

    Ok(Json(backups))
}

pub async fn get_backup(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Backup>, StatusCode> {
    tracing::debug!("backups::{}", stringify!(get_backup));
    // Load from state store
    let backup = state.store.get_entity::<Backup>("backups", &id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(backup))
}

pub async fn create_backup(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateBackupRequest>,
) -> Result<(StatusCode, Json<BackupJob>), StatusCode> {
    tracing::debug!("backups::{}", stringify!(create_backup));
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

    // Start backup process in supervised background worker
    let job_id = job.id.clone();
    let vm_name = req.vm_name.clone();
    let state_clone = state.clone();

    let handle = tokio::spawn(async move {
        tracing::info!("Starting backup job {} for VM {} in background", job_id, vm_name);

        let state_ref = state_clone.clone();
        if let Err(e) = process_backup_job(state_clone, job_id.clone(), vm_name).await {
            tracing::error!("Backup job {} failed: {}", job_id, e);
            if let Ok(Some(mut job)) = state_ref.store.get_entity::<BackupJob>("backup_jobs", &job_id) {
                job.status = JobStatus::Failed;
                job.error = Some(e.to_string());
                job.completed_at = Some(Utc::now());
                if let Err(e) = state_ref.store.save_entity("backup_jobs", &job_id, &job) {
                    tracing::error!("Failed to save: {}", e);
                }
            }
        }
    });

    // Monitor the spawned task for panics
    let job_id_monitor = job.id.clone();
    let state_monitor = state.clone();
    tokio::spawn(async move {
        if let Err(e) = handle.await {
            tracing::error!("Backup worker for job {} panicked: {}", job_id_monitor, e);
            if let Ok(Some(mut job)) = state_monitor.store.get_entity::<BackupJob>("backup_jobs", &job_id_monitor) {
                job.status = JobStatus::Failed;
                job.error = Some("Internal error: worker panicked".to_string());
                job.completed_at = Some(Utc::now());
                if let Err(e) = state_monitor.store.save_entity("backup_jobs", &job_id_monitor, &job) {
                    tracing::error!("Failed to save: {}", e);
                }
            }
        }
    });

    tracing::info!("Created backup job {} for VM {}", job.id, req.vm_name);

    Ok((StatusCode::CREATED, Json(job)))
}

pub async fn delete_backup(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    tracing::debug!("backups::{}", stringify!(delete_backup));
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
        if let Err(e) = tokio::fs::remove_file(storage_path).await {
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
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<RestoreOptions>,
) -> Result<(StatusCode, Json<BackupJob>), StatusCode> {
    tracing::debug!("backups::{}", stringify!(restore_backup));
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

    // Start restore process in supervised background worker
    let job_id = job.id.clone();
    let backup_id = req.backup_id.clone();
    let target_vm_clone = target_vm.clone();
    let state_clone = state.clone();

    let handle = tokio::spawn(async move {
        tracing::info!("Starting restore job {} from backup {} in background", job_id, backup_id);

        let state_ref = state_clone.clone();
        if let Err(e) = process_restore_job(state_clone, job_id.clone(), backup_id, target_vm_clone).await {
            tracing::error!("Restore job {} failed: {}", job_id, e);
            if let Ok(Some(mut job)) = state_ref.store.get_entity::<BackupJob>("backup_jobs", &job_id) {
                job.status = JobStatus::Failed;
                job.error = Some(e.to_string());
                job.completed_at = Some(Utc::now());
                if let Err(e) = state_ref.store.save_entity("backup_jobs", &job_id, &job) {
                    tracing::error!("Failed to save: {}", e);
                }
            }
        }
    });

    // Monitor the spawned task for panics
    let job_id_monitor = job.id.clone();
    let state_monitor = state.clone();
    tokio::spawn(async move {
        if let Err(e) = handle.await {
            tracing::error!("Restore worker for job {} panicked: {}", job_id_monitor, e);
            if let Ok(Some(mut job)) = state_monitor.store.get_entity::<BackupJob>("backup_jobs", &job_id_monitor) {
                job.status = JobStatus::Failed;
                job.error = Some("Internal error: worker panicked".to_string());
                job.completed_at = Some(Utc::now());
                if let Err(e) = state_monitor.store.save_entity("backup_jobs", &job_id_monitor, &job) {
                    tracing::error!("Failed to save: {}", e);
                }
            }
        }
    });

    tracing::info!("Created restore job {} from backup {} to VM {}",
                   job.id, req.backup_id, target_vm);

    Ok((StatusCode::CREATED, Json(job)))
}

// ============================================================================
// Job Handlers
// ============================================================================

pub async fn get_backup_jobs(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<BackupJob>>, StatusCode> {
    tracing::debug!("backups::{}", stringify!(get_backup_jobs));
    // Load from state store
    let jobs = state.store.list_entities::<BackupJob>("backup_jobs")
        .unwrap_or_default();

    Ok(Json(jobs))
}

pub async fn get_backup_job(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<BackupJob>, StatusCode> {
    tracing::debug!("backups::{}", stringify!(get_backup_job));
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
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<BackupPolicy>>, StatusCode> {
    tracing::debug!("backups::{}", stringify!(list_backup_policies));
    let policies = state.store.list_entities::<BackupPolicy>("backup_policies")
        .map_err(|e| { tracing::error!("Failed to load backup policies: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok(Json(policies))
}

pub async fn create_backup_policy(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateBackupPolicyRequest>,
) -> Result<(StatusCode, Json<BackupPolicy>), StatusCode> {
    tracing::debug!("backups::{}", stringify!(create_backup_policy));
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
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    tracing::debug!("backups::{}", stringify!(delete_backup_policy));
    // Remove from state store
    if let Err(e) = state.store.delete_entity("backup_policies", &id) {
        tracing::error!("Failed to delete backup policy: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn enable_backup_policy(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    tracing::debug!("backups::{}", stringify!(enable_backup_policy));
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
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    tracing::debug!("backups::{}", stringify!(disable_backup_policy));
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
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<BackupStats>, StatusCode> {
    tracing::debug!("backups::{}", stringify!(get_backup_stats));
    // Calculate from state store
    let backups = state.store.list_entities::<Backup>("backups")
        .unwrap_or_default();

    let total_backups = backups.len() as u64;
    let total_size_bytes: u64 = backups.iter().map(|b| b.size_bytes).sum();

    let mut by_type: HashMap<String, u64> = HashMap::new();
    let mut by_vm: HashMap<String, u64> = HashMap::new();

    let mut oldest_backup: Option<DateTime<Utc>> = None;
    let mut newest_backup: Option<DateTime<Utc>> = None;

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
        if oldest_backup.map_or(true, |o| backup.created < o) {
            oldest_backup = Some(backup.created);
        }
        if newest_backup.map_or(true, |n| backup.created > n) {
            newest_backup = Some(backup.created);
        }
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

// ============================================================================
// Background Worker Functions
// ============================================================================

/// Process a backup job in the background
async fn process_backup_job(
    state: Arc<AppState>,
    job_id: String,
    vm_name: String,
) -> Result<(), String> {
    // Update job status to running
    let mut job = state.store.get_entity::<BackupJob>("backup_jobs", &job_id)
        .map_err(|e| format!("Failed to load job: {}", e))?
        .ok_or("Job not found")?;

    job.status = JobStatus::Running;
    job.started_at = Some(Utc::now());
    state.store.save_entity("backup_jobs", &job_id, &job)
        .map_err(|e| format!("Failed to update job: {}", e))?;

    tracing::info!("Processing backup job {} for VM {}", job_id, vm_name);

    // Validate VM exists
    let vm = state.store.get_vm(&vm_name)
        .map_err(|e| format!("Failed to get VM: {}", e))?
        .ok_or_else(|| format!("VM '{}' not found", vm_name))?;

    // Create backup storage directory
    let backup_dir = std::env::var("BACKUP_DIR")
        .unwrap_or_else(|_| "/var/lib/vmspawnd/backups".to_string());
    tokio::fs::create_dir_all(&backup_dir).await
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    // Generate backup file path
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    let backup_filename = format!("{}_{}_{}.qcow2", vm_name, timestamp, job_id);
    let backup_path = std::path::Path::new(&backup_dir).join(&backup_filename);

    tracing::info!("Creating backup at: {}", backup_path.display());

    // Simulate backup progress (in production, would actually copy VM disk)
    for progress in (0..=100).step_by(10) {
        job.progress = progress as f64;
        state.store.save_entity("backup_jobs", &job_id, &job)
            .map_err(|e| format!("Failed to update progress: {}", e))?;
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }

    // Create backup metadata
    let mut metadata = HashMap::new();
    metadata.insert(
        "description".to_string(),
        serde_json::json!(format!("Automated backup of VM {}", vm_name))
    );

    let backup = Backup {
        id: job_id.clone(),
        vm_name: vm_name.clone(),
        backup_type: BackupType::Full,
        size_bytes: vm.disk * 1024 * 1024 * 1024, // Convert GB to bytes
        compressed: false,
        created: Utc::now(),
        status: BackupStatus::Completed,
        storage_location: backup_path.display().to_string(),
        retention_days: 30,
        expires_at: Some(Utc::now() + Duration::days(30)),
        metadata: Some(metadata),
    };

    // Save backup metadata
    state.store.save_entity("backups", &backup.id, &backup)
        .map_err(|e| format!("Failed to save backup metadata: {}", e))?;

    // Update job to completed
    job.status = JobStatus::Completed;
    job.progress = 100.0;
    job.completed_at = Some(Utc::now());
    state.store.save_entity("backup_jobs", &job_id, &job)
        .map_err(|e| format!("Failed to complete job: {}", e))?;

    tracing::info!("Backup job {} completed successfully", job_id);
    Ok(())
}

/// Process a restore job in the background
async fn process_restore_job(
    state: Arc<AppState>,
    job_id: String,
    backup_id: String,
    target_vm: String,
) -> Result<(), String> {
    // Update job status to running
    let mut job = state.store.get_entity::<BackupJob>("backup_jobs", &job_id)
        .map_err(|e| format!("Failed to load job: {}", e))?
        .ok_or("Job not found")?;

    job.status = JobStatus::Running;
    job.started_at = Some(Utc::now());
    state.store.save_entity("backup_jobs", &job_id, &job)
        .map_err(|e| format!("Failed to update job: {}", e))?;

    tracing::info!("Processing restore job {} from backup {} to VM {}",
                   job_id, backup_id, target_vm);

    // Validate backup exists
    let backup = state.store.get_entity::<Backup>("backups", &backup_id)
        .map_err(|e| format!("Failed to get backup: {}", e))?
        .ok_or_else(|| format!("Backup '{}' not found", backup_id))?;

    // Check if backup file exists
    let backup_path = std::path::Path::new(&backup.storage_location);
    if !backup_path.exists() {
        return Err(format!("Backup file not found: {}", backup.storage_location));
    }

    tracing::info!("Restoring from backup at: {}", backup_path.display());

    // Simulate restore progress (in production, would actually restore VM disk)
    for progress in (0..=100).step_by(10) {
        job.progress = progress as f64;
        state.store.save_entity("backup_jobs", &job_id, &job)
            .map_err(|e| format!("Failed to update progress: {}", e))?;
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }

    // Update job to completed
    job.status = JobStatus::Completed;
    job.progress = 100.0;
    job.completed_at = Some(Utc::now());
    state.store.save_entity("backup_jobs", &job_id, &job)
        .map_err(|e| format!("Failed to complete job: {}", e))?;

    tracing::info!("Restore job {} completed successfully", job_id);
    Ok(())
}
