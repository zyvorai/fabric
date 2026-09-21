// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Answers "why this host?" from the same scheduler used to place replicas.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use security::RequireRead;
use serde_json::json;
use std::sync::Arc;

use crate::server::AppState;

use super::types::{InferenceDeployment, InferenceProfile};
use super::{err, scheduler, STORE_DEPLOYMENTS, STORE_NODES, STORE_PROFILES};

/// GET /api/ai/explain/placement/{deployment}
pub async fn explain_placement(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let dep = state
        .store
        .get_entity::<InferenceDeployment>(STORE_DEPLOYMENTS, &name)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "InferenceDeployment not found"))?;
    let profile = state
        .store
        .get_entity::<InferenceProfile>(STORE_PROFILES, &dep.profile)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "profile not found"))?;
    let nodes = state.store.list_entities(STORE_NODES).unwrap_or_default();
    let request = super::reconcile::schedule_request(&state, &dep, &profile);
    let (choice, rejected) = scheduler::explain(&nodes, &request, Utc::now().timestamp());
    let sites = super::federation::distinct_node_sites(&nodes);
    Ok(Json(json!({
        "deployment": name,
        "chosen": choice,
        "rejected": rejected.into_iter().map(|(id, reason)| json!({"node": id, "reason": reason})).collect::<Vec<_>>(),
        "minimum_sites": dep.minimum_sites,
        "sites_satisfied": super::federation::meets_minimum_sites(sites, dep.minimum_sites),
        "phase": dep.status.phase,
        "message": dep.status.message,
    })))
}
