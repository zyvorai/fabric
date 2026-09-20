// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0
//!
//! Inference endpoint API keys (Phase 4, preview).
//! Secrets are hashed at rest; plaintext returned once on create.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use security::{RequireRead, RequireWrite};
use sha2::{Digest, Sha256};
use std::sync::Arc;

use crate::server::AppState;

use super::types::{
    CreateApiKeyRequest, CreateApiKeyResponse, InferenceApiKey, InferenceEndpoint, TenantQuery,
};
use super::{audit, err, STORE_ENDPOINTS};

pub(crate) const STORE_API_KEYS: &str = "ai_inference_api_keys";

/// GET /api/ai/keys
pub async fn list_keys(
    RequireRead(claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Query(q): Query<TenantQuery>,
) -> Result<Json<Vec<InferenceApiKey>>, (StatusCode, Json<serde_json::Value>)> {
    let tenant_filter = crate::tenant_scope::apply_list_tenant_filter(&claims, q.tenant)
        .map_err(|(s, m)| err(s, m))?;

    let mut items: Vec<InferenceApiKey> = state
        .store
        .list_entities(STORE_API_KEYS)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(ref t) = tenant_filter {
        items.retain(|k| k.tenant.as_deref() == Some(t.as_str()));
    }
    items.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(items))
}

/// POST /api/ai/keys
pub async fn create_key(
    RequireWrite(claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(mut req): Json<CreateApiKeyRequest>,
) -> Result<(StatusCode, Json<CreateApiKeyResponse>), (StatusCode, Json<serde_json::Value>)> {
    crate::validation::validate_entity_name(&req.name).map_err(|(s, m)| err(s, m))?;
    req.tenant = crate::tenant_scope::apply_create_tenant(&claims, req.tenant)
        .map_err(|(s, m)| err(s, m))?;

    let ep = state
        .store
        .get_entity::<InferenceEndpoint>(STORE_ENDPOINTS, &req.endpoint)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| {
            err(
                StatusCode::BAD_REQUEST,
                format!("InferenceEndpoint '{}' not found", req.endpoint),
            )
        })?;

    if let Some(ref t) = req.tenant {
        if ep.tenant.as_ref() != Some(t) {
            return Err(err(
                StatusCode::FORBIDDEN,
                "key tenant must match endpoint tenant",
            ));
        }
    }

    let secret = generate_secret();
    let secret_hash = hash_secret(&secret);
    let id = format!("aik_{}", &uuid_simple()[..12]);
    let now = Utc::now();
    let key = InferenceApiKey {
        id: id.clone(),
        name: req.name,
        endpoint: req.endpoint,
        model: req.model,
        tenant: req.tenant,
        secret_hash,
        prefix: secret.chars().take(8).collect(),
        request_quota: req.request_quota,
        requests_used: 0,
        created: now,
        last_used: None,
    };

    state
        .store
        .save_entity(STORE_API_KEYS, &key.id, &key)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    audit(
        &state,
        &claims.sub,
        "CREATE",
        &format!("ai/keys/{}", key.id),
        "SUCCESS",
    );

    Ok((
        StatusCode::CREATED,
        Json(CreateApiKeyResponse { key, secret }),
    ))
}

/// DELETE /api/ai/keys/{id}
pub async fn delete_key(
    RequireWrite(claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    let key = state
        .store
        .get_entity::<InferenceApiKey>(STORE_API_KEYS, &id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "API key not found"))?;

    if let Some(ref claim_tenant) = claims.tenant {
        if key.tenant.as_deref() != Some(claim_tenant.as_str()) {
            return Err(err(StatusCode::NOT_FOUND, "API key not found"));
        }
    }

    state
        .store
        .delete_entity(STORE_API_KEYS, &id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    audit(
        &state,
        &claims.sub,
        "DELETE",
        &format!("ai/keys/{id}"),
        "SUCCESS",
    );
    Ok(StatusCode::NO_CONTENT)
}

/// Validate a bearer/token against stored hashes. Returns the key on match.
pub fn verify_api_key(state: &AppState, secret: &str) -> Option<InferenceApiKey> {
    let hash = hash_secret(secret);
    let keys: Vec<InferenceApiKey> = state.store.list_entities(STORE_API_KEYS).ok()?;
    keys.into_iter().find(|k| k.secret_hash == hash)
}

pub fn hash_secret(secret: &str) -> String {
    let digest = Sha256::digest(secret.as_bytes());
    digest.iter().map(|b| format!("{:02x}", b)).collect()
}

fn generate_secret() -> String {
    format!("fvai_{}", uuid::Uuid::new_v4().simple())
}

fn uuid_simple() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_is_stable() {
        assert_eq!(hash_secret("abc"), hash_secret("abc"));
        assert_ne!(hash_secret("abc"), hash_secret("abd"));
    }
}
