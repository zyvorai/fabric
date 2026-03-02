//! API endpoints for machinectl/machined operations.
//!
//! Exposes systemd-machined functionality: machine lifecycle, image management,
//! file transfer, SSH, and shell execution.

use axum::{
    extract::Path,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::validation::validate_vm_name;
use security::RequireAdmin;
use vmspawn_driver::machinectl;

// ============================================================================
// Machine operations
// ============================================================================

/// GET /api/machines - List running machines from machined
pub async fn list_machines() -> Result<Json<Vec<machinectl::MachineInfo>>, (StatusCode, String)> {
    machinectl::list_machines()
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// GET /api/machines/:name/properties - Show machine properties
pub async fn show_machine(
    Path(name): Path<String>,
) -> Result<Json<std::collections::HashMap<String, String>>, (StatusCode, String)> {
    machinectl::show_machine(&name)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// POST /api/machines/:name/poweroff - Graceful poweroff
pub async fn poweroff_machine(
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    machinectl::poweroff(&name)
        .map(|_| StatusCode::OK)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// POST /api/machines/:name/reboot - Reboot machine
pub async fn reboot_machine(
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    machinectl::reboot(&name)
        .map(|_| StatusCode::OK)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// POST /api/machines/:name/terminate - Force terminate (Admin only)
pub async fn terminate_machine(
    RequireAdmin(_claims): RequireAdmin,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    validate_vm_name(&name).map_err(|(_s, msg)| (StatusCode::BAD_REQUEST, msg))?;
    machinectl::terminate(&name)
        .map(|_| StatusCode::OK)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// POST /api/machines/:name/enable - Enable auto-start at boot
pub async fn enable_machine(
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    machinectl::enable(&name)
        .map(|_| StatusCode::OK)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// POST /api/machines/:name/disable - Disable auto-start
pub async fn disable_machine(
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    machinectl::disable(&name)
        .map(|_| StatusCode::OK)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// ============================================================================
// Shell & SSH
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct ShellRequest {
    pub command: String,
}

/// POST /api/machines/:name/shell - Run command inside machine (Admin only)
pub async fn shell_machine(
    RequireAdmin(_claims): RequireAdmin,
    Path(name): Path<String>,
    Json(req): Json<ShellRequest>,
) -> Result<Json<machinectl::ShellOutput>, (StatusCode, String)> {
    validate_vm_name(&name).map_err(|(_s, msg)| (StatusCode::BAD_REQUEST, msg))?;
    machinectl::shell(&name, &req.command)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

#[derive(Debug, Serialize)]
pub struct SshInfo {
    pub address: Option<String>,
    pub key_path: Option<String>,
    pub ssh_command: Option<String>,
}

/// GET /api/machines/:name/ssh - Get SSH connection info
pub async fn ssh_info(
    Path(name): Path<String>,
) -> Result<Json<SshInfo>, (StatusCode, String)> {
    let address = machinectl::ssh_address(&name)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let key_path = machinectl::ssh_key_path(&name)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

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
// File transfer
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct CopyRequest {
    pub host_path: String,
    pub machine_path: String,
}

/// POST /api/machines/:name/copy-to - Copy file from host to machine (Admin only)
pub async fn copy_to_machine(
    RequireAdmin(_claims): RequireAdmin,
    Path(name): Path<String>,
    Json(req): Json<CopyRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    validate_vm_name(&name).map_err(|(_s, msg)| (StatusCode::BAD_REQUEST, msg))?;
    validate_host_path(&req.host_path)?;
    machinectl::copy_to(&name, &req.host_path, &req.machine_path)
        .map(|_| StatusCode::OK)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// POST /api/machines/:name/copy-from - Copy file from machine to host (Admin only)
pub async fn copy_from_machine(
    RequireAdmin(_claims): RequireAdmin,
    Path(name): Path<String>,
    Json(req): Json<CopyRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    validate_vm_name(&name).map_err(|(_s, msg)| (StatusCode::BAD_REQUEST, msg))?;
    validate_host_path(&req.host_path)?;
    machinectl::copy_from(&name, &req.machine_path, &req.host_path)
        .map(|_| StatusCode::OK)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
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
) -> Result<StatusCode, (StatusCode, String)> {
    validate_vm_name(&name).map_err(|(_s, msg)| (StatusCode::BAD_REQUEST, msg))?;
    validate_host_path(&req.host_path)?;
    machinectl::bind(&name, &req.host_path, &req.machine_path, req.read_only)
        .map(|_| StatusCode::OK)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// ============================================================================
// Image management
// ============================================================================

/// GET /api/machines/images - List images from /var/lib/machines
pub async fn list_machine_images() -> Result<Json<Vec<machinectl::ImageInfo>>, (StatusCode, String)> {
    machinectl::list_images()
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

#[derive(Debug, Deserialize)]
pub struct CloneImageRequest {
    pub target_name: String,
}

/// POST /api/machines/images/:name/clone - Clone an image
pub async fn clone_machine_image(
    Path(name): Path<String>,
    Json(req): Json<CloneImageRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    machinectl::clone_image(&name, &req.target_name)
        .map(|_| StatusCode::CREATED)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

#[derive(Debug, Deserialize)]
pub struct RenameImageRequest {
    pub new_name: String,
}

/// POST /api/machines/images/:name/rename - Rename an image
pub async fn rename_machine_image(
    Path(name): Path<String>,
    Json(req): Json<RenameImageRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    machinectl::rename_image(&name, &req.new_name)
        .map(|_| StatusCode::OK)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// DELETE /api/machines/images/:name - Remove an image
pub async fn remove_machine_image(
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    machinectl::remove_image(&name)
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

#[derive(Debug, Deserialize)]
pub struct SetReadOnlyRequest {
    pub read_only: bool,
}

/// POST /api/machines/images/:name/read-only - Toggle read-only
pub async fn set_image_read_only(
    Path(name): Path<String>,
    Json(req): Json<SetReadOnlyRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    machinectl::set_read_only(&name, req.read_only)
        .map(|_| StatusCode::OK)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// ============================================================================
// Image transfer (pull/import/export)
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
    Json(req): Json<PullImageRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    machinectl::pull_raw(&req.url, &req.name, req.verify)
        .map(|_| StatusCode::ACCEPTED)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// POST /api/machines/images/pull-tar - Pull tar image from URL
pub async fn pull_tar_image(
    Json(req): Json<PullImageRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    machinectl::pull_tar(&req.url, &req.name, req.verify)
        .map(|_| StatusCode::ACCEPTED)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

#[derive(Debug, Deserialize)]
pub struct ImportImageRequest {
    pub path: String,
    pub name: String,
}

/// POST /api/machines/images/import-raw - Import raw image file (Admin only)
pub async fn import_raw_image(
    RequireAdmin(_claims): RequireAdmin,
    Json(req): Json<ImportImageRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    validate_host_path(&req.path)?;
    machinectl::import_raw(&req.path, &req.name)
        .map(|_| StatusCode::ACCEPTED)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// POST /api/machines/images/import-tar - Import tar image file (Admin only)
pub async fn import_tar_image(
    RequireAdmin(_claims): RequireAdmin,
    Json(req): Json<ImportImageRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    validate_host_path(&req.path)?;
    machinectl::import_tar(&req.path, &req.name)
        .map(|_| StatusCode::ACCEPTED)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

#[derive(Debug, Deserialize)]
pub struct ExportImageRequest {
    pub path: String,
}

/// POST /api/machines/images/:name/export-raw - Export to raw file (Admin only)
pub async fn export_raw_image(
    RequireAdmin(_claims): RequireAdmin,
    Path(name): Path<String>,
    Json(req): Json<ExportImageRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    validate_host_path(&req.path)?;
    machinectl::export_raw(&name, &req.path)
        .map(|_| StatusCode::OK)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// POST /api/machines/images/:name/export-tar - Export to tar file (Admin only)
pub async fn export_tar_image(
    RequireAdmin(_claims): RequireAdmin,
    Path(name): Path<String>,
    Json(req): Json<ExportImageRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    validate_host_path(&req.path)?;
    machinectl::export_tar(&name, &req.path)
        .map(|_| StatusCode::OK)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// POST /api/machines/images/clean - Clean hidden/cached images (Admin only)
pub async fn clean_images(
    RequireAdmin(_claims): RequireAdmin,
) -> Result<StatusCode, (StatusCode, String)> {
    machinectl::clean(false)
        .map(|_| StatusCode::OK)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

use crate::validation::validate_host_path;
