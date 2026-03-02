use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use std::sync::Arc;
use vm_model::CreateVMRequest;
use cloud_init::{CloudInitConfig, CloudInitGenerator};
use security::{RequireRead, RequireWrite, RequireAdmin};

use crate::server::AppState;
use crate::validation::validate_vm_name;

pub async fn list_vms(RequireRead(_claims): RequireRead, State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.store.list_vms() {
        Ok(vms) => (StatusCode::OK, Json(vms)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_vm(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&name) {
        return (status, Json(json!({ "error": msg }))).into_response();
    }
    match state.store.get_vm(&name) {
        Ok(Some(vm)) => (StatusCode::OK, Json(vm)).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({ "error": "VM not found" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn create_vm(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateVMRequest>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&req.name) {
        return (status, Json(json!({ "error": msg }))).into_response();
    }
    match vmspawn_driver::create_vm(&req) {
        Ok(vm) => {
            if let Err(e) = state.store.save_vm(&vm) {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e.to_string() })),
                )
                    .into_response();
            }
            (StatusCode::CREATED, Json(vm)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn delete_vm(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&name) {
        return (status, Json(json!({ "error": msg }))).into_response();
    }
    match state.store.delete_vm(&name) {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn start_vm(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&name) {
        return (status, Json(json!({ "error": msg }))).into_response();
    }

    // Mark as running immediately (machinectl start blocks until boot completes)
    if let Ok(Some(mut vm)) = state.store.get_vm(&name) {
        vm.state = vm_model::VMState::Running;
        if let Err(e) = state.store.save_vm(&vm) {
            tracing::error!("Failed to save VM state: {}", e);
        }
    }

    // Spawn machinectl start in background so API returns immediately
    let vm_name = name.clone();
    let state_clone = state.clone();
    tokio::spawn(async move {
        let result = tokio::task::spawn_blocking(move || {
            vmspawn_driver::start_vm(&vm_name)
        }).await;

        match result {
            Ok(Ok(_)) => {
                tracing::info!("VM '{}' started successfully", name);
            }
            Ok(Err(e)) => {
                tracing::error!("Failed to start VM '{}': {}", name, e);
                // Revert state on failure
                if let Ok(Some(mut vm)) = state_clone.store.get_vm(&name) {
                    vm.state = vm_model::VMState::Stopped;
                    if let Err(e) = state_clone.store.save_vm(&vm) {
                        tracing::error!("Failed to save VM state: {}", e);
                    }
                }
            }
            Err(e) => {
                tracing::error!("Start task panicked for VM '{}': {}", name, e);
                if let Ok(Some(mut vm)) = state_clone.store.get_vm(&name) {
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
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&name) {
        return (status, Json(json!({ "error": msg }))).into_response();
    }
    match vmspawn_driver::stop_vm(&name) {
        Ok(_) => {
            if let Ok(Some(mut vm)) = state.store.get_vm(&name) {
                vm.state = vm_model::VMState::Stopped;
                if let Err(e) = state.store.save_vm(&vm) {
                    tracing::error!("Failed to save VM state: {}", e);
                }
            }
            (StatusCode::OK, Json(json!({ "status": "stopped" }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn restart_vm(
    RequireWrite(_claims): RequireWrite,
    State(_state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&name) {
        return (status, Json(json!({ "error": msg }))).into_response();
    }
    match vmspawn_driver::restart_vm(&name) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "restarted" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn pause_vm(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&name) {
        return (status, Json(json!({ "error": msg }))).into_response();
    }
    match vmspawn_driver::pause_vm(&name) {
        Ok(_) => {
            if let Ok(Some(mut vm)) = state.store.get_vm(&name) {
                vm.state = vm_model::VMState::Paused;
                if let Err(e) = state.store.save_vm(&vm) {
                    tracing::error!("Failed to save VM state: {}", e);
                }
            }
            (StatusCode::OK, Json(json!({ "status": "paused" }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn resume_vm(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&name) {
        return (status, Json(json!({ "error": msg }))).into_response();
    }
    match vmspawn_driver::resume_vm(&name) {
        Ok(_) => {
            if let Ok(Some(mut vm)) = state.store.get_vm(&name) {
                vm.state = vm_model::VMState::Running;
                if let Err(e) = state.store.save_vm(&vm) {
                    tracing::error!("Failed to save VM state: {}", e);
                }
            }
            (StatusCode::OK, Json(json!({ "status": "running" }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

#[derive(serde::Deserialize)]
pub struct CloneVMRequest {
    pub target_name: String,
    #[serde(default)]
    pub linked_clone: bool,
}

pub async fn clone_vm(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(source_name): Path<String>,
    Json(req): Json<CloneVMRequest>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&source_name) {
        return (status, Json(json!({ "error": msg }))).into_response();
    }
    if let Err((status, msg)) = validate_vm_name(&req.target_name) {
        return (status, Json(json!({ "error": msg }))).into_response();
    }

    // Check source VM exists
    let source_vm = match state.store.get_vm(&source_name) {
        Ok(Some(vm)) => vm,
        Ok(None) => {
            return (StatusCode::NOT_FOUND, Json(json!({ "error": "Source VM not found" }))).into_response();
        }
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
        }
    };

    // Check target name not taken
    if let Ok(Some(_)) = state.store.get_vm(&req.target_name) {
        return (StatusCode::CONFLICT, Json(json!({ "error": "Target VM name already exists" }))).into_response();
    }

    // Copy disk image
    let source_image_candidates = [
        format!("/var/lib/machines/{}.qcow2", source_name),
        format!("/var/lib/machines/{}/{}.qcow2", source_name, source_name),
        format!("/var/lib/vmspawnd/images/{}.qcow2", source_name),
    ];

    let source_image = source_image_candidates.iter()
        .find(|p| std::path::Path::new(p).exists());

    if let Some(src_path) = source_image {
        // Build target path by replacing only the filename, not arbitrary path components.
        // Using String::replace on the full path is dangerous because the VM name could
        // appear in directory components too, producing unexpected results.
        let src = std::path::Path::new(src_path.as_str());
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
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": format!("Failed to create directory: {}", e) })),
                ).into_response();
            }
        }

        let result = if req.linked_clone {
            // Linked clone: use qemu-img create with backing file
            tokio::process::Command::new("qemu-img")
                .args(["create", "-f", "qcow2", "-b", src_path, "-F", "qcow2", &target_path])
                .output()
                .await
        } else {
            // Full clone: use cp --reflink=auto for CoW on supported filesystems
            tokio::process::Command::new("cp")
                .args(["--reflink=auto", src_path, &target_path])
                .output()
                .await
        };

        match result {
            Ok(output) if !output.status.success() => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": format!("Failed to clone disk: {}", stderr) })),
                ).into_response();
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": format!("Failed to clone disk: {}", e) })),
                ).into_response();
            }
            _ => {}
        }
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
        Ok(_) => (StatusCode::CREATED, Json(new_vm)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        ).into_response(),
    }
}

pub async fn get_metrics(
    RequireRead(_claims): RequireRead,
    State(_state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&name) {
        return (status, Json(json!({ "error": msg }))).into_response();
    }
    match vmspawn_driver::get_metrics(&name) {
        Ok(metrics) => (StatusCode::OK, Json(metrics)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn configure_cloud_init(
    RequireWrite(_claims): RequireWrite,
    State(_state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
    Json(config): Json<CloudInitConfig>,
) -> impl IntoResponse {
    if let Err((status, msg)) = validate_vm_name(&vm_name) {
        return (status, Json(json!({ "error": msg }))).into_response();
    }
    let generator = match CloudInitGenerator::new("/var/lib/vmspawnd/cloud-init") {
        Ok(gen) => gen,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response()
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
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}
