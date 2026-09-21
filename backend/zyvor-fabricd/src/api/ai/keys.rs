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
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use subtle::ConstantTimeEq;

use crate::server::AppState;

use super::types::{
    CreateApiKeyRequest, CreateApiKeyResponse, InferenceApiKey, InferenceApiKeyView,
    InferenceEndpoint, TenantQuery,
};
use super::{audit, err, STORE_ENDPOINTS};

pub(crate) const STORE_API_KEYS: &str = "ai_inference_api_keys";

/// GET /api/ai/keys
pub async fn list_keys(
    RequireRead(claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Query(q): Query<TenantQuery>,
) -> Result<Json<Vec<InferenceApiKeyView>>, (StatusCode, Json<serde_json::Value>)> {
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
    let views = items.iter().map(InferenceApiKeyView::from).collect();
    Ok(Json(views))
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
        tokens_per_minute: req.tokens_per_minute,
        max_concurrent: req.max_concurrent,
        requests_used: 0,
        tokens_used_window: 0,
        window_started_unix: 0,
        inflight: 0,
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
        Json(CreateApiKeyResponse {
            key: InferenceApiKeyView::from(&key),
            secret,
        }),
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

fn key_locks() -> &'static Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>> {
    static LOCKS: OnceLock<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> = OnceLock::new();
    LOCKS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn key_lock(id: &str) -> Arc<tokio::sync::Mutex<()>> {
    let mut map = key_locks().lock().unwrap_or_else(|e| e.into_inner());
    map.entry(id.to_string())
        .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
        .clone()
}

/// Sequential quota step. The per-key mutex in `consume_request` is what
/// serializes callers; this helper is the decision itself.
pub fn try_reserve_quota(used: u64, quota: Option<u64>) -> Result<u64, &'static str> {
    if quota.is_some_and(|q| used >= q) {
        return Err("quota exceeded");
    }
    Ok(used.saturating_add(1))
}

/// Re-read the key under its lock, reject when the lifetime quota is spent,
/// then increment and persist before the gateway proxies.
pub async fn consume_request(
    state: &AppState,
    key_id: &str,
    requested_tokens: u64,
) -> Result<InferenceApiKey, String> {
    let lock = key_lock(key_id);
    let _guard = lock.lock().await;
    let now = Utc::now().timestamp();
    let key = state
        .store
        .update_entity_exclusive(STORE_API_KEYS, key_id, |key: InferenceApiKey| {
            admit_limits(key, now, requested_tokens.max(1))
        })
        .map_err(|e| e.to_string())?;
    Ok(key)
}

pub fn release_concurrency(state: &AppState, key_id: &str) {
    release_concurrency_store(&state.store, key_id);
}

pub fn release_concurrency_store(store: &state_store::StateStore, key_id: &str) {
    let _ = store.update_entity_exclusive(STORE_API_KEYS, key_id, |mut key: InferenceApiKey| {
        key.inflight = key.inflight.saturating_sub(1);
        Ok::<_, String>(key)
    });
}

/// Store-backed token window and in-flight cap. Not a process-local counter.
pub fn admit_limits(
    mut key: InferenceApiKey,
    now_unix: i64,
    requested_tokens: u64,
) -> Result<InferenceApiKey, String> {
    if now_unix.saturating_sub(key.window_started_unix) >= 60 {
        key.window_started_unix = now_unix;
        key.tokens_used_window = 0;
    }
    if let Some(limit) = key.tokens_per_minute {
        if key.tokens_used_window.saturating_add(requested_tokens) > limit {
            return Err("API key token rate exceeded".into());
        }
        key.tokens_used_window = key.tokens_used_window.saturating_add(requested_tokens);
    }
    if let Some(max) = key.max_concurrent {
        if key.inflight >= max {
            return Err("API key concurrency exceeded".into());
        }
    }
    key.inflight = key.inflight.saturating_add(1);
    key.requests_used = try_reserve_quota(key.requests_used, key.request_quota)
        .map_err(|_| "API key request quota exceeded".to_string())?;
    key.last_used = Some(Utc::now());
    Ok(key)
}

pub fn requested_tokens(body: &[u8]) -> u64 {
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(body) else {
        return 1;
    };
    value
        .get("max_tokens")
        .and_then(|v| v.as_u64())
        .filter(|n| *n > 0)
        .unwrap_or(1)
}

pub fn hmac_key() -> Result<String, String> {
    let require = std::env::var("FLUXVM_AI_REQUIRE_HMAC").ok().as_deref() == Some("1");
    match std::env::var("FLUXVM_AI_KEY_HMAC_SECRET") {
        Ok(value) if !value.is_empty() && value != "fabric-ai-preview-hmac" => Ok(value),
        Ok(value) if !value.is_empty() && !require => Ok(value),
        _ if require => Err("FLUXVM_AI_KEY_HMAC_SECRET must be set to a non-default value".into()),
        _ => Ok("fabric-ai-preview-hmac".into()),
    }
}

/// Validate a bearer token: prefix lookup, then a constant-time HMAC compare.
pub fn verify_api_key(state: &AppState, secret: &str) -> Option<InferenceApiKey> {
    hmac_key().ok()?;
    let prefix: String = secret.chars().take(8).collect();
    let hash = hash_secret(secret);
    let keys: Vec<InferenceApiKey> = state.store.list_entities(STORE_API_KEYS).ok()?;
    keys.into_iter()
        .find(|k| k.prefix == prefix && bool::from(k.secret_hash.as_bytes().ct_eq(hash.as_bytes())))
}

pub fn hash_secret(secret: &str) -> String {
    let key = hmac_key().unwrap_or_else(|_| "fabric-ai-preview-hmac".into());
    let digest = hmac_sha256(key.as_bytes(), secret.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

fn hmac_sha256(key: &[u8], msg: &[u8]) -> [u8; 32] {
    const BLOCK: usize = 64;
    let mut key_block = [0u8; BLOCK];
    if key.len() > BLOCK {
        let digested = Sha256::digest(key);
        key_block[..32].copy_from_slice(&digested);
    } else {
        key_block[..key.len()].copy_from_slice(key);
    }
    let mut ipad = [0x36u8; BLOCK];
    let mut opad = [0x5cu8; BLOCK];
    for i in 0..BLOCK {
        ipad[i] ^= key_block[i];
        opad[i] ^= key_block[i];
    }
    let mut inner = Sha256::new();
    inner.update(ipad);
    inner.update(msg);
    let inner_hash = inner.finalize();
    let mut outer = Sha256::new();
    outer.update(opad);
    outer.update(inner_hash);
    let out = outer.finalize();
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&out);
    arr
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

    #[test]
    fn list_view_omits_secret_hash() {
        let key = InferenceApiKey {
            id: "aik_1".into(),
            name: "n".into(),
            endpoint: "e".into(),
            model: None,
            tenant: None,
            secret_hash: "deadbeef".into(),
            prefix: "fvai_abc".into(),
            request_quota: Some(2),
            tokens_per_minute: None,
            max_concurrent: None,
            requests_used: 0,
            tokens_used_window: 0,
            window_started_unix: 0,
            inflight: 0,
            created: Utc::now(),
            last_used: None,
        };
        let json = serde_json::to_string(&InferenceApiKeyView::from(&key)).unwrap();
        assert!(!json.contains("secret_hash"));
        assert!(!json.contains("deadbeef"));
    }

    #[test]
    fn sequential_quota_cannot_exceed() {
        let mut used = 0u64;
        used = try_reserve_quota(used, Some(2)).unwrap();
        used = try_reserve_quota(used, Some(2)).unwrap();
        assert!(try_reserve_quota(used, Some(2)).is_err());
    }

    #[test]
    fn token_and_concurrency_limits_are_exclusive() {
        let mut key = InferenceApiKey {
            id: "aik_1".into(),
            name: "n".into(),
            endpoint: "e".into(),
            model: None,
            tenant: None,
            secret_hash: "h".into(),
            prefix: "fvai_abc".into(),
            request_quota: None,
            tokens_per_minute: Some(10),
            max_concurrent: Some(1),
            requests_used: 0,
            tokens_used_window: 0,
            window_started_unix: 1_000,
            inflight: 0,
            created: Utc::now(),
            last_used: None,
        };
        key = admit_limits(key, 1_010, 4).unwrap();
        assert_eq!(key.tokens_used_window, 4);
        assert_eq!(key.inflight, 1);
        assert!(admit_limits(key, 1_020, 1).is_err());
        assert_eq!(requested_tokens(br#"{"max_tokens":16}"#), 16);
    }
}
