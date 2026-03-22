use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use chrono::{DateTime, Utc};
use tokio::process::Command;

use crate::server::AppState;
use security::{RequireRead, RequireWrite, RequireAdmin};
use crate::validation::validate_vm_name;

// ============================================================================
// KSM (Kernel Same-page Merging) Memory Deduplication
// ============================================================================

#[derive(Debug, Serialize)]
pub struct KsmStatus {
    pub enabled: bool,
    pub pages_shared: u64,
    pub pages_sharing: u64,
    pub pages_unshared: u64,
    pub pages_volatile: u64,
    pub full_scans: u64,
    pub sleep_ms: u64,
    pub pages_to_scan: u64,
}

#[derive(Debug, Deserialize)]
pub struct KsmConfigRequest {
    pub enabled: bool,
    pub sleep_ms: Option<u64>,
    pub pages_to_scan: Option<u64>,
}

/// GET /api/system/ksm - Get KSM status
pub async fn get_ksm_status() -> Result<Json<KsmStatus>, (StatusCode, String)> {
    tracing::debug!("vm_advanced::{}", stringify!(get_ksm_status));
    let read_ksm = |file: &str| -> u64 {
        std::fs::read_to_string(format!("/sys/kernel/mm/ksm/{}", file))
            .unwrap_or_default()
            .trim()
            .parse()
            .unwrap_or(0)
    };

    let run = read_ksm("run");

    Ok(Json(KsmStatus {
        enabled: run == 1,
        pages_shared: read_ksm("pages_shared"),
        pages_sharing: read_ksm("pages_sharing"),
        pages_unshared: read_ksm("pages_unshared"),
        pages_volatile: read_ksm("pages_volatile"),
        full_scans: read_ksm("full_scans"),
        sleep_ms: read_ksm("sleep_millisecs"),
        pages_to_scan: read_ksm("pages_to_scan"),
    }))
}

/// POST /api/system/ksm - Enable/disable/configure KSM
pub async fn configure_ksm(
    Json(req): Json<KsmConfigRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::debug!("vm_advanced::{}", stringify!(configure_ksm));
    let run_value = if req.enabled { "1" } else { "0" };
    tokio::fs::write("/sys/kernel/mm/ksm/run", run_value).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to set KSM: {}", e)))?;

    if let Some(sleep_ms) = req.sleep_ms {
        if let Err(e) = tokio::fs::write("/sys/kernel/mm/ksm/sleep_millisecs", sleep_ms.to_string()).await {
            tracing::warn!("Failed to write: {}", e);
        }
    }

    if let Some(pages) = req.pages_to_scan {
        if let Err(e) = tokio::fs::write("/sys/kernel/mm/ksm/pages_to_scan", pages.to_string()).await {
            tracing::warn!("Failed to write: {}", e);
        }
    }

    Ok(StatusCode::OK)
}

// ============================================================================
// Nested Virtualization
// ============================================================================

#[derive(Debug, Serialize)]
pub struct NestedVirtStatus {
    pub supported: bool,
    pub enabled: bool,
    pub hypervisor: String,
}

/// GET /api/system/nested-virt - Get nested virtualization status
pub async fn get_nested_virt_status() -> Json<NestedVirtStatus> {
    tracing::debug!("vm_advanced::{}", stringify!(get_nested_virt_status));
    // Check for Intel (kvm_intel) or AMD (kvm_amd)
    let (hypervisor, path) = if std::path::Path::new("/sys/module/kvm_intel").exists() {
        ("kvm_intel", "/sys/module/kvm_intel/parameters/nested")
    } else if std::path::Path::new("/sys/module/kvm_amd").exists() {
        ("kvm_amd", "/sys/module/kvm_amd/parameters/nested")
    } else {
        return Json(NestedVirtStatus {
            supported: false,
            enabled: false,
            hypervisor: "none".to_string(),
        });
    };

    let enabled = tokio::fs::read_to_string(path).await
        .map(|v| {
            let v = v.trim();
            v == "1" || v == "Y"
        })
        .unwrap_or(false);

    Json(NestedVirtStatus {
        supported: true,
        enabled,
        hypervisor: hypervisor.to_string(),
    })
}

#[derive(Debug, Deserialize)]
pub struct SetNestedVirtRequest {
    pub enabled: bool,
}

/// POST /api/system/nested-virt - Enable/disable nested virtualization
pub async fn set_nested_virt(
    Json(req): Json<SetNestedVirtRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::debug!("vm_advanced::{}", stringify!(set_nested_virt));
    let path = if std::path::Path::new("/sys/module/kvm_intel").exists() {
        "/sys/module/kvm_intel/parameters/nested"
    } else if std::path::Path::new("/sys/module/kvm_amd").exists() {
        "/sys/module/kvm_amd/parameters/nested"
    } else {
        return Err((StatusCode::NOT_FOUND, "KVM module not loaded".to_string()));
    };

    let value = if req.enabled { "1" } else { "0" };
    tokio::fs::write(path, value).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to set nested virt: {}", e)))?;

    Ok(StatusCode::OK)
}

// ============================================================================
// VM Checkpoints (save/restore full runtime state)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VMCheckpoint {
    pub id: String,
    pub vm_name: String,
    pub name: String,
    pub description: Option<String>,
    pub size_bytes: u64,
    pub created: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCheckpointRequest {
    pub name: String,
    pub description: Option<String>,
}

/// POST /api/vms/:name/checkpoints - Create a checkpoint (QEMU savevm)
pub async fn create_checkpoint(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
    Json(req): Json<CreateCheckpointRequest>,
) -> Result<(StatusCode, Json<VMCheckpoint>), (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("vm_advanced::{}", stringify!(create_checkpoint));
    validate_vm_name(&vm_name).map_err(|(s, m)| (s, Json(json!({ "error": m }))))?;

    // Validate checkpoint name
    if let Err((status, msg)) = crate::validation::validate_snapshot_name(&req.name) {
        return Err((status, Json(json!({ "error": msg }))));
    }

    // Find the disk image for this VM
    let image_path = crate::validation::find_vm_image_or_default(&vm_name);

    // Create internal snapshot via qemu-img
    let output = Command::new("qemu-img")
        .args(["snapshot", "-c", &req.name, &image_path])
        .output()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("qemu-img failed: {}", e) }))))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("Checkpoint failed: {}", stderr) }))));
    }

    let size = tokio::fs::metadata(&image_path).await.map(|m| m.len()).unwrap_or(0);

    let checkpoint = VMCheckpoint {
        id: uuid::Uuid::new_v4().to_string(),
        vm_name: vm_name.clone(),
        name: req.name,
        description: req.description,
        size_bytes: size,
        created: Utc::now(),
    };

    state.store.save_entity("checkpoints", &checkpoint.id, &checkpoint).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok((StatusCode::CREATED, Json(checkpoint)))
}

/// GET /api/vms/:name/checkpoints - List checkpoints for a VM
pub async fn list_checkpoints(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> Result<Json<Vec<VMCheckpoint>>, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("vm_advanced::{}", stringify!(list_checkpoints));
    validate_vm_name(&vm_name).map_err(|(s, m)| (s, Json(json!({ "error": m }))))?;

    let all: Vec<VMCheckpoint> = state.store.list_entities("checkpoints").unwrap_or_else(|e| { tracing::error!("Storage error: {}", e); Vec::new() });
    let filtered: Vec<VMCheckpoint> = all.into_iter()
        .filter(|c| c.vm_name == vm_name)
        .collect();

    Ok(Json(filtered))
}

/// POST /api/vms/:name/checkpoints/:id/restore - Restore a checkpoint
pub async fn restore_checkpoint(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path((vm_name, id)): Path<(String, String)>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("vm_advanced::{}", stringify!(restore_checkpoint));
    validate_vm_name(&vm_name).map_err(|(s, m)| (s, Json(json!({ "error": m }))))?;

    let checkpoint = match state.store.get_entity::<VMCheckpoint>("checkpoints", &id) {
        Ok(Some(c)) => c,
        Ok(None) => return Err((StatusCode::NOT_FOUND, Json(json!({ "error": "Checkpoint not found" })))),
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))),
    };

    let image_path = crate::validation::find_vm_image_or_default(&vm_name);

    // Apply snapshot via qemu-img
    let output = Command::new("qemu-img")
        .args(["snapshot", "-a", &checkpoint.name, &image_path])
        .output()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("qemu-img failed: {}", e) }))))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("Restore failed: {}", stderr) }))));
    }

    Ok(StatusCode::OK)
}

/// DELETE /api/vms/:name/checkpoints/:id - Delete a checkpoint
pub async fn delete_checkpoint(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path((vm_name, id)): Path<(String, String)>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("vm_advanced::{}", stringify!(delete_checkpoint));
    validate_vm_name(&vm_name).map_err(|(s, m)| (s, Json(json!({ "error": m }))))?;

    if let Ok(Some(checkpoint)) = state.store.get_entity::<VMCheckpoint>("checkpoints", &id) {
        let image_path = crate::validation::find_vm_image_or_default(&vm_name);
        if let Err(e) = Command::new("qemu-img")
            .args(["snapshot", "-d", &checkpoint.name, &image_path])
            .output()
            .await
        {
            tracing::warn!("Command failed: {}", e);
        }
    }

    state.store.delete_entity("checkpoints", &id).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok(StatusCode::NO_CONTENT)
}

// ============================================================================
// VM Forking (instant copy-on-write clone)
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct ForkVMRequest {
    pub new_name: String,
}

/// POST /api/vms/:name/fork - Instantly fork a VM using CoW backing file
pub async fn fork_vm(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(source_name): Path<String>,
    Json(req): Json<ForkVMRequest>,
) -> Result<(StatusCode, Json<vm_model::VM>), (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("vm_advanced::{}", stringify!(fork_vm));
    validate_vm_name(&source_name).map_err(|(s, m)| (s, Json(json!({ "error": m }))))?;
    validate_vm_name(&req.new_name).map_err(|(s, m)| (s, Json(json!({ "error": m }))))?;

    let source_vm = match state.store.get_vm(&source_name) {
        Ok(Some(vm)) => vm,
        Ok(None) => return Err((StatusCode::NOT_FOUND, Json(json!({ "error": "Source VM not found" })))),
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))),
    };

    if let Ok(Some(_)) = state.store.get_vm(&req.new_name) {
        return Err((StatusCode::CONFLICT, Json(json!({ "error": "Target VM name already exists" }))));
    }

    // Create CoW disk using qemu-img with backing file
    let source_image = crate::validation::find_vm_image_or_default(&source_name);
    let fork_image = format!("/var/lib/vmspawnd/images/{}.qcow2", req.new_name);

    if let Some(parent) = std::path::Path::new(&fork_image).parent() {
        if let Err(e) = tokio::fs::create_dir_all(parent).await {
            tracing::warn!("Failed to create dir: {}", e);
        }
    }

    let output = Command::new("qemu-img")
        .args(["create", "-f", "qcow2", "-b", &source_image, "-F", "qcow2", &fork_image])
        .output()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("qemu-img create failed: {}", e) }))))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("Fork failed: {}", stderr) }))));
    }

    // Create new VM entry copying source config
    let mut forked = source_vm.clone();
    forked.name = req.new_name.clone();
    forked.state = vm_model::VMState::Stopped;
    forked.pid = None;
    forked.ip = None;
    forked.image = fork_image;
    forked.created = Utc::now();
    forked.updated = Some(Utc::now());

    state.store.save_vm(&forked).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    // Record event
    crate::api::events::record_event(
        &state,
        crate::api::events::VMEventType::Cloned,
        &req.new_name,
        Some(format!("Forked from '{}' (CoW backing file)", source_name)),
    );

    Ok((StatusCode::CREATED, Json(forked)))
}

