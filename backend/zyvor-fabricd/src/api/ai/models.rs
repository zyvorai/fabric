// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! ModelArtifact REST handlers (AI Inference MVP, preview).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use security::{RequireRead, RequireWrite};
use std::sync::Arc;

use crate::server::AppState;

use super::types::{CreateModelArtifactRequest, ModelArtifact, TenantQuery};
use super::{audit, err, model_cache, STORE_MODELS};

/// GET /api/ai/models
pub async fn list_models(
    RequireRead(claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Query(q): Query<TenantQuery>,
) -> Result<Json<Vec<ModelArtifact>>, (StatusCode, Json<serde_json::Value>)> {
    let tenant_filter = crate::tenant_scope::apply_list_tenant_filter(&claims, q.tenant)
        .map_err(|(s, m)| err(s, m))?;

    let mut items: Vec<ModelArtifact> = state
        .store
        .list_entities(STORE_MODELS)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(ref t) = tenant_filter {
        items.retain(|m| m.tenant.as_deref() == Some(t.as_str()));
    }
    items.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(items))
}

/// GET /api/ai/models/{name}
pub async fn get_model(
    RequireRead(claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<ModelArtifact>, (StatusCode, Json<serde_json::Value>)> {
    let model = state
        .store
        .get_entity::<ModelArtifact>(STORE_MODELS, &name)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "ModelArtifact not found"))?;

    if let Some(ref claim_tenant) = claims.tenant {
        if model.tenant.as_deref() != Some(claim_tenant.as_str()) {
            return Err(err(StatusCode::NOT_FOUND, "ModelArtifact not found"));
        }
    }
    Ok(Json(model))
}

/// POST /api/ai/models
pub async fn create_model(
    RequireWrite(claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(mut req): Json<CreateModelArtifactRequest>,
) -> Result<(StatusCode, Json<ModelArtifact>), (StatusCode, Json<serde_json::Value>)> {
    crate::validation::validate_entity_name(&req.name).map_err(|(s, m)| err(s, m))?;
    if req.source.trim().is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "source is required"));
    }
    if req.format.trim().is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "format is required"));
    }

    req.tenant = crate::tenant_scope::apply_create_tenant(&claims, req.tenant)
        .map_err(|(s, m)| err(s, m))?;

    if state
        .store
        .get_entity::<ModelArtifact>(STORE_MODELS, &req.name)
        .ok()
        .flatten()
        .is_some()
    {
        return Err(err(
            StatusCode::CONFLICT,
            format!("ModelArtifact '{}' already exists", req.name),
        ));
    }

    let state_dir = std::path::PathBuf::from(&state.config.storage.path);
    if req.require_checksum
        && req
            .checksum
            .as_ref()
            .map(|c| c.trim().is_empty())
            .unwrap_or(true)
    {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "require_checksum is set but no checksum was provided",
        ));
    }
    let (local_path, verified) = match model_cache::materialize_model(
        &req.name,
        &req.source,
        req.checksum.as_deref(),
        &state_dir,
    ) {
        Ok((path, hex)) => {
            if req.require_checksum && hex.is_none() {
                return Err(err(
                    StatusCode::BAD_REQUEST,
                    "checksum verification required but could not be completed",
                ));
            }
            (Some(path.to_string_lossy().into_owned()), hex)
        }
        Err(e) if req.source.starts_with("hf://") && !req.require_checksum => {
            // Allow registering the artifact without a host download so the
            // REST layer can be smoke-tested GPU-less; reconcile will fail
            // clearly until FLUXVM_AI_MODEL_DIR or huggingface-cli is set.
            tracing::warn!("model '{}' materialize deferred: {e}", req.name);
            (None, None)
        }
        Err(e) => return Err(err(StatusCode::BAD_REQUEST, e)),
    };

    let now = Utc::now();
    let model = ModelArtifact {
        name: req.name.clone(),
        source: req.source,
        revision: req.revision,
        checksum: verified.or(req.checksum),
        format: req.format,
        size_bytes: req.size_bytes,
        tenant: req.tenant,
        local_path,
        license: req.license,
        residency: req.residency,
        require_checksum: req.require_checksum,
        created: now,
        updated: now,
    };

    state
        .store
        .save_entity(STORE_MODELS, &model.name, &model)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    audit(
        &state,
        &claims.sub,
        "CREATE",
        &format!("ai/models/{}", model.name),
        "SUCCESS",
    );
    Ok((StatusCode::CREATED, Json(model)))
}

/// DELETE /api/ai/models/{name}
pub async fn delete_model(
    RequireWrite(claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    let model = state
        .store
        .get_entity::<ModelArtifact>(STORE_MODELS, &name)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "ModelArtifact not found"))?;

    if let Some(ref claim_tenant) = claims.tenant {
        if model.tenant.as_deref() != Some(claim_tenant.as_str()) {
            return Err(err(StatusCode::NOT_FOUND, "ModelArtifact not found"));
        }
    }

    // Refuse delete while a deployment still references the model.
    let deps: Vec<super::types::InferenceDeployment> = state
        .store
        .list_entities(super::STORE_DEPLOYMENTS)
        .unwrap_or_default();
    if deps.iter().any(|d| d.model == name) {
        return Err(err(
            StatusCode::CONFLICT,
            format!("ModelArtifact '{name}' is referenced by an InferenceDeployment"),
        ));
    }

    state
        .store
        .delete_entity(STORE_MODELS, &name)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    audit(
        &state,
        &claims.sub,
        "DELETE",
        &format!("ai/models/{name}"),
        "SUCCESS",
    );
    Ok(StatusCode::NO_CONTENT)
}
