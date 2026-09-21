// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Inference node inventory. Scheduling reads these records; a missing list
//! keeps placement on the local FluxVM host.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use security::{RequireRead, RequireWrite};
use std::sync::Arc;

use crate::server::AppState;

use super::types::{CreateNodeRequest, InferenceNode, NodeState};
use super::{audit, err, STORE_NODES};

/// GET /api/ai/nodes
pub async fn list_nodes(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<InferenceNode>>, (StatusCode, Json<serde_json::Value>)> {
    let mut nodes: Vec<InferenceNode> = state
        .store
        .list_entities(STORE_NODES)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    nodes.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(Json(nodes))
}

/// GET /api/ai/nodes/{id}
pub async fn get_node(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<InferenceNode>, (StatusCode, Json<serde_json::Value>)> {
    state
        .store
        .get_entity(STORE_NODES, &id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "inference node not found"))
        .map(Json)
}

/// POST /api/ai/nodes
pub async fn create_node(
    RequireWrite(claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateNodeRequest>,
) -> Result<(StatusCode, Json<InferenceNode>), (StatusCode, Json<serde_json::Value>)> {
    crate::validation::validate_entity_name(&req.id).map_err(|(s, m)| err(s, m))?;
    if state
        .store
        .get_entity::<InferenceNode>(STORE_NODES, &req.id)
        .ok()
        .flatten()
        .is_some()
    {
        return Err(err(
            StatusCode::CONFLICT,
            format!("inference node '{}' already exists", req.id),
        ));
    }
    let node = InferenceNode {
        id: req.id,
        site: req.site,
        failure_domain: req.failure_domain,
        state: NodeState::Ready,
        heartbeat_unix: Utc::now().timestamp(),
        gpus: req.gpus,
        taints: req.taints,
        cpu_free: req.cpu_free,
        memory_gib_free: req.memory_gib_free,
        cached_models: req.cached_models,
    };
    state
        .store
        .save_entity(STORE_NODES, &node.id, &node)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    audit(
        &state,
        &claims.sub,
        "CREATE",
        &format!("ai/nodes/{}", node.id),
        "SUCCESS",
    );
    Ok((StatusCode::CREATED, Json(node)))
}

/// POST /api/ai/nodes/{id}/heartbeat
pub async fn heartbeat(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<InferenceNode>, (StatusCode, Json<serde_json::Value>)> {
    let mut node = state
        .store
        .get_entity::<InferenceNode>(STORE_NODES, &id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "inference node not found"))?;
    node.heartbeat_unix = Utc::now().timestamp();
    if matches!(node.state, NodeState::Joining | NodeState::Offline) {
        node.state = NodeState::Ready;
    }
    state
        .store
        .save_entity(STORE_NODES, &node.id, &node)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(node))
}

#[derive(Debug, serde::Deserialize)]
pub struct MigRequest {
    pub profile: String,
}

fn allocated_bdfs(state: &AppState) -> Vec<(String, String)> {
    let deployments: Vec<super::types::InferenceDeployment> = state
        .store
        .list_entities(super::STORE_DEPLOYMENTS)
        .unwrap_or_default();
    deployments
        .iter()
        .flat_map(|dep| dep.status.replicas.iter())
        .filter(|rep| !rep.bdf.is_empty())
        .map(|rep| (rep.host.clone(), rep.bdf.clone()))
        .collect()
}

fn set_gpu_health(
    state: &AppState,
    id: &str,
    bdf: &str,
    healthy: bool,
) -> Result<Json<InferenceNode>, (StatusCode, Json<serde_json::Value>)> {
    let mut node = state
        .store
        .get_entity::<InferenceNode>(STORE_NODES, id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "inference node not found"))?;
    let gpu = node
        .gpus
        .iter_mut()
        .find(|gpu| gpu.bdf.eq_ignore_ascii_case(bdf))
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "GPU not found on node"))?;
    gpu.healthy = healthy;
    state
        .store
        .save_entity(STORE_NODES, id, &node)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(node))
}

/// POST /api/ai/nodes/{id}/gpus/{bdf}/quarantine
pub async fn quarantine_gpu(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path((id, bdf)): Path<(String, String)>,
) -> Result<Json<InferenceNode>, (StatusCode, Json<serde_json::Value>)> {
    set_gpu_health(&state, &id, &bdf, false)
}

/// POST /api/ai/nodes/{id}/gpus/{bdf}/restore
pub async fn restore_gpu(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path((id, bdf)): Path<(String, String)>,
) -> Result<Json<InferenceNode>, (StatusCode, Json<serde_json::Value>)> {
    set_gpu_health(&state, &id, &bdf, true)
}

/// POST /api/ai/nodes/{id}/gpus/{bdf}/mig
pub async fn set_mig(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path((id, bdf)): Path<(String, String)>,
    Json(body): Json<MigRequest>,
) -> Result<Json<InferenceNode>, (StatusCode, Json<serde_json::Value>)> {
    if !super::gpu_orch::mig_reconfigure_allowed(&bdf, &allocated_bdfs(&state)) {
        return Err(err(
            StatusCode::CONFLICT,
            "MIG profile cannot change while the GPU is allocated",
        ));
    }
    let mut node = state
        .store
        .get_entity::<InferenceNode>(STORE_NODES, &id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "inference node not found"))?;
    let gpu = node
        .gpus
        .iter_mut()
        .find(|gpu| gpu.bdf.eq_ignore_ascii_case(&bdf))
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "GPU not found on node"))?;
    gpu.mig_profile = body.profile;
    state
        .store
        .save_entity(STORE_NODES, &id, &node)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(node))
}
