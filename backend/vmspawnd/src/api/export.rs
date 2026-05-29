// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use security::RequireAdmin;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::server::AppState;

#[derive(Debug, Deserialize)]
pub struct ExportRequest {
    /// Path to the disk image (qcow2). If omitted, auto-detected from VM config.
    pub disk_path: Option<String>,
    /// Output directory. Defaults to /var/lib/vmspawnd/exports/.
    pub output_dir: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ExportResponse {
    pub vm_name: String,
    pub ova_path: String,
    pub message: String,
}

/// POST /api/vms/:name/export - Export a VM to OVA format.
pub async fn export_vm(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
    Json(req): Json<ExportRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    tracing::info!("Exporting VM '{}' to OVA", vm_name);

    // Validate VM name using central validation
    if let Err((status, msg)) = crate::validation::validate_vm_name(&vm_name) {
        return Err((status, Json(serde_json::json!({"error": msg}))));
    }

    // Verify VM exists in the store
    let vm = state
        .store
        .get_vm(&vm_name)
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to query VM store"})),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": format!("VM '{}' not found", vm_name)})),
            )
        })?;

    // Determine disk path — validate against allowed prefixes
    let disk_path = req
        .disk_path
        .unwrap_or_else(|| format!("/var/lib/machines/{}.qcow2", vm_name));
    crate::validation::validate_host_path(&disk_path)
        .map_err(|(s, m)| (s, Json(serde_json::json!({"error": m}))))?;

    // Determine output directory — restrict to safe prefix
    let output_dir = req
        .output_dir
        .unwrap_or_else(|| "/var/lib/vmspawnd/exports".to_string());
    crate::validation::validate_host_path(&output_dir)
        .map_err(|(s, m)| (s, Json(serde_json::json!({"error": m}))))?;

    // Ensure output directory exists
    tokio::fs::create_dir_all(&output_dir).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("Failed to create export directory: {}", e)})),
        )
    })?;

    let output_path = format!("{}/{}.ova", output_dir, vm_name);
    let cpus = vm.cpus;
    let memory_mb = vm.memory;
    let name = vm_name.clone();
    let disk = disk_path.clone();

    // Run the export in a blocking task since it involves disk I/O and subprocesses
    let ova_path = tokio::task::spawn_blocking(move || {
        ova_tools::export_ova(&name, &disk, cpus, memory_mb, &output_path)
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("Export task failed: {}", e)})),
        )
    })?
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("OVA export failed: {}", e)})),
        )
    })?;

    Ok(Json(ExportResponse {
        vm_name,
        ova_path,
        message: "VM exported successfully".to_string(),
    }))
}
