// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

//! API endpoints for machinectl/machined operations.
//!
//! Exposes systemd-machined functionality: machine lifecycle, image management,
//! file transfer, SSH, and shell execution.
//!
//! Machine lifecycle, property queries, image management, shell exec, file
//! copy, and SSH info all go through `state.driver` and work on both
//! backends (native D-Bus/CLI for MachinectlDriver; Ephemera's image
//! catalog, vsock guest agent, and a MAC-to-DHCP-lease lookup respectively
//! for EphemeraDriver — see driver-core::{ImageDriver, ShellDriver}, and
//! `ssh_info`'s doc comment for how SSH info specifically is derived on
//! each backend). Only `bind` still shells out to machinectl directly —
//! it isn't achievable for a real hardware VM the way it was for nspawn's
//! shared-kernel containers (see the systemd-removal migration plan).

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;

use crate::server::AppState;
use crate::validation::{validate_machine_path, validate_vm_name};
use security::{RequireAdmin, RequireRead, RequireWrite};
use zyvor_fabric_vm_driver::machinectl;
use zyvor_fabric_driver_core::{ImageInfo, MachineInfo};

// ============================================================================
// Machine operations (migrated to D-Bus driver)
// ============================================================================

/// GET /api/machines - List running machines from machined
pub async fn list_machines(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<MachineInfo>>, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(list_machines));
    state.driver.list_machines().await.map(Json).map_err(|e| {
        tracing::error!("machined list_machines failed: {}", e);
        crate::api_error::json_error_code(
            StatusCode::INTERNAL_SERVER_ERROR,
            "machined_connection",
            "Machine service operation failed",
        )
    })
}

/// GET /api/machines/:name/properties - Show machine properties
pub async fn show_machine(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<std::collections::HashMap<String, String>>, (StatusCode, Json<serde_json::Value>)>
{
    tracing::debug!("machined::{}", stringify!(show_machine));
    validate_vm_name(&name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    state
        .driver
        .get_properties(&name)
        .await
        .map(Json)
        .map_err(|e| {
            tracing::error!("machined show_machine failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

/// POST /api/machines/:name/poweroff - Graceful poweroff
pub async fn poweroff_machine(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(poweroff_machine));
    validate_vm_name(&name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    state
        .driver
        .poweroff(&name)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|e| {
            tracing::error!("machined poweroff failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

/// POST /api/machines/:name/reboot - Reboot machine
pub async fn reboot_machine(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(reboot_machine));
    validate_vm_name(&name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    state
        .driver
        .reboot(&name)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|e| {
            tracing::error!("machined reboot failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

/// POST /api/machines/:name/terminate - Force terminate (Admin only)
pub async fn terminate_machine(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(terminate_machine));
    validate_vm_name(&name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    state
        .driver
        .terminate(&name)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|e| {
            tracing::error!("machined terminate failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

/// POST /api/machines/:name/enable - Enable auto-start at boot
pub async fn enable_machine(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(enable_machine));
    validate_vm_name(&name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    state
        .driver
        .enable(&name)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|e| {
            tracing::error!("machined enable failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

/// POST /api/machines/:name/disable - Disable auto-start
pub async fn disable_machine(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(disable_machine));
    validate_vm_name(&name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    state
        .driver
        .disable(&name)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|e| {
            tracing::error!("machined disable failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

// ============================================================================
// Shell — machinectl shell (MachinectlDriver) or the vsock guest agent's
// Exec op (EphemeraDriver, requires the VM to have been created with the
// agent enabled), via state.driver. SSH/copy/bind stay CLI-based — see the
// module doc comment.
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct ShellRequest {
    pub command: String,
}

/// POST /api/machines/:name/shell - Run command inside machine (Admin only)
pub async fn shell_machine(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Json(req): Json<ShellRequest>,
) -> Result<Json<zyvor_fabric_driver_core::ShellOutput>, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(shell_machine));
    validate_vm_name(&name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;

    // Reject shell metacharacters at the handler level for defense in depth
    const SHELL_METACHARACTERS: &[char] = &[
        ';', '|', '&', '$', '`', '>', '<', '(', ')', '{', '}', '\n', '\r', '\0', '!',
    ];
    if req.command.is_empty() {
        return Err(crate::api_error::json_error(
            StatusCode::BAD_REQUEST,
            "Shell command must not be empty",
        ));
    }
    for ch in SHELL_METACHARACTERS {
        if req.command.contains(*ch) {
            return Err(crate::api_error::json_error(
                StatusCode::BAD_REQUEST,
                format!(
                    "Shell command contains forbidden character '{}'",
                    ch.escape_default()
                ),
            ));
        }
    }

    state
        .driver
        .shell(&name, &req.command, None)
        .await
        .map(Json)
        .map_err(|e| {
            tracing::error!("shell_machine failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

#[derive(Debug, Serialize)]
pub struct SshInfo {
    pub address: Option<String>,
    pub key_path: Option<String>,
    pub ssh_command: Option<String>,
}

/// GET /api/machines/:name/ssh - Get SSH connection info
///
/// `machinectl` backend: systemd-vmspawn's own vsock-based SSH
/// (`SSHAddress`/`SSHPrivateKeyPath` machine properties, key managed by
/// systemd). `ephemera` backend: no vsock SSH equivalent, so this instead
/// resolves the VM's MAC (assigned at create time — see
/// `EphemeraDriver::get_mac_address`) to a network IP via zyvor-fabricd's
/// own DHCP lease file. Key management isn't something Ephemera or this
/// lookup can speak to, so `key_path` is always `None` on that backend —
/// the operator's own responsibility (e.g. injected via cloud-init).
pub async fn ssh_info(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<SshInfo>, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(ssh_info));
    validate_vm_name(&name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;

    if state.driver.backend_name() == "ephemera" {
        let mac = state.driver.get_mac_address(&name).await.map_err(|e| {
            tracing::error!("ephemera get_mac_address failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })?;
        let address = match &mac {
            Some(mac) => state.dnsmasq_manager.lookup_lease_by_mac(mac).await.map_err(|e| {
                tracing::error!("dnsmasq lease lookup failed: {}", e);
                crate::api_error::json_error_code(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "machined_connection",
                    "Machine service operation failed",
                )
            })?,
            None => None,
        };
        let ssh_command = address.as_ref().map(|addr| format!("ssh {addr}"));
        return Ok(Json(SshInfo { address, key_path: None, ssh_command }));
    }

    let address = machinectl::ssh_address(&name).map_err(|e| {
        tracing::error!("machined ssh_address failed: {}", e);
        crate::api_error::json_error_code(
            StatusCode::INTERNAL_SERVER_ERROR,
            "machined_connection",
            "Machine service operation failed",
        )
    })?;
    let key_path = machinectl::ssh_key_path(&name).map_err(|e| {
        tracing::error!("machined ssh_key_path failed: {}", e);
        crate::api_error::json_error_code(
            StatusCode::INTERNAL_SERVER_ERROR,
            "machined_connection",
            "Machine service operation failed",
        )
    })?;

    let ssh_command = match (&address, &key_path) {
        (Some(addr), Some(key)) => Some(format!("ssh -i {} {}", key, addr)),
        _ => None,
    };

    Ok(Json(SshInfo {
        address,
        key_path,
        ssh_command,
    }))
}

// ============================================================================
// File transfer (routed through state.driver — driver_core::ShellDriver;
// machinectl copy-to/copy-from CLI, or Ephemera's vsock PutFile/GetFile)
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct CopyRequest {
    pub host_path: String,
    pub machine_path: String,
    /// Unix permission bits for the copied file, e.g. `0o644`. Only
    /// consulted by `copy_to_machine` on the `ephemera` backend, which has
    /// no source file to inherit a mode from; ignored elsewhere.
    #[serde(default)]
    pub mode: Option<u32>,
}

/// POST /api/machines/:name/copy-to - Copy file from host to machine (Admin only)
pub async fn copy_to_machine(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Json(req): Json<CopyRequest>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(copy_to_machine));
    validate_vm_name(&name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    validate_host_path(&req.host_path)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    validate_machine_path(&req.machine_path)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    state
        .driver
        .copy_to(&name, &req.host_path, &req.machine_path, req.mode)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|e| {
            tracing::error!("machined copy_to failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

/// POST /api/machines/:name/copy-from - Copy file from machine to host (Admin only)
pub async fn copy_from_machine(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Json(req): Json<CopyRequest>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(copy_from_machine));
    validate_vm_name(&name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    validate_host_path(&req.host_path)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    validate_machine_path(&req.machine_path)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    state
        .driver
        .copy_from(&name, &req.machine_path, &req.host_path)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|e| {
            tracing::error!("machined copy_from failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

#[derive(Debug, Deserialize)]
pub struct BindRequest {
    pub host_path: String,
    pub machine_path: String,
    #[serde(default)]
    pub read_only: bool,
}

/// POST /api/machines/:name/bind - Bind mount host path into machine (Admin only)
pub async fn bind_machine(
    RequireAdmin(_claims): RequireAdmin,
    Path(name): Path<String>,
    Json(req): Json<BindRequest>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(bind_machine));
    validate_vm_name(&name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    validate_host_path(&req.host_path)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    validate_machine_path(&req.machine_path)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    machinectl::bind(&name, &req.host_path, &req.machine_path, req.read_only)
        .map(|_| StatusCode::OK)
        .map_err(|e| {
            tracing::error!("machined bind failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

// ============================================================================
// Image management (routed through state.driver — driver_core::ImageDriver)
// ============================================================================

/// GET /api/machines/images - List images from /var/lib/machines
pub async fn list_machine_images(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<ImageInfo>>, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(list_machine_images));
    state.driver.list_images().await.map(Json).map_err(|e| {
        tracing::error!("list_images failed: {}", e);
        crate::api_error::json_error_code(
            StatusCode::INTERNAL_SERVER_ERROR,
            "machined_connection",
            "Machine service operation failed",
        )
    })
}

#[derive(Debug, Deserialize)]
pub struct CloneImageRequest {
    pub target_name: String,
}

/// POST /api/machines/images/:name/clone - Clone an image
pub async fn clone_machine_image(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Json(req): Json<CloneImageRequest>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(clone_machine_image));
    validate_vm_name(&name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    validate_vm_name(&req.target_name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    state
        .driver
        .clone_image(&name, &req.target_name)
        .await
        .map(|_| StatusCode::CREATED)
        .map_err(|e| {
            tracing::error!("clone_image failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

#[derive(Debug, Deserialize)]
pub struct RenameImageRequest {
    pub new_name: String,
}

/// POST /api/machines/images/:name/rename - Rename an image
pub async fn rename_machine_image(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Json(req): Json<RenameImageRequest>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(rename_machine_image));
    validate_vm_name(&name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    validate_vm_name(&req.new_name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    state
        .driver
        .rename_image(&name, &req.new_name)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|e| {
            tracing::error!("rename_image failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

/// DELETE /api/machines/images/:name - Remove an image
pub async fn remove_machine_image(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(remove_machine_image));
    validate_vm_name(&name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    state
        .driver
        .remove_image(&name)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|e| {
            tracing::error!("remove_image failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

#[derive(Debug, Deserialize)]
pub struct SetReadOnlyRequest {
    pub read_only: bool,
}

/// POST /api/machines/images/:name/read-only - Toggle read-only
pub async fn set_image_read_only(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Json(req): Json<SetReadOnlyRequest>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(set_image_read_only));
    validate_vm_name(&name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    state
        .driver
        .set_image_read_only(&name, req.read_only)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|e| {
            tracing::error!("set_read_only failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

// ============================================================================
// Image transfer (pull/import/export — routed through state.driver;
// tar variants and read-only/clean are machinectl-only, see ImageDriver)
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct PullImageRequest {
    pub url: String,
    pub name: String,
    #[serde(default)]
    pub verify: bool,
}

/// POST /api/machines/images/pull-raw - Pull raw image from URL
pub async fn pull_raw_image(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Json(req): Json<PullImageRequest>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(pull_raw_image));
    validate_vm_name(&req.name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    crate::api::notifications::validate_external_url_public(&req.url)
        .map_err(|e| crate::api_error::json_error(StatusCode::BAD_REQUEST, e))?;
    state
        .driver
        .pull_raw_image(&req.url, &req.name, req.verify)
        .await
        .map(|_| StatusCode::ACCEPTED)
        .map_err(|e| {
            tracing::error!("pull_raw_image failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

/// POST /api/machines/images/pull-tar - Pull tar image from URL
pub async fn pull_tar_image(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Json(req): Json<PullImageRequest>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(pull_tar_image));
    validate_vm_name(&req.name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    crate::api::notifications::validate_external_url_public(&req.url)
        .map_err(|e| crate::api_error::json_error(StatusCode::BAD_REQUEST, e))?;
    state
        .driver
        .pull_tar_image(&req.url, &req.name, req.verify)
        .await
        .map(|_| StatusCode::ACCEPTED)
        .map_err(|e| {
            tracing::error!("pull_tar_image failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

#[derive(Debug, Deserialize)]
pub struct ImportImageRequest {
    pub path: String,
    pub name: String,
}

/// POST /api/machines/images/import-raw - Import raw image file (Admin only)
pub async fn import_raw_image(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Json(req): Json<ImportImageRequest>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(import_raw_image));
    validate_vm_name(&req.name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    validate_host_path(&req.path)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    state
        .driver
        .import_raw_image(&req.path, &req.name)
        .await
        .map(|_| StatusCode::ACCEPTED)
        .map_err(|e| {
            tracing::error!("import_raw_image failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

/// POST /api/machines/images/import-tar - Import tar image file (Admin only)
pub async fn import_tar_image(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Json(req): Json<ImportImageRequest>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(import_tar_image));
    validate_vm_name(&req.name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    validate_host_path(&req.path)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    state
        .driver
        .import_tar_image(&req.path, &req.name)
        .await
        .map(|_| StatusCode::ACCEPTED)
        .map_err(|e| {
            tracing::error!("import_tar_image failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

#[derive(Debug, Deserialize)]
pub struct ExportImageRequest {
    pub path: String,
}

/// POST /api/machines/images/:name/export-raw - Export to raw file (Admin only)
pub async fn export_raw_image(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Json(req): Json<ExportImageRequest>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(export_raw_image));
    validate_vm_name(&name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    validate_host_path(&req.path)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    state
        .driver
        .export_raw_image(&name, &req.path)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|e| {
            tracing::error!("export_raw_image failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

/// POST /api/machines/images/:name/export-tar - Export to tar file (Admin only)
pub async fn export_tar_image(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Json(req): Json<ExportImageRequest>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(export_tar_image));
    validate_vm_name(&name)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    validate_host_path(&req.path)
        .map_err(|(_s, msg)| crate::api_error::json_error(StatusCode::BAD_REQUEST, msg))?;
    state
        .driver
        .export_tar_image(&name, &req.path)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|e| {
            tracing::error!("export_tar_image failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

/// POST /api/machines/images/clean - Clean hidden/cached images (Admin only)
pub async fn clean_images(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("machined::{}", stringify!(clean_images));
    state
        .driver
        .clean_images(false)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|e| {
            tracing::error!("clean_images failed: {}", e);
            crate::api_error::json_error_code(
                StatusCode::INTERNAL_SERVER_ERROR,
                "machined_connection",
                "Machine service operation failed",
            )
        })
}

use crate::validation::validate_host_path;
