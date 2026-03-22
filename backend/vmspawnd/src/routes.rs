use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use vm_model::CreateVMRequest;
use cloud_init::{CloudInitConfig, CloudInitGenerator};
use security::{RequireRead, RequireWrite, RequireAdmin};

use crate::server::AppState;
use crate::validation::validate_vm_name;
use vmspawnd_driver_core::{VMDriver, ResourceStatsDriver};

#[derive(Debug, Deserialize)]
pub struct PaginationQuery {
    #[serde(default)]
    pub offset: Option<usize>,
    #[serde(default)]
    pub limit: Option<usize>,
}

/// Helper: record an audit log entry.
fn audit(_state: &AppState, user: &str, action: &str, resource: &str, status: &str) {
    let entry = security::AuditLog::new(
        user.to_string(),
        action.to_string(),
        resource.to_string(),
        status.to_string(),
    );
    if let Err(e) = entry.log() {
        tracing::warn!("Failed to write audit log: {}", e);
    }
}

/// Standard JSON error response.
fn json_error(status: StatusCode, msg: impl Into<String>) -> (StatusCode, Json<serde_json::Value>) {
    (status, Json(json!({ "error": msg.into() })))
}

/// JSON error with path sanitization for non-admin users.
fn json_error_safe(status: StatusCode, msg: impl Into<String>, claims: &security::Claims) -> (StatusCode, Json<serde_json::Value>) {
    let msg = msg.into();
    let safe_msg = if claims.role.can_manage() {
        msg
    } else {
        crate::validation::sanitize_error(&msg)
    };
    (status, Json(json!({ "error": safe_msg })))
}

pub async fn list_vms(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Query(pagination): Query<PaginationQuery>,
) -> impl IntoResponse {
    let offset = pagination.offset.unwrap_or(0);
    let limit = pagination.limit.unwrap_or(200);
    // Cap limit to prevent abuse
    let limit = limit.min(1000);

    match state.store.list_vms_paginated(offset, limit) {
        Ok((vms, total)) => (
            StatusCode::OK,
            Json(json!({ "items": vms, "total": total, "offset": offset, "limit": limit })),
        ).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn get_vm(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&name) {
        return json_error(status, msg).into_response();
    }
    match state.store.get_vm(&name) {
        Ok(Some(vm)) => (StatusCode::OK, Json(vm)).into_response(),
        Ok(None) => json_error(StatusCode::NOT_FOUND, "VM not found").into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn create_vm(
    RequireWrite(claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateVMRequest>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&req.name) {
        return json_error(status, msg).into_response();
    }
    match vmspawn_driver::create_vm(&req) {
        Ok(vm) => {
            if let Err(e) = state.store.save_vm(&vm) {
                return json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
            }

            // Allocate security identity if VM has labels
            if let Some(ref labels) = vm.labels {
                if !labels.is_empty() {
                    match state.policy_engine.allocator.allocate_or_get(labels, &vm.name) {
                        Ok(id) => {
                            if let Some(ref ip) = vm.ip {
                                if let Err(e) = state.policy_engine.allocator.update_ip_mapping(ip, id) {
                                    tracing::warn!("Failed to update IP mapping for VM '{}': {}", vm.name, e);
                                }
                            }
                            tracing::debug!("Allocated identity {} for VM '{}'", id, vm.name);
                        }
                        Err(e) => {
                            tracing::warn!("Failed to allocate identity for VM '{}': {}", vm.name, e);
                        }
                    }
                }
            }

            audit(&state, &claims.sub, "CREATE", &format!("vm/{}", vm.name), "SUCCESS");
            (StatusCode::CREATED, Json(vm)).into_response()
        }
        Err(e) => {
            audit(&state, &claims.sub, "CREATE", &format!("vm/{}", req.name), "FAILED");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
    }
}

pub async fn delete_vm(
    RequireAdmin(claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&name) {
        return json_error(status, msg).into_response();
    }

    let _lock = state.vm_lock(&name).lock_owned().await;

    // Deallocate security identity before deleting VM
    if let Ok(Some(vm)) = state.store.get_vm(&name) {
        if let Some(ref labels) = vm.labels {
            if !labels.is_empty() {
                if let Err(e) = state.policy_engine.allocator.deallocate(&name, labels) {
                    tracing::warn!("Failed to deallocate identity for VM '{}': {}", name, e);
                }
            }
        }
        if let Some(ref ip) = vm.ip {
            if let Err(e) = state.policy_engine.allocator.remove_ip_mapping(ip) {
                tracing::warn!("Failed to remove IP mapping for VM '{}': {}", name, e);
            }
        }
    }

    match state.store.delete_vm(&name) {
        Ok(_) => {
            audit(&state, &claims.sub, "DELETE", &format!("vm/{}", name), "SUCCESS");
            StatusCode::NO_CONTENT.into_response()
        }
        Err(e) => {
            audit(&state, &claims.sub, "DELETE", &format!("vm/{}", name), "FAILED");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
    }
}

pub async fn start_vm(
    RequireWrite(claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&name) {
        return json_error(status, msg).into_response();
    }

    // Acquire per-VM lock to serialize state transitions
    let vm_mutex = state.vm_lock(&name);
    let _lock = vm_mutex.lock().await;

    // Check current state before transitioning
    if let Ok(Some(vm)) = state.store.get_vm(&name) {
        match vm.state {
            vm_model::VMState::Running | vm_model::VMState::Starting => {
                return json_error(StatusCode::CONFLICT, format!("VM is already {:?}", vm.state)).into_response();
            }
            _ => {}
        }
    }

    // Mark as starting (not running — that happens after success)
    if let Ok(Some(mut vm)) = state.store.get_vm(&name) {
        vm.state = vm_model::VMState::Starting;
        if let Err(e) = state.store.save_vm(&vm) {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to save VM state: {}", e)).into_response();
        }
    }

    audit(&state, &claims.sub, "START", &format!("vm/{}", name), "ACCEPTED");

    // Spawn start in background so API returns immediately
    let vm_name = name.clone();
    let state_clone = state.clone();
    tokio::spawn(async move {
        // Re-acquire lock in background task
        let vm_mutex = state_clone.vm_lock(&vm_name);
        let _lock = vm_mutex.lock().await;

        match state_clone.driver.start(&vm_name).await {
            Ok(_) => {
                tracing::info!("VM '{}' started successfully", vm_name);
                if let Ok(Some(mut vm)) = state_clone.store.get_vm(&vm_name) {
                    vm.state = vm_model::VMState::Running;
                    if let Err(e) = state_clone.store.save_vm(&vm) {
                        tracing::error!("Failed to save VM state: {}", e);
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to start VM '{}': {}", vm_name, e);
                if let Ok(Some(mut vm)) = state_clone.store.get_vm(&vm_name) {
                    vm.state = vm_model::VMState::Stopped;
                    if let Err(e) = state_clone.store.save_vm(&vm) {
                        tracing::error!("Failed to save VM state: {}", e);
                    }
                }
            }
        }
    });

    (StatusCode::ACCEPTED, Json(json!({ "status": "starting" }))).into_response()
}

pub async fn stop_vm(
    RequireWrite(claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&name) {
        return json_error(status, msg).into_response();
    }

    let _lock = state.vm_lock(&name).lock_owned().await;

    match state.driver.poweroff(&name).await {
        Ok(_) => {
            if let Ok(Some(mut vm)) = state.store.get_vm(&name) {
                vm.state = vm_model::VMState::Stopped;
                if let Err(e) = state.store.save_vm(&vm) {
                    tracing::error!("Failed to save VM state: {}", e);
                }
            }
            audit(&state, &claims.sub, "STOP", &format!("vm/{}", name), "SUCCESS");
            (StatusCode::OK, Json(json!({ "status": "stopped" }))).into_response()
        }
        Err(e) => {
            audit(&state, &claims.sub, "STOP", &format!("vm/{}", name), "FAILED");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
    }
}

pub async fn restart_vm(
    RequireWrite(claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&name) {
        return json_error(status, msg).into_response();
    }

    let _lock = state.vm_lock(&name).lock_owned().await;

    match state.driver.reboot(&name).await {
        Ok(_) => {
            if let Ok(Some(mut vm)) = state.store.get_vm(&name) {
                vm.state = vm_model::VMState::Running;
                if let Err(e) = state.store.save_vm(&vm) {
                    tracing::error!("Failed to save VM state: {}", e);
                }
            }
            audit(&state, &claims.sub, "RESTART", &format!("vm/{}", name), "SUCCESS");
            (StatusCode::OK, Json(json!({ "status": "restarted" }))).into_response()
        }
        Err(e) => {
            audit(&state, &claims.sub, "RESTART", &format!("vm/{}", name), "FAILED");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
    }
}

pub async fn pause_vm(
    RequireWrite(claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&name) {
        return json_error(status, msg).into_response();
    }

    let _lock = state.vm_lock(&name).lock_owned().await;

    match vmspawn_driver::pause_vm(&name) {
        Ok(_) => {
            if let Ok(Some(mut vm)) = state.store.get_vm(&name) {
                vm.state = vm_model::VMState::Paused;
                if let Err(e) = state.store.save_vm(&vm) {
                    tracing::error!("Failed to save VM state: {}", e);
                }
            }
            audit(&state, &claims.sub, "PAUSE", &format!("vm/{}", name), "SUCCESS");
            (StatusCode::OK, Json(json!({ "status": "paused" }))).into_response()
        }
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn resume_vm(
    RequireWrite(claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&name) {
        return json_error(status, msg).into_response();
    }

    let _lock = state.vm_lock(&name).lock_owned().await;

    match vmspawn_driver::resume_vm(&name) {
        Ok(_) => {
            if let Ok(Some(mut vm)) = state.store.get_vm(&name) {
                vm.state = vm_model::VMState::Running;
                if let Err(e) = state.store.save_vm(&vm) {
                    tracing::error!("Failed to save VM state: {}", e);
                }
            }
            audit(&state, &claims.sub, "RESUME", &format!("vm/{}", name), "SUCCESS");
            (StatusCode::OK, Json(json!({ "status": "running" }))).into_response()
        }
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize)]
pub struct CloneVMRequest {
    pub target_name: String,
    #[serde(default)]
    pub linked_clone: bool,
}

pub async fn clone_vm(
    RequireWrite(claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(source_name): Path<String>,
    Json(req): Json<CloneVMRequest>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&source_name) {
        return json_error(status, msg).into_response();
    }
    if let Err((status, msg)) = validate_vm_name(&req.target_name) {
        return json_error(status, msg).into_response();
    }

    // Prevent cloning to same name
    if source_name == req.target_name {
        return json_error(StatusCode::BAD_REQUEST, "Source and target VM names must be different").into_response();
    }

    // Lock both VMs to prevent concurrent operations
    let _source_lock = state.vm_lock(&source_name).lock_owned().await;
    let _target_lock = state.vm_lock(&req.target_name).lock_owned().await;

    // Check source VM exists
    let source_vm = match state.store.get_vm(&source_name) {
        Ok(Some(vm)) => vm,
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "Source VM not found").into_response();
        }
        Err(e) => {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    };

    // Check target name not taken
    if let Ok(Some(_)) = state.store.get_vm(&req.target_name) {
        return json_error(StatusCode::CONFLICT, "Target VM name already exists").into_response();
    }

    // Find source disk image — fail if not found
    let src_path = match crate::validation::find_vm_image(&source_name) {
        Some(p) => p,
        None => {
            return json_error(
                StatusCode::NOT_FOUND,
                format!("No disk image found for source VM '{}'", source_name),
            ).into_response();
        }
    };

    // Build target path
    let src = std::path::Path::new(&src_path);
    let target_path = if let Some(parent) = src.parent() {
        let parent_str = parent.to_string_lossy();
        let safe_parent = if parent_str.ends_with(&source_name) {
            format!("{}{}", &parent_str[..parent_str.len() - source_name.len()], &req.target_name)
        } else {
            parent_str.to_string()
        };
        format!("{}/{}.qcow2", safe_parent, &req.target_name)
    } else {
        format!("{}.qcow2", &req.target_name)
    };

    // Ensure target directory exists
    if let Some(parent) = std::path::Path::new(&target_path).parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return json_error_safe(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create directory: {}", e), &claims).into_response();
        }
    }

    let result = if req.linked_clone {
        tokio::process::Command::new("qemu-img")
            .args(["create", "-f", "qcow2", "-b", &src_path, "-F", "qcow2", &target_path])
            .output()
            .await
    } else {
        tokio::process::Command::new("cp")
            .args(["--reflink=auto", &src_path, &target_path])
            .output()
            .await
    };

    match result {
        Ok(output) if !output.status.success() => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            audit(&state, &claims.sub, "CLONE", &format!("vm/{}->{}", source_name, req.target_name), "FAILED");
            return json_error_safe(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to clone disk: {}", stderr), &claims).into_response();
        }
        Err(e) => {
            audit(&state, &claims.sub, "CLONE", &format!("vm/{}->{}", source_name, req.target_name), "FAILED");
            return json_error_safe(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to clone disk: {}", e), &claims).into_response();
        }
        _ => {}
    }

    // Create new VM entry
    let mut new_vm = source_vm.clone();
    new_vm.name = req.target_name.clone();
    new_vm.state = vm_model::VMState::Stopped;
    new_vm.pid = None;
    new_vm.ip = None;
    new_vm.created = chrono::Utc::now();
    new_vm.updated = Some(chrono::Utc::now());

    match state.store.save_vm(&new_vm) {
        Ok(_) => {
            audit(&state, &claims.sub, "CLONE", &format!("vm/{}->{}", source_name, req.target_name), "SUCCESS");
            (StatusCode::CREATED, Json(new_vm)).into_response()
        }
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn get_metrics(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&name) {
        return json_error(status, msg).into_response();
    }
    match state.driver.get_metrics(&name).await {
        Ok(metrics) => (StatusCode::OK, Json(metrics)).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn configure_cloud_init(
    RequireWrite(_claims): RequireWrite,
    State(_state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
    Json(config): Json<CloudInitConfig>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&vm_name) {
        return json_error(status, msg).into_response();
    }
    let generator = match CloudInitGenerator::new("/var/lib/vmspawnd/cloud-init") {
        Ok(gen) => gen,
        Err(e) => {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    };

    match generator.generate(&config) {
        Ok(iso_path) => (
            StatusCode::OK,
            Json(json!({
                "status": "created",
                "iso_path": iso_path.to_string_lossy()
            })),
        )
            .into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}
