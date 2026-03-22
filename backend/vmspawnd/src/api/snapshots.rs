use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::process::Command;
use uuid::Uuid;

use crate::server::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SnapshotType {
    Disk,
    Full,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VMSnapshot {
    pub id: String,
    pub vm_name: String,
    pub name: String,
    pub description: Option<String>,
    pub snapshot_type: SnapshotType,
    pub parent_id: Option<String>,
    pub size_bytes: u64,
    pub created: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotTreeNode {
    pub snapshot: VMSnapshot,
    pub children: Vec<SnapshotTreeNode>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSnapshotRequest {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default = "default_snapshot_type")]
    pub snapshot_type: SnapshotType,
}

fn default_snapshot_type() -> SnapshotType {
    SnapshotType::Disk
}

/// POST /api/vms/:name/snapshots - Create a snapshot
pub async fn create_snapshot(
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
    Json(req): Json<CreateSnapshotRequest>,
) -> impl IntoResponse {
    tracing::debug!("snapshots::{}", stringify!(create_snapshot));
    // Find the VM's disk image path
    let image_path = crate::validation::find_vm_image(&vm_name);

    // Validate snapshot name
    if let Err((status, msg)) = crate::validation::validate_snapshot_name(&req.name) {
        return (status, Json(serde_json::json!({"error": msg}))).into_response();
    }

    // Attempt qemu-img snapshot
    if let Some(ref path) = image_path {
        let output = Command::new("qemu-img")
            .args(["snapshot", "-c", &req.name, path])
            .output()
            .await;

        match output {
            Ok(o) if !o.status.success() => {
                let stderr = String::from_utf8_lossy(&o.stderr);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": format!("qemu-img snapshot failed: {}", stderr)})),
                )
                    .into_response();
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": format!("Failed to run qemu-img: {}", e)})),
                )
                    .into_response();
            }
            _ => {}
        }
    }

    let snapshot = VMSnapshot {
        id: Uuid::new_v4().to_string(),
        vm_name: vm_name.clone(),
        name: req.name,
        description: req.description,
        snapshot_type: req.snapshot_type,
        parent_id: None,
        size_bytes: 0,
        created: Utc::now(),
    };

    let store_key = format!("snapshots_{}", vm_name);
    match state.store.save_entity(&store_key, &snapshot.id, &snapshot) {
        Ok(_) => (StatusCode::CREATED, Json(snapshot)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/vms/:name/snapshots - List snapshots for a VM
pub async fn list_snapshots(
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("snapshots::{}", stringify!(list_snapshots));
    let store_key = format!("snapshots_{}", vm_name);
    let items: Vec<VMSnapshot> = state.store.list_entities(&store_key).unwrap_or_default();
    Json(items)
}

/// GET /api/vms/:name/snapshots/:id - Get snapshot details
pub async fn get_snapshot(
    State(state): State<Arc<AppState>>,
    Path((vm_name, id)): Path<(String, String)>,
) -> impl IntoResponse {
    tracing::debug!("snapshots::{}", stringify!(get_snapshot));
    let store_key = format!("snapshots_{}", vm_name);
    match state.store.get_entity::<VMSnapshot>(&store_key, &id) {
        Ok(Some(s)) => Json(s).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

/// DELETE /api/vms/:name/snapshots/:id - Delete a snapshot
pub async fn delete_snapshot(
    State(state): State<Arc<AppState>>,
    Path((vm_name, id)): Path<(String, String)>,
) -> impl IntoResponse {
    tracing::debug!("snapshots::{}", stringify!(delete_snapshot));
    let store_key = format!("snapshots_{}", vm_name);

    // Get snapshot info to delete from qemu-img
    if let Ok(Some(snapshot)) = state.store.get_entity::<VMSnapshot>(&store_key, &id) {
        if let Some(ref path) = crate::validation::find_vm_image(&vm_name) {
            if let Err(e) = Command::new("qemu-img")
                .args(["snapshot", "-d", &snapshot.name, path])
                .output()
                .await
            {
                tracing::warn!("Command failed: {}", e);
            }
        }
    }

    if let Err(e) = state.store.delete_entity(&store_key, &id) {
        tracing::error!("Failed to delete: {}", e);
    }
    StatusCode::NO_CONTENT
}

/// POST /api/vms/:name/snapshots/:id/revert - Revert to a snapshot
pub async fn revert_snapshot(
    State(state): State<Arc<AppState>>,
    Path((vm_name, id)): Path<(String, String)>,
) -> impl IntoResponse {
    tracing::debug!("snapshots::{}", stringify!(revert_snapshot));
    let store_key = format!("snapshots_{}", vm_name);

    let snapshot = match state.store.get_entity::<VMSnapshot>(&store_key, &id) {
        Ok(Some(s)) => s,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    // VM should be stopped before reverting
    if let Some(ref path) = crate::validation::find_vm_image(&vm_name) {
        let output = Command::new("qemu-img")
            .args(["snapshot", "-a", &snapshot.name, path])
            .output()
            .await;

        match output {
            Ok(o) if !o.status.success() => {
                let stderr = String::from_utf8_lossy(&o.stderr);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": format!("Revert failed: {}. Ensure VM is stopped.", stderr)})),
                )
                    .into_response();
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": format!("Failed to run qemu-img: {}", e)})),
                )
                    .into_response();
            }
            _ => {}
        }
    }

    Json(serde_json::json!({"status": "reverted", "snapshot": snapshot.name})).into_response()
}

/// GET /api/vms/:name/snapshots/tree - Get snapshot tree
pub async fn snapshot_tree(
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("snapshots::{}", stringify!(snapshot_tree));
    let store_key = format!("snapshots_{}", vm_name);
    let snapshots: Vec<VMSnapshot> = state.store.list_entities(&store_key).unwrap_or_default();

    // Build tree from parent_id relationships
    let roots: Vec<SnapshotTreeNode> = build_snapshot_tree(&snapshots);
    Json(roots)
}

fn build_snapshot_tree(snapshots: &[VMSnapshot]) -> Vec<SnapshotTreeNode> {
    let mut roots = Vec::new();

    for snap in snapshots {
        if snap.parent_id.is_none() {
            roots.push(build_node(snap, snapshots));
        }
    }

    roots
}

fn build_node(snap: &VMSnapshot, all: &[VMSnapshot]) -> SnapshotTreeNode {
    let children: Vec<SnapshotTreeNode> = all
        .iter()
        .filter(|s| s.parent_id.as_deref() == Some(&snap.id))
        .map(|s| build_node(s, all))
        .collect();

    SnapshotTreeNode {
        snapshot: snap.clone(),
        children,
    }
}

