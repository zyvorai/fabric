// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

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
use security::{RequireRead, RequireWrite, RequireAdmin};

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
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
    Json(req): Json<CreateSnapshotRequest>,
) -> impl IntoResponse {
    tracing::debug!("snapshots::{}", stringify!(create_snapshot));
    if let Err((status, msg)) = crate::validation::validate_vm_name(&vm_name) {
        return crate::api_error::json_error(status, msg).into_response();
    }

    let _lock = state.vm_lock(&vm_name).lock_owned().await;

    // Find the VM's disk image path
    let image_path = match crate::validation::find_vm_image(&vm_name) {
        Some(p) => p,
        None => {
            return crate::api_error::json_error(
                StatusCode::NOT_FOUND,
                format!("No disk image found for VM '{}'", vm_name),
            )
            .into_response();
        }
    };

    // Validate snapshot name
    if let Err((status, msg)) = crate::validation::validate_snapshot_name(&req.name) {
        return crate::api_error::json_error(status, msg).into_response();
    }

    // Validate description length
    if let Some(ref desc) = req.description {
        if desc.len() > 1024 {
            return crate::api_error::json_error(StatusCode::BAD_REQUEST, "Description must be at most 1024 characters").into_response();
        }
    }

    // Attempt qemu-img snapshot
    let output = Command::new("qemu-img")
        .args(["snapshot", "-c", &req.name, &image_path])
        .output()
        .await;

    match output {
        Ok(o) if !o.status.success() => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            return crate::api_error::json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("qemu-img snapshot failed: {}", stderr),
            )
            .into_response();
        }
        Err(e) => {
            return crate::api_error::json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to run qemu-img: {}", e),
            )
            .into_response();
        }
        _ => {}
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
        Ok(_) => {
            crate::api::events::record_event(&state, crate::api::events::VMEventType::SnapshotCreated, &vm_name, Some(format!("Snapshot: {}", snapshot.name)));
            (StatusCode::CREATED, Json(snapshot)).into_response()
        }
        Err(e) => crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
            .into_response(),
    }
}

/// GET /api/vms/:name/snapshots - List snapshots for a VM
pub async fn list_snapshots(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("snapshots::{}", stringify!(list_snapshots));
    if let Err((status, msg)) = crate::validation::validate_vm_name(&vm_name) {
        return crate::api_error::json_error(status, msg).into_response();
    }
    let store_key = format!("snapshots_{}", vm_name);
    let items: Vec<VMSnapshot> = state.store.list_entities(&store_key).unwrap_or_else(|e| { tracing::error!("Storage error loading {}: {}", store_key, e); Vec::new() });
    Json(items).into_response()
}

/// GET /api/vms/:name/snapshots/:id - Get snapshot details
pub async fn get_snapshot(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path((vm_name, id)): Path<(String, String)>,
) -> impl IntoResponse {
    tracing::debug!("snapshots::{}", stringify!(get_snapshot));
    if let Err((status, msg)) = crate::validation::validate_vm_name(&vm_name) {
        return crate::api_error::json_error(status, msg).into_response();
    }
    let store_key = format!("snapshots_{}", vm_name);
    match state.store.get_entity::<VMSnapshot>(&store_key, &id) {
        Ok(Some(s)) => Json(s).into_response(),
        Ok(None) => crate::api_error::json_error(StatusCode::NOT_FOUND, "Snapshot not found").into_response(),
        Err(_) => crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to load snapshot").into_response(),
    }
}

/// DELETE /api/vms/:name/snapshots/:id - Delete a snapshot
pub async fn delete_snapshot(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path((vm_name, id)): Path<(String, String)>,
) -> impl IntoResponse {
    tracing::debug!("snapshots::{}", stringify!(delete_snapshot));
    if let Err((status, msg)) = crate::validation::validate_vm_name(&vm_name) {
        return crate::api_error::json_error(status, msg).into_response();
    }

    let _lock = state.vm_lock(&vm_name).lock_owned().await;

    let store_key = format!("snapshots_{}", vm_name);

    // Get snapshot info to delete from qemu-img
    if let Ok(Some(snapshot)) = state.store.get_entity::<VMSnapshot>(&store_key, &id) {
        if crate::validation::validate_snapshot_name(&snapshot.name).is_err() {
            tracing::error!("Corrupted snapshot name in store, skipping qemu-img delete");
        } else if let Some(ref path) = crate::validation::find_vm_image(&vm_name) {
            if let Err(e) = Command::new("qemu-img")
                .args(["snapshot", "-d", &snapshot.name, path])
                .output()
                .await
            {
                tracing::warn!("Command failed: {}", e);
            }
        }
    }

    match state.store.delete_entity(&store_key, &id) {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => crate::api_error::json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to delete snapshot: {}", e),
        )
        .into_response(),
    }
}

/// POST /api/vms/:name/snapshots/:id/revert - Revert to a snapshot
pub async fn revert_snapshot(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path((vm_name, id)): Path<(String, String)>,
) -> impl IntoResponse {
    tracing::debug!("snapshots::{}", stringify!(revert_snapshot));
    if let Err((status, msg)) = crate::validation::validate_vm_name(&vm_name) {
        return crate::api_error::json_error(status, msg).into_response();
    }

    let _lock = state.vm_lock(&vm_name).lock_owned().await;

    let store_key = format!("snapshots_{}", vm_name);

    let snapshot = match state.store.get_entity::<VMSnapshot>(&store_key, &id) {
        Ok(Some(s)) => s,
        Ok(None) => return crate::api_error::json_error(StatusCode::NOT_FOUND, "Snapshot not found").into_response(),
        Err(_) => return crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to load snapshot").into_response(),
    };

    // Check that the VM is stopped before reverting
    if let Ok(Some(vm)) = state.store.get_vm(&vm_name) {
        if vm.state == vm_model::VMState::Running || vm.state == vm_model::VMState::Starting {
            return crate::api_error::json_error(StatusCode::CONFLICT, "VM must be stopped before reverting a snapshot").into_response();
        }
    }

    // VM should be stopped before reverting
    if let Some(ref path) = crate::validation::find_vm_image(&vm_name) {
        let output = Command::new("qemu-img")
            .args(["snapshot", "-a", &snapshot.name, path])
            .output()
            .await;

        match output {
            Ok(o) if !o.status.success() => {
                let stderr = String::from_utf8_lossy(&o.stderr);
                return crate::api_error::json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Revert failed: {}. Ensure VM is stopped.", stderr),
                )
                .into_response();
            }
            Err(e) => {
                return crate::api_error::json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to run qemu-img: {}", e),
                )
                .into_response();
            }
            _ => {}
        }
    }

    crate::api::events::record_event(&state, crate::api::events::VMEventType::SnapshotReverted, &vm_name, Some(format!("Reverted to: {}", snapshot.name)));
    Json(serde_json::json!({"status": "reverted", "snapshot": snapshot.name})).into_response()
}

/// GET /api/vms/:name/snapshots/tree - Get snapshot tree
pub async fn snapshot_tree(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("snapshots::{}", stringify!(snapshot_tree));
    if let Err((status, msg)) = crate::validation::validate_vm_name(&vm_name) {
        return crate::api_error::json_error(status, msg).into_response();
    }
    let store_key = format!("snapshots_{}", vm_name);
    let snapshots: Vec<VMSnapshot> = state.store.list_entities(&store_key).unwrap_or_else(|e| { tracing::error!("Storage error loading {}: {}", store_key, e); Vec::new() });

    // Build tree from parent_id relationships
    let roots: Vec<SnapshotTreeNode> = build_snapshot_tree(&snapshots);
    Json(roots).into_response()
}

fn build_snapshot_tree(snapshots: &[VMSnapshot]) -> Vec<SnapshotTreeNode> {
    use std::collections::HashMap;

    // Build parent_id -> children index for O(n) tree construction
    let mut children_map: HashMap<Option<&str>, Vec<&VMSnapshot>> = HashMap::new();
    for snap in snapshots {
        children_map.entry(snap.parent_id.as_deref()).or_default().push(snap);
    }

    fn build_node(snap: &VMSnapshot, children_map: &HashMap<Option<&str>, Vec<&VMSnapshot>>, depth: usize) -> SnapshotTreeNode {
        let children = if depth >= 100 {
            vec![] // Prevent infinite recursion on circular parent references
        } else {
            children_map.get(&Some(snap.id.as_str()))
                .map(|kids| kids.iter().map(|s| build_node(s, children_map, depth + 1)).collect())
                .unwrap_or_default()
        };
        SnapshotTreeNode {
            snapshot: snap.clone(),
            children,
        }
    }

    children_map.get(&None)
        .map(|roots| roots.iter().map(|s| build_node(s, &children_map, 0)).collect())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_snap(id: &str, parent: Option<&str>) -> VMSnapshot {
        VMSnapshot {
            id: id.to_string(),
            vm_name: "test-vm".to_string(),
            name: format!("snap-{}", id),
            description: None,
            snapshot_type: SnapshotType::Disk,
            parent_id: parent.map(|s| s.to_string()),
            size_bytes: 0,
            created: Utc::now(),
        }
    }

    #[test]
    fn test_tree_empty() {
        let tree = build_snapshot_tree(&[]);
        assert!(tree.is_empty());
    }

    #[test]
    fn test_tree_single_root() {
        let snaps = vec![make_snap("a", None)];
        let tree = build_snapshot_tree(&snaps);
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].snapshot.id, "a");
        assert!(tree[0].children.is_empty());
    }

    #[test]
    fn test_tree_parent_child() {
        let snaps = vec![make_snap("root", None), make_snap("child", Some("root"))];
        let tree = build_snapshot_tree(&snaps);
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].snapshot.id, "root");
        assert_eq!(tree[0].children.len(), 1);
        assert_eq!(tree[0].children[0].snapshot.id, "child");
    }

    #[test]
    fn test_tree_depth_limit() {
        // Build a chain of 110 snapshots, each parenting the next
        let mut snaps = vec![make_snap("0", None)];
        for i in 1..110 {
            snaps.push(make_snap(&i.to_string(), Some(&(i - 1).to_string())));
        }
        let tree = build_snapshot_tree(&snaps);
        assert_eq!(tree.len(), 1);
        // Walk down — should stop at depth 100
        let mut node = &tree[0];
        let mut depth = 0;
        while !node.children.is_empty() {
            node = &node.children[0];
            depth += 1;
        }
        assert!(depth <= 100, "Tree should stop at depth 100, got {}", depth);
    }
}

