// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::api::events;
use crate::qmp::QmpClient;
use crate::server::AppState;
use security::RequireWrite;

#[derive(Debug, Deserialize)]
pub struct HotplugCpuRequest {
    pub count: u32,
}

#[derive(Debug, Deserialize)]
pub struct HotplugMemoryRequest {
    pub size_mb: u64,
}

#[derive(Debug, Deserialize)]
pub struct HotplugDiskRequest {
    pub path: String,
    #[serde(default = "default_bus")]
    pub bus: String,
}

fn default_bus() -> String {
    "virtio".to_string()
}

#[derive(Debug, Deserialize)]
pub struct HotplugNicRequest {
    pub bridge: String,
    #[serde(default)]
    pub model: Option<String>,
}

fn not_available_response() -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(serde_json::json!({
            "error": "QMP socket not available for this VM's driver backend."
        })),
    )
}

/// Resolve `vm_name`'s QMP control socket via the active driver backend
/// (`MachinectlDriver`'s systemd-vmspawn convention, or Ephemera's
/// `VmRecord.control_socket`), returning `None` if the driver has no
/// socket for it (not running, unknown, or a backend/hypervisor with no
/// QMP equivalent) — the caller falls back to `not_available_response()`.
async fn resolve_qmp(state: &AppState, vm_name: &str) -> Option<QmpClient> {
    match state.driver.get_control_socket(vm_name).await {
        Ok(Some(path)) => Some(QmpClient::for_socket(path.to_string_lossy().into_owned())),
        Ok(None) => None,
        Err(e) => {
            tracing::warn!("Failed to resolve QMP control socket for '{vm_name}': {e:#}");
            None
        }
    }
}

/// POST /api/vms/:name/hotplug/cpu - Hot-add vCPUs
pub async fn hotplug_cpu(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
    Json(req): Json<HotplugCpuRequest>,
) -> impl IntoResponse {
    tracing::debug!("hotplug::{}", stringify!(hotplug_cpu));
    if let Err((s, m)) = crate::validation::validate_vm_name(&vm_name) {
        return crate::api_error::json_error(s, m).into_response();
    }
    let Some(qmp) = resolve_qmp(&state, &vm_name).await else {
        return not_available_response().into_response();
    };

    // Query hotpluggable CPUs to find available slots
    match qmp.execute("query-hotpluggable-cpus", serde_json::Value::Null) {
        Ok(cpus) => {
            // Find unrealized CPU slots and add them
            let mut added = 0u32;
            if let Some(cpu_list) = cpus.as_array() {
                for cpu in cpu_list {
                    if added >= req.count {
                        break;
                    }
                    // Skip already-realized CPUs
                    if cpu.get("qom-path").is_some() {
                        continue;
                    }
                    if let Some(props) = cpu.get("props") {
                        // Use the CPU type reported by QEMU instead of hardcoding x86_64
                        let driver = cpu
                            .get("type")
                            .and_then(|v| v.as_str())
                            .unwrap_or("host-x86_64-cpu");
                        let cpu_id = format!("cpu-hotplug-{}", added);
                        let args = serde_json::json!({
                            "driver": driver,
                            "id": cpu_id,
                            "socket-id": props.get("socket-id").and_then(|v| v.as_u64()).unwrap_or(0),
                            "core-id": props.get("core-id").and_then(|v| v.as_u64()).unwrap_or(0),
                            "thread-id": props.get("thread-id").and_then(|v| v.as_u64()).unwrap_or(0),
                        });

                        match qmp.execute("device_add", args) {
                            Ok(_) => added += 1,
                            Err(e) => {
                                let mut body = api_error::api_error_json(
                                    "operation_failed",
                                    format!("CPU hotplug failed: {}", e),
                                );
                                if let Some(obj) = body.as_object_mut() {
                                    obj.insert("added".to_string(), serde_json::json!(added));
                                }
                                return (StatusCode::INTERNAL_SERVER_ERROR, Json(body))
                                    .into_response();
                            }
                        }
                    }
                }
            }

            events::record_event(
                &state,
                events::VMEventType::CpuHotplug,
                &vm_name,
                Some(format!("Added {} vCPUs", added)),
            );
            Json(serde_json::json!({
                "status": "ok",
                "cpus_added": added,
            }))
            .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            crate::api_error::json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to query CPUs: {}", e),
            ),
        )
            .into_response(),
    }
}

/// POST /api/vms/:name/hotplug/memory - Hot-add memory
pub async fn hotplug_memory(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
    Json(req): Json<HotplugMemoryRequest>,
) -> impl IntoResponse {
    tracing::debug!("hotplug::{}", stringify!(hotplug_memory));
    if let Err((s, m)) = crate::validation::validate_vm_name(&vm_name) {
        return crate::api_error::json_error(s, m).into_response();
    }
    let Some(qmp) = resolve_qmp(&state, &vm_name).await else {
        return not_available_response().into_response();
    };

    let size_bytes = req.size_mb * 1024 * 1024;
    let backend_id = format!("mem-hotplug-{}", uuid::Uuid::new_v4().simple());
    let dimm_id = format!("dimm-hotplug-{}", uuid::Uuid::new_v4().simple());

    // Add memory backend
    let backend_args = serde_json::json!({
        "qom-type": "memory-backend-ram",
        "id": backend_id,
        "size": size_bytes,
    });

    if let Err(e) = qmp.execute("object-add", backend_args) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            crate::api_error::json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Memory backend add failed: {}", e),
            ),
        )
            .into_response();
    }

    // Add DIMM device
    let dimm_args = serde_json::json!({
        "driver": "pc-dimm",
        "id": dimm_id,
        "memdev": backend_id,
    });

    match qmp.execute("device_add", dimm_args) {
        Ok(_) => {
            events::record_event(
                &state,
                events::VMEventType::MemoryHotplug,
                &vm_name,
                Some(format!("Added {} MB", req.size_mb)),
            );
            Json(serde_json::json!({
                "status": "ok",
                "memory_added_mb": req.size_mb,
                "dimm_id": dimm_id,
            }))
            .into_response()
        }
        Err(e) => {
            // Rollback: remove the memory backend object since device_add failed
            if let Err(rollback_err) =
                qmp.execute("object-del", serde_json::json!({"id": backend_id}))
            {
                tracing::warn!(
                    "Failed to rollback memory backend '{}': {}",
                    backend_id,
                    rollback_err
                );
            }
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                crate::api_error::json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("DIMM hotplug failed: {}", e),
                ),
            )
                .into_response()
        }
    }
}

/// POST /api/vms/:name/hotplug/disk - Hot-add a disk
pub async fn hotplug_disk(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
    Json(req): Json<HotplugDiskRequest>,
) -> impl IntoResponse {
    tracing::debug!("hotplug::{}", stringify!(hotplug_disk));
    if let Err((s, m)) = crate::validation::validate_vm_name(&vm_name) {
        return crate::api_error::json_error(s, m).into_response();
    }

    // Validate disk path to prevent traversal
    if let Err((status, msg)) = crate::validation::validate_host_path(&req.path) {
        return crate::api_error::json_error(status, msg).into_response();
    }

    let Some(qmp) = resolve_qmp(&state, &vm_name).await else {
        return not_available_response().into_response();
    };

    let node_name = format!("drive-hotplug-{}", uuid::Uuid::new_v4().simple());
    let device_id = format!("disk-hotplug-{}", uuid::Uuid::new_v4().simple());

    // Add block device
    let blockdev_args = serde_json::json!({
        "driver": "qcow2",
        "node-name": node_name,
        "file": {
            "driver": "file",
            "filename": req.path,
        }
    });

    if let Err(e) = qmp.execute("blockdev-add", blockdev_args) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            crate::api_error::json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("blockdev-add failed: {}", e),
            ),
        )
            .into_response();
    }

    // Add device
    let driver = match req.bus.as_str() {
        "scsi" => "scsi-hd",
        "ide" => "ide-hd",
        _ => "virtio-blk-pci",
    };

    let device_args = serde_json::json!({
        "driver": driver,
        "id": device_id,
        "drive": node_name,
    });

    match qmp.execute("device_add", device_args) {
        Ok(_) => {
            events::record_event(
                &state,
                events::VMEventType::DiskAttached,
                &vm_name,
                Some(format!("Disk: {}", req.path)),
            );
            Json(serde_json::json!({
                "status": "ok",
                "device_id": device_id,
                "node_name": node_name,
            }))
            .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            crate::api_error::json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("device_add failed: {}", e),
            ),
        )
            .into_response(),
    }
}

/// DELETE /api/vms/:name/hotplug/disk/:id - Hot-remove a disk
pub async fn hotremove_disk(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path((vm_name, device_id)): Path<(String, String)>,
) -> impl IntoResponse {
    tracing::debug!("hotplug::{}", stringify!(hotremove_disk));
    if let Err((s, m)) = crate::validation::validate_vm_name(&vm_name) {
        return crate::api_error::json_error(s, m).into_response();
    }
    // Validate device_id format (alphanumeric, hyphens, underscores, dots)
    if device_id.is_empty()
        || device_id.len() > 128
        || !device_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return crate::api_error::json_error(StatusCode::BAD_REQUEST, "Invalid device ID")
            .into_response();
    }
    let Some(qmp) = resolve_qmp(&state, &vm_name).await else {
        return not_available_response().into_response();
    };

    let args = serde_json::json!({"id": device_id});
    match qmp.execute("device_del", args) {
        Ok(_) => Json(serde_json::json!({
            "status": "ok",
            "removed": device_id,
        }))
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            crate::api_error::json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("device_del failed: {}", e),
            ),
        )
            .into_response(),
    }
}

/// POST /api/vms/:name/hotplug/nic - Hot-add a NIC
pub async fn hotplug_nic(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
    Json(req): Json<HotplugNicRequest>,
) -> impl IntoResponse {
    tracing::debug!("hotplug::{}", stringify!(hotplug_nic));
    if let Err((s, m)) = crate::validation::validate_vm_name(&vm_name) {
        return crate::api_error::json_error(s, m).into_response();
    }
    let Some(qmp) = resolve_qmp(&state, &vm_name).await else {
        return not_available_response().into_response();
    };

    let netdev_id = format!("net-hotplug-{}", uuid::Uuid::new_v4().simple());
    let device_id = format!("nic-hotplug-{}", uuid::Uuid::new_v4().simple());

    // Validate bridge name
    if let Err(msg) = crate::validation::validate_hostname(&req.bridge) {
        return crate::api_error::json_error(
            StatusCode::BAD_REQUEST,
            format!("Invalid bridge name: {}", msg),
        )
        .into_response();
    }

    // Add netdev (tap backend attached to bridge)
    let netdev_args = serde_json::json!({
        "type": "tap",
        "id": netdev_id,
        "br": req.bridge,
        "helper": "/usr/lib/qemu/qemu-bridge-helper",
    });

    if let Err(e) = qmp.execute("netdev_add", netdev_args) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            crate::api_error::json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("netdev_add failed: {}", e),
            ),
        )
            .into_response();
    }

    // Validate NIC model against allowlist
    const ALLOWED_NIC_MODELS: &[&str] = &["virtio-net-pci", "e1000", "e1000e", "rtl8139"];
    let model = req.model.as_deref().unwrap_or("virtio-net-pci");
    if !ALLOWED_NIC_MODELS.contains(&model) {
        return crate::api_error::json_error(
            StatusCode::BAD_REQUEST,
            format!(
                "Invalid NIC model '{}'. Allowed: {}",
                model,
                ALLOWED_NIC_MODELS.join(", ")
            ),
        )
        .into_response();
    }

    // Add NIC device
    let device_args = serde_json::json!({
        "driver": model,
        "id": device_id,
        "netdev": netdev_id,
    });

    match qmp.execute("device_add", device_args) {
        Ok(_) => Json(serde_json::json!({
            "status": "ok",
            "device_id": device_id,
            "netdev_id": netdev_id,
        }))
        .into_response(),
        Err(e) => {
            // Rollback: remove the orphaned netdev since device_add failed
            if let Err(rollback_err) =
                qmp.execute("netdev_del", serde_json::json!({"id": netdev_id}))
            {
                tracing::warn!(
                    "Failed to rollback netdev '{}': {}",
                    netdev_id,
                    rollback_err
                );
            }
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                crate::api_error::json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("NIC device_add failed: {}", e),
                ),
            )
                .into_response()
        }
    }
}

/// DELETE /api/vms/:name/hotplug/nic/:id - Hot-remove a NIC
pub async fn hotremove_nic(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path((vm_name, device_id)): Path<(String, String)>,
) -> impl IntoResponse {
    tracing::debug!("hotplug::{}", stringify!(hotremove_nic));
    if let Err((s, m)) = crate::validation::validate_vm_name(&vm_name) {
        return crate::api_error::json_error(s, m).into_response();
    }
    // Validate device_id format (alphanumeric, hyphens, underscores, dots)
    if device_id.is_empty()
        || device_id.len() > 128
        || !device_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return crate::api_error::json_error(StatusCode::BAD_REQUEST, "Invalid device ID")
            .into_response();
    }
    let Some(qmp) = resolve_qmp(&state, &vm_name).await else {
        return not_available_response().into_response();
    };

    let args = serde_json::json!({"id": device_id});
    match qmp.execute("device_del", args) {
        Ok(_) => Json(serde_json::json!({
            "status": "ok",
            "removed": device_id,
        }))
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            crate::api_error::json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("NIC device_del failed: {}", e),
            ),
        )
            .into_response(),
    }
}
