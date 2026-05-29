// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;

use crate::server::AppState;
use crate::validation::validate_vm_name;
use security::{RequireAdmin, RequireRead};

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MigrationType {
    Live,
    Offline,
    Storage,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MigrationState {
    Pending,
    PreCheck,
    Syncing,
    Switching,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationRequest {
    pub vm_name: String,
    pub target_host: String,
    pub migration_type: MigrationType,
    pub compress: Option<bool>,
    pub bandwidth_mbps: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationStatus {
    pub id: String,
    pub vm_name: String,
    pub target_host: String,
    pub migration_type: MigrationType,
    pub state: MigrationState,
    pub progress_percent: u32,
    pub bytes_transferred: u64,
    pub started: DateTime<Utc>,
    pub completed: Option<DateTime<Utc>>,
    pub error: Option<String>,
}

// ============================================================================
// Handlers
// ============================================================================

/// POST /api/migrations - Start a new migration (Admin only)
pub async fn start_migration(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Json(req): Json<MigrationRequest>,
) -> Result<(StatusCode, Json<MigrationStatus>), (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("migration::{}", stringify!(start_migration));
    // Validate VM name
    validate_vm_name(&req.vm_name)
        .map_err(|(_status, msg)| (StatusCode::BAD_REQUEST, Json(json!({ "error": msg }))))?;

    // Validate target host (must be a hostname or IP, no shell metacharacters)
    crate::validation::validate_hostname(&req.target_host)
        .map_err(|msg| (StatusCode::BAD_REQUEST, Json(json!({ "error": msg }))))?;

    // Verify VM exists
    match state.store.get_vm(&req.vm_name) {
        Ok(Some(_)) => {}
        Ok(None) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({ "error": format!("VM '{}' not found", req.vm_name) })),
            ));
        }
        Err(e) => {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            ));
        }
    }

    let migration_id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now();

    let status = MigrationStatus {
        id: migration_id.clone(),
        vm_name: req.vm_name.clone(),
        target_host: req.target_host.clone(),
        migration_type: req.migration_type.clone(),
        state: MigrationState::Pending,
        progress_percent: 0,
        bytes_transferred: 0,
        started: now,
        completed: None,
        error: None,
    };

    // Save initial status
    state
        .store
        .save_entity("migrations", &migration_id, &status)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
        })?;

    // Spawn background migration task
    let state_clone = state.clone();
    let migration_id_clone = migration_id.clone();
    let req_clone = req.clone();

    let handle = tokio::spawn(async move {
        run_migration(state_clone, migration_id_clone, req_clone).await;
    });

    // Monitor the spawned task for panics
    let migration_id_monitor = migration_id.clone();
    let state_monitor = state.clone();
    tokio::spawn(async move {
        if let Err(e) = handle.await {
            tracing::error!("Migration task '{}' panicked: {}", migration_id_monitor, e);
            // Update migration status to Failed on panic
            if let Ok(Some(mut status)) = state_monitor
                .store
                .get_entity::<MigrationStatus>("migrations", &migration_id_monitor)
            {
                status.state = MigrationState::Failed;
                status.error = Some("Internal error: migration task panicked".to_string());
                status.completed = Some(Utc::now());
                if let Err(save_err) =
                    state_monitor
                        .store
                        .save_entity("migrations", &migration_id_monitor, &status)
                {
                    tracing::error!("Failed to save migration panic status: {}", save_err);
                }
            }
        }
    });

    Ok((StatusCode::ACCEPTED, Json(status)))
}

/// GET /api/migrations - List all migrations
pub async fn list_migrations(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<MigrationStatus>>, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("migration::{}", stringify!(list_migrations));
    let migrations = state
        .store
        .list_entities::<MigrationStatus>("migrations")
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
        })?;

    Ok(Json(migrations))
}

/// GET /api/migrations/:id - Get migration status
pub async fn get_migration(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<MigrationStatus>, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("migration::{}", stringify!(get_migration));
    match state.store.get_entity::<MigrationStatus>("migrations", &id) {
        Ok(Some(status)) => Ok(Json(status)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Migration not found" })),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )),
    }
}

/// POST /api/migrations/:id/cancel - Cancel a migration (Admin only)
pub async fn cancel_migration(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<MigrationStatus>, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("migration::{}", stringify!(cancel_migration));
    let mut status = match state.store.get_entity::<MigrationStatus>("migrations", &id) {
        Ok(Some(s)) => s,
        Ok(None) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Migration not found" })),
            ));
        }
        Err(e) => {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            ));
        }
    };

    // Can only cancel pending/in-progress migrations
    match status.state {
        MigrationState::Completed | MigrationState::Failed | MigrationState::Cancelled => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Migration is already finished" })),
            ));
        }
        _ => {}
    }

    // Kill any rsync processes for this VM.
    // Validate the VM name to prevent regex injection in pkill's -f pattern.
    if crate::validation::validate_vm_name(&status.vm_name).is_err() {
        tracing::error!(
            "Migration cancel: invalid VM name '{}', skipping pkill",
            status.vm_name
        );
    } else {
        // VM name is validated to only contain [a-zA-Z0-9._-].
        // Escape dots for regex safety since '.' matches any character.
        let escaped_name = status.vm_name.replace('.', "\\.");
        if let Err(e) = tokio::process::Command::new("pkill")
            .args(["-f", &format!("rsync.*{}", escaped_name)])
            .output()
            .await
        {
            tracing::warn!("Command failed: {}", e);
        }
    }

    status.state = MigrationState::Cancelled;
    status.completed = Some(Utc::now());

    state
        .store
        .save_entity("migrations", &id, &status)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
        })?;

    Ok(Json(status))
}

// ============================================================================
// Background Migration Task
// ============================================================================

async fn run_migration(state: Arc<AppState>, migration_id: String, req: MigrationRequest) {
    let update_status = |state: &Arc<AppState>,
                         id: &str,
                         mig_state: MigrationState,
                         progress: u32,
                         bytes: u64,
                         error: Option<String>| {
        if let Ok(Some(mut status)) = state.store.get_entity::<MigrationStatus>("migrations", id) {
            status.state = mig_state;
            status.progress_percent = progress;
            status.bytes_transferred = bytes;
            status.error = error;
            if status.progress_percent >= 100 {
                status.completed = Some(Utc::now());
            }
            if let Err(e) = state.store.save_entity("migrations", id, &status) {
                tracing::error!("Failed to save: {}", e);
            }
        }
    };

    // Pre-check: verify target host reachable
    update_status(&state, &migration_id, MigrationState::PreCheck, 5, 0, None);

    let ssh_check = tokio::process::Command::new("ssh")
        .args([
            "-o",
            "ConnectTimeout=5",
            "-o",
            "BatchMode=yes",
            &req.target_host,
            "echo ok",
        ])
        .output()
        .await;

    match ssh_check {
        Ok(output) if output.status.success() => {
            tracing::info!(
                "Migration {}: target host {} is reachable",
                migration_id,
                req.target_host
            );
        }
        _ => {
            update_status(
                &state,
                &migration_id,
                MigrationState::Failed,
                5,
                0,
                Some(format!(
                    "Target host '{}' is not reachable via SSH",
                    req.target_host
                )),
            );
            return;
        }
    }

    // Create migration config for the migration crate
    let config = migration::MigrationConfig {
        vm_name: req.vm_name.clone(),
        source_node: "localhost".to_string(),
        target_node: req.target_host.clone(),
        live: matches!(req.migration_type, MigrationType::Live),
        compress: req.compress.unwrap_or(true),
        bandwidth_mbps: req.bandwidth_mbps,
    };

    let workspace = "/var/lib/vmspawnd/migrations";
    let manager = match migration::MigrationManager::new(workspace) {
        Ok(m) => m,
        Err(e) => {
            update_status(
                &state,
                &migration_id,
                MigrationState::Failed,
                5,
                0,
                Some(format!("Failed to initialize migration: {}", e)),
            );
            return;
        }
    };

    update_status(&state, &migration_id, MigrationState::Syncing, 20, 0, None);

    match manager.migrate_vm(&config).await {
        Ok(result) => {
            let final_state = match result.status {
                migration::MigrationState::Completed => MigrationState::Completed,
                migration::MigrationState::Failed => MigrationState::Failed,
                _ => MigrationState::Completed,
            };
            update_status(
                &state,
                &migration_id,
                final_state.clone(),
                100,
                0,
                result.error,
            );
            if matches!(final_state, MigrationState::Completed) {
                crate::api::events::record_event(
                    &state,
                    crate::api::events::VMEventType::Migrated,
                    &req.vm_name,
                    Some(format!("Migrated to {}", req.target_host)),
                );
            } else {
                crate::api::events::record_event(
                    &state,
                    crate::api::events::VMEventType::Error,
                    &req.vm_name,
                    Some("Migration completed with failed status".to_string()),
                );
            }
            tracing::info!(
                "Migration {} completed for VM '{}'",
                migration_id,
                req.vm_name
            );
        }
        Err(e) => {
            update_status(
                &state,
                &migration_id,
                MigrationState::Failed,
                0,
                0,
                Some(e.to_string()),
            );
            crate::api::events::record_event(
                &state,
                crate::api::events::VMEventType::Error,
                &req.vm_name,
                Some(format!("Migration failed: {}", e)),
            );
            tracing::error!(
                "Migration {} failed for VM '{}': {}",
                migration_id,
                req.vm_name,
                e
            );
        }
    }
}
