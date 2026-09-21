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
