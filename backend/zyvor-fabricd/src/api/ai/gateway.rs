// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0
//!
//! OpenAI-compatible AI gateway (preview).
//!
//! Clients point `OPENAI_BASE_URL` at:
//!   `https://<fabric>/api/ai/openai/<endpoint-name>`
//! and send `Authorization: Bearer <fvai_…>` (InferenceApiKey).
//! Fabric validates the key, enforces request quotas, then proxies to the
//! Maglev VIP or a ready replica. JWT is not required on this path.

use axum::{
    body::Body,
    extract::{Path, Request, State},
    http::{header, Method, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::Utc;
use std::sync::Arc;

use crate::server::AppState;

use super::keys::{self, STORE_API_KEYS};
use super::types::{InferenceApiKey, InferenceDeployment, InferenceEndpoint};
use super::{audit, STORE_DEPLOYMENTS, STORE_ENDPOINTS};

/// ANY /api/ai/openai/{endpoint}/{*path}
pub async fn openai_gateway(
    State(state): State<Arc<AppState>>,
    Path((endpoint_name, path)): Path<(String, String)>,
    req: Request,
) -> Response {
    match gateway_inner(&state, &endpoint_name, &path, req).await {
        Ok(resp) => resp,
        Err((status, msg)) => (
            status,
            Json(serde_json::json!({
                "error": {
                    "message": msg,
                    "type": "fabric_ai_gateway",
                    "code": status.as_u16(),
                }
            })),
        )
            .into_response(),
    }
}

/// ANY /api/ai/openai/{endpoint}  (empty path → /v1 models hint)
pub async fn openai_gateway_root(
    State(state): State<Arc<AppState>>,
    Path(endpoint_name): Path<String>,
    req: Request,
) -> Response {
    openai_gateway(
        State(state),
        Path((endpoint_name, String::new())),
        req,
    )
    .await
}

async fn gateway_inner(
    state: &AppState,
    endpoint_name: &str,
    path: &str,
    req: Request,
) -> Result<Response, (StatusCode, String)> {
    let method = req.method().clone();
    if method == Method::OPTIONS {
        return Ok(Response::builder()
            .status(StatusCode::NO_CONTENT)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "authorization, content-type")
            .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, OPTIONS")
            .body(Body::empty())
            .unwrap());
    }

    let secret = extract_bearer(req.headers()).ok_or((
        StatusCode::UNAUTHORIZED,
        "missing or invalid Authorization: Bearer <api-key>".into(),
    ))?;

    let mut key = keys::verify_api_key(state, &secret).ok_or((
        StatusCode::UNAUTHORIZED,
        "invalid API key".into(),
    ))?;

    if key.endpoint != endpoint_name {
        return Err((
            StatusCode::FORBIDDEN,
            format!("API key is not scoped to endpoint '{endpoint_name}'"),
        ));
    }

    if let Some(quota) = key.request_quota {
        if key.requests_used >= quota {
            return Err((
                StatusCode::TOO_MANY_REQUESTS,
                "API key request quota exceeded".into(),
            ));
        }
    }

    let ep: InferenceEndpoint = state
        .store
        .get_entity(STORE_ENDPOINTS, endpoint_name)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::NOT_FOUND,
            format!("InferenceEndpoint '{endpoint_name}' not found"),
        ))?;

    let dep: InferenceDeployment = state
        .store
        .get_entity(STORE_DEPLOYMENTS, &ep.deployment)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::BAD_GATEWAY,
            format!("deployment '{}' not found", ep.deployment),
        ))?;

    if let Some(ref model_scope) = key.model {
        if &dep.model != model_scope {
            return Err((
                StatusCode::FORBIDDEN,
                format!("API key is scoped to model '{model_scope}'"),
            ));
        }
    }

    // Consume one request unit (best-effort persist).
    key.requests_used = key.requests_used.saturating_add(1);
    key.last_used = Some(Utc::now());
    let _ = state.store.save_entity(STORE_API_KEYS, &key.id, &key);
    audit(
        state,
        &format!("apikey:{}", key.prefix),
        "INFER",
        &format!("ai/openai/{endpoint_name}/{path}"),
        "SUCCESS",
    );

    let dry_run = std::env::var("FLUXVM_AI_DRY_RUN")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let upstream_path = if path.is_empty() {
        "/v1/models".to_string()
    } else if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    };

    if dry_run {
        return Ok(dry_run_response(&method, &upstream_path, &dep.model));
    }

    let target = resolve_upstream(&ep, &dep).ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "no ready inference backend (set VIP or wait for replicas)".into(),
    ))?;

    let body_bytes = axum::body::to_bytes(req.into_body(), 16 * 1024 * 1024)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("read body: {e}")))?;

    let url = format!("http://{target}{upstream_path}");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut upstream = client.request(
        reqwest::Method::from_bytes(method.as_str().as_bytes())
            .unwrap_or(reqwest::Method::POST),
        &url,
    );
    if !body_bytes.is_empty() {
        upstream = upstream
            .header(header::CONTENT_TYPE, "application/json")
            .body(body_bytes.to_vec());
    }

    let upstream_resp = upstream
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("upstream: {e}")))?;

    let status =
        StatusCode::from_u16(upstream_resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let content_type = upstream_resp
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/json")
        .to_string();
    let bytes = upstream_resp
        .bytes()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("upstream body: {e}")))?;

    Ok(Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Body::from(bytes))
        .unwrap())
}

fn extract_bearer(headers: &axum::http::HeaderMap) -> Option<String> {
    let raw = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let token = raw
        .strip_prefix("Bearer ")
        .or_else(|| raw.strip_prefix("bearer "))?
        .trim();
    if token.is_empty() {
        None
    } else {
        Some(token.to_string())
    }
}

fn resolve_upstream(ep: &InferenceEndpoint, dep: &InferenceDeployment) -> Option<String> {
    if let Some(vip) = ep.vip.as_deref() {
        return Some(format!("{vip}:{}", ep.port));
    }
    dep.status
        .replicas
        .iter()
        .find(|r| r.ready && !r.draining)
        .and_then(|r| r.address.as_ref())
        .map(|a| format!("{a}:{}", ep.port))
}

fn dry_run_response(method: &Method, path: &str, model: &str) -> Response {
    let body = if path.contains("chat/completions") || (method == Method::POST && path.contains("completions")) {
        serde_json::json!({
            "id": "chatcmpl-fabric-dry-run",
            "object": "chat.completion",
            "created": Utc::now().timestamp(),
            "model": model,
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "Fabric AI gateway dry-run: API key accepted."
                },
                "finish_reason": "stop"
            }],
            "usage": {"prompt_tokens": 0, "completion_tokens": 8, "total_tokens": 8}
        })
    } else if path.contains("/models") {
        serde_json::json!({
            "object": "list",
            "data": [{"id": model, "object": "model", "owned_by": "fabric"}]
        })
    } else {
        serde_json::json!({
            "object": "fabric.ai.dry_run",
            "model": model,
            "path": path,
            "message": "API key accepted (FLUXVM_AI_DRY_RUN=1); no GPU upstream"
        })
    };
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/json"), (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")],
        Json(body),
    )
        .into_response()
}

/// Touch key usage for unit tests / quota math.
pub fn would_reject_quota(key: &InferenceApiKey) -> bool {
    key.request_quota
        .is_some_and(|q| key.requests_used >= q)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quota_gate() {
        let mut key = InferenceApiKey {
            id: "x".into(),
            name: "n".into(),
            endpoint: "e".into(),
            model: None,
            tenant: None,
            secret_hash: "h".into(),
            prefix: "fvai_".into(),
            request_quota: Some(2),
            requests_used: 2,
            created: Utc::now(),
            last_used: None,
        };
        assert!(would_reject_quota(&key));
        key.requests_used = 1;
        assert!(!would_reject_quota(&key));
    }
}
