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

pub(crate) fn not_available_response() -> impl IntoResponse {
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
pub(crate) async fn resolve_qmp(state: &AppState, vm_name: &str) -> Option<QmpClient> {
    match state.driver.get_control_socket(vm_name).await {
        Ok(Some(path)) => Some(QmpClient::for_socket(path.to_string_lossy().into_owned())),
        Ok(None) => None,
        Err(e) => {
            tracing::warn!("Failed to resolve QMP control socket for '{vm_name}': {e:#}");
            None
        }
    }
}

/// Number of empty `pcie-root-port` slots Ephemera reserves at boot for
/// device hotplug (see `ephemera-qemu::HOTPLUG_PCIE_PORTS` -- this
/// convention is mirrored here rather than shared as code, since the two
/// talk over Ephemera's REST API, not a Rust dependency).
const HOTPLUG_PCIE_PORTS: u8 = 4;

/// q35's built-in `ich9-ahci` SATA controller (present on every VM without
/// any boot-time device needed -- confirmed live via `qom-list` against a
/// freshly booted VM) exposes 6 IDE-bus ports, `ide.0`..`ide.5`, all empty
/// by default since the boot disk is virtio-blk-pci, not SATA.
const IDE_PORTS: u8 = 6;

/// `device_add` onto the first of `bus_candidates` that accepts it, trying
/// each in turn -- used both for PCIe hotplug (`hotplug-pcie-0..N`, one
/// device per port) and IDE hotplug (`ide.0..5`, one drive per port).
fn device_add_trying_buses(qmp: &QmpClient, mut device_args: serde_json::Value, bus_candidates: &[String]) -> Result<String, String> {
    let mut last_err = String::from("no candidate buses given");
    for bus in bus_candidates {
        if let Some(obj) = device_args.as_object_mut() {
            obj.insert("bus".to_string(), serde_json::json!(bus));
        }
        match qmp.execute("device_add", device_args.clone()) {
            Ok(_) => return Ok(bus.clone()),
            Err(e) => last_err = e.to_string(),
        }
    }
    Err(format!(
        "all {} candidate buses are full or unavailable (last error: {last_err}) -- restart the VM to reclaim them",
        bus_candidates.len()
    ))
}

/// `device_add` a PCI(e) device (NIC, extra disk) onto one of the
/// pre-reserved hotplug root ports, trying each in turn. q35's root
/// complex (`pcie.0`) itself refuses `device_add` outright -- found live:
/// "Bus 'pcie.0' does not support hotplugging" -- every hotpluggable PCI(e)
/// device needs an explicit target bus that supports it, and each root
/// port holds exactly one device, so a previous hotplug (or several) may
/// have already filled some of them.
fn device_add_on_hotplug_bus(qmp: &QmpClient, device_args: serde_json::Value) -> Result<String, String> {
    let candidates: Vec<String> = (0..HOTPLUG_PCIE_PORTS).map(|i| format!("hotplug-pcie-{i}")).collect();
    device_add_trying_buses(qmp, device_args, &candidates)
}

/// `device_add` an `ide-hd` onto one of q35's 6 built-in AHCI ports (see
/// `IDE_PORTS`), trying each in turn since previous IDE hotplugs (or the
/// rare VM actually booted from one) may have filled some already.
fn device_add_on_ide_bus(qmp: &QmpClient, device_args: serde_json::Value) -> Result<String, String> {
    let candidates: Vec<String> = (0..IDE_PORTS).map(|i| format!("ide.{i}")).collect();
    device_add_trying_buses(qmp, device_args, &candidates)
}

/// A short, unique-enough id for a QMP `node-name`/device `id`. QEMU caps
/// block-node names at 31 bytes (`BDRV_NODE_NAME_MAX`) -- found live: the
/// previous `format!("drive-hotplug-{}", Uuid::new_v4().simple())` was 46
/// bytes and blockdev-add rejected it outright with "Node name too long".
fn short_hotplug_id(prefix: &str) -> String {
    format!("{prefix}-{}", &uuid::Uuid::new_v4().simple().to_string()[..8])
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

    let node_name = short_hotplug_id("drive-hotplug");
    let device_id = short_hotplug_id("disk-hotplug");

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

    // Add device, onto whichever bus its driver actually needs: the
    // virtio-blk-pci default goes through a pre-reserved hotplug PCIe root
    // port, scsi-hd through the single virtio-scsi controller Ephemera
    // adds at boot, ide-hd through one of q35's 6 built-in (and normally
    // unused) AHCI ports -- see device_add_on_hotplug_bus/
    // device_add_on_ide_bus's doc comments.
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

    let result = match driver {
        "virtio-blk-pci" => device_add_on_hotplug_bus(&qmp, device_args),
        "ide-hd" => device_add_on_ide_bus(&qmp, device_args),
        _ => {
            let mut device_args = device_args;
            if let Some(obj) = device_args.as_object_mut() {
                obj.insert("bus".to_string(), serde_json::json!("scsi0.0"));
            }
            qmp.execute("device_add", device_args).map(|_| String::from("scsi0.0")).map_err(|e| e.to_string())
        }
    };

    match result {
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

    let netdev_id = short_hotplug_id("net-hotplug");
    let device_id = short_hotplug_id("nic-hotplug");

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

    // Add NIC device, onto one of the pre-reserved hotplug root ports --
    // q35's root complex refuses device_add outright otherwise (see
    // device_add_on_hotplug_bus's doc comment).
    let device_args = serde_json::json!({
        "driver": model,
        "id": device_id,
        "netdev": netdev_id,
    });

    match device_add_on_hotplug_bus(&qmp, device_args) {
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
