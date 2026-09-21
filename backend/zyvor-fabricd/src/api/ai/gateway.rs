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
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::Utc;
use futures::StreamExt;
use std::sync::Arc;
use std::time::Duration;

use crate::server::AppState;

use super::keys::{self};
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
    openai_gateway(State(state), Path((endpoint_name, String::new())), req).await
}

async fn gateway_inner(
    state: &AppState,
    endpoint_name: &str,
    path: &str,
    req: Request,
) -> Result<Response, (StatusCode, String)> {
    let method = req.method().clone();
    if method == Method::OPTIONS {
        return Ok(cors_response());
    }

    let secret = extract_bearer(req.headers()).ok_or((
        StatusCode::UNAUTHORIZED,
        "missing or invalid Authorization: Bearer <api-key>".into(),
    ))?;
    if let Err(msg) = reject_control_plane_jwt(&secret) {
        return Err((StatusCode::UNAUTHORIZED, msg.into()));
    }

    let upstream_hint = if path.is_empty() {
        "/v1/models".to_string()
    } else if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    };
    if !inference_path_allowed(&upstream_hint) {
        return Err((
            StatusCode::NOT_FOUND,
            format!("inference path '{upstream_hint}' is not served"),
        ));
    }

    let mut key = keys::verify_api_key(state, &secret)
        .ok_or((StatusCode::UNAUTHORIZED, "invalid API key".into()))?;

    if key.endpoint != endpoint_name {
        return Err((
            StatusCode::FORBIDDEN,
            format!("API key is not scoped to endpoint '{endpoint_name}'"),
        ));
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

    let (parts, body) = req.into_parts();
    let limit = body_limit();
    let body_bytes = axum::body::to_bytes(body, limit).await.map_err(|_| {
        (
            StatusCode::PAYLOAD_TOO_LARGE,
            format!("body exceeds {limit} bytes"),
        )
    })?;
    let tokens = keys::requested_tokens(&body_bytes);
    if let Some(rpm) = gateway_rpm() {
        admit_endpoint_rate(state, endpoint_name, tokens, rpm)
            .map_err(|e| (StatusCode::TOO_MANY_REQUESTS, e))?;
    }
    if super::circuit::is_open(&load_breaker(state, endpoint_name), Utc::now().timestamp()) {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "inference circuit is open".into(),
        ));
    }
    request_deadline_secs(
        parts
            .headers
            .get("x-request-timeout")
            .and_then(|v| v.to_str().ok()),
        120,
        300,
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    let depths: Vec<u32> = dep
        .status
        .replicas
        .iter()
        .filter(|rep| rep.ready)
        .map(|rep| {
            rep.metrics
                .as_ref()
                .map(|metrics| metrics.queue_depth)
                .unwrap_or(0)
        })
        .collect();
    if shed_queue(&depths, shed_limit()) {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "inference queue is shedding load".into(),
        ));
    }
    key = keys::consume_request(state, &key.id, tokens)
        .await
        .map_err(|e| {
            let status = if e.contains("quota") || e.contains("token") || e.contains("concurrency")
            {
                StatusCode::TOO_MANY_REQUESTS
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            (status, e)
        })?;
    let req = Request::from_parts(parts, Body::from(body_bytes.clone()));

    let resource = format!("ai/openai/{endpoint_name}/{path}");
    audit(
        state,
        &format!("apikey:{}", key.prefix),
        "INFER",
        &resource,
        "ATTEMPT",
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
        audit(
            state,
            &format!("apikey:{}", key.prefix),
            "INFER",
            &resource,
            "SUCCESS",
        );
        keys::release_concurrency(state, &key.id);
        return Ok(dry_run_response(
            &method,
            &upstream_path,
            &dep.model,
            &body_bytes,
        ));
    }

    let proxied = proxy_upstream(
        &method,
        &ep,
        &dep,
        &upstream_path,
        req,
        state.store.clone(),
        key.id.clone(),
    )
    .await;
    let outcome = match &proxied {
        Ok(resp) if resp.status().is_success() => "SUCCESS",
        _ => "FAILED",
    };
    record_breaker(state, endpoint_name, outcome != "SUCCESS");
    audit(
        state,
        &format!("apikey:{}", key.prefix),
        "INFER",
        &resource,
        outcome,
    );
    proxied
}

struct ConcurrencyGuard {
    store: state_store::StateStore,
    key_id: String,
}

impl Drop for ConcurrencyGuard {
    fn drop(&mut self) {
        keys::release_concurrency_store(&self.store, &self.key_id);
    }
}

async fn proxy_upstream(
    method: &Method,
    ep: &InferenceEndpoint,
    dep: &InferenceDeployment,
    upstream_path: &str,
    req: Request,
    store: state_store::StateStore,
    key_id: String,
) -> Result<Response, (StatusCode, String)> {
    let guard = ConcurrencyGuard { store, key_id };
    let target = resolve_upstream(ep, dep).ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "no ready inference backend (set VIP or wait for replicas)".into(),
    ))?;

    let incoming_type = req
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/json")
        .to_string();
    let url = format!("http://{target}{upstream_path}");
    let deadline = Duration::from_secs(
        request_deadline_secs(
            req.headers()
                .get("x-request-timeout")
                .and_then(|value| value.to_str().ok()),
            120,
            300,
        )
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?,
    );
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let upstream_body = reqwest::Body::wrap_stream(req.into_body().into_data_stream());
    let upstream_resp = client
        .request(
            reqwest::Method::from_bytes(method.as_str().as_bytes())
                .unwrap_or(reqwest::Method::POST),
            &url,
        )
        .header(header::CONTENT_TYPE, incoming_type)
        .timeout(deadline)
        .body(upstream_body)
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("upstream: {e}")))?;

    let status =
        StatusCode::from_u16(upstream_resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut builder = Response::builder().status(status);
    if let Some(headers) = builder.headers_mut() {
        copy_response_headers(upstream_resp.headers(), headers);
    }
    let idle = idle_timeout();
    let stream = async_stream::stream! {
        let _guard = guard;
        let mut chunks = upstream_resp.bytes_stream();
        loop {
            match tokio::time::timeout(idle, chunks.next()).await {
                Ok(Some(Ok(bytes))) => yield Ok::<_, std::io::Error>(bytes),
                Ok(Some(Err(e))) => {
                    yield Err(std::io::Error::other(e));
                    break;
                }
                Ok(None) => break,
                Err(_) => {
                    yield Err(std::io::Error::new(
                        std::io::ErrorKind::TimedOut,
                        "upstream idle timeout",
                    ));
                    break;
                }
            }
        }
    };
    builder
        .body(Body::from_stream(stream))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

fn idle_timeout() -> Duration {
    let secs = std::env::var("FLUXVM_AI_GATEWAY_IDLE_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(60u64);
    Duration::from_secs(secs)
}

fn body_limit() -> usize {
    std::env::var("FLUXVM_AI_GATEWAY_MAX_BODY")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(1024 * 1024)
}

fn gateway_rpm() -> Option<u64> {
    std::env::var("FLUXVM_AI_GATEWAY_RPM")
        .ok()
        .and_then(|v| v.parse().ok())
        .filter(|n| *n > 0)
}

/// `x-request-timeout` is a whole number of seconds. Missing means `default_secs`.
pub fn request_deadline_secs(
    header: Option<&str>,
    default_secs: u64,
    max_secs: u64,
) -> Result<u64, &'static str> {
    let Some(raw) = header.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(default_secs);
    };
    let secs: u64 = raw
        .parse()
        .map_err(|_| "x-request-timeout must be a whole number of seconds")?;
    if secs == 0 || secs > max_secs {
        return Err("x-request-timeout is outside the allowed range");
    }
    Ok(secs)
}

/// Shed when any ready replica's queue is above `limit`. `0` disables shedding.
pub fn shed_queue(queue_depths: &[u32], limit: u32) -> bool {
    limit > 0 && queue_depths.iter().any(|depth| *depth > limit)
}

fn shed_limit() -> u32 {
    std::env::var("FLUXVM_AI_SHED_QUEUE")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0)
}

fn cors_origin() -> String {
    std::env::var("FLUXVM_AI_CORS_ORIGIN").unwrap_or_else(|_| "*".into())
}

fn cors_origin_value() -> HeaderValue {
    HeaderValue::from_str(&cors_origin()).unwrap_or_else(|_| HeaderValue::from_static("*"))
}

fn cors_response() -> Response {
    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, cors_origin_value())
        .header(
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            "authorization, content-type",
        )
        .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, OPTIONS")
        .body(Body::empty())
        .unwrap()
}

pub fn inference_path_allowed(path: &str) -> bool {
    let path = path.trim_start_matches('/');
    matches!(
        path,
        "" | "v1/models"
            | "v1/chat/completions"
            | "v1/completions"
            | "v1/embeddings"
            | "v1/rerank"
            | "v1/batches"
    ) || path.starts_with("v1/batches/")
}

pub fn reject_control_plane_jwt(secret: &str) -> Result<(), &'static str> {
    let jwt = secret.split('.').count() == 3 && !secret.starts_with("fvai_");
    let accept = std::env::var("FLUXVM_AI_GATEWAY_ACCEPT_JWT")
        .map(|v| v == "1")
        .unwrap_or(false);
    if jwt && !accept {
        Err("inference gateway accepts scoped API keys")
    } else {
        Ok(())
    }
}

fn load_breaker(state: &AppState, endpoint: &str) -> super::circuit::Breaker {
    state
        .store
        .get_entity(super::STORE_CIRCUITS, endpoint)
        .ok()
        .flatten()
        .unwrap_or_default()
}

fn record_breaker(state: &AppState, endpoint: &str, failed: bool) {
    let now = Utc::now().timestamp();
    let next = super::circuit::observe(load_breaker(state, endpoint), failed, now);
    let _ = state
        .store
        .save_entity(super::STORE_CIRCUITS, endpoint, &next);
}

fn admit_endpoint_rate(
    state: &AppState,
    endpoint: &str,
    tokens: u64,
    rpm: u64,
) -> Result<(), String> {
    let id = super::limits::counter_id("endpoint", endpoint);
    let current = state
        .store
        .get_entity::<super::limits::RateCounter>(super::STORE_RATE_COUNTERS, &id)
        .ok()
        .flatten()
        .unwrap_or(super::limits::RateCounter {
            id: id.clone(),
            window_started_unix: 0,
            requests: 0,
            tokens: 0,
        });
    if state
        .store
        .get_entity::<super::limits::RateCounter>(super::STORE_RATE_COUNTERS, &id)
        .ok()
        .flatten()
        .is_none()
    {
        state
            .store
            .save_entity(super::STORE_RATE_COUNTERS, &id, &current)
            .map_err(|e| e.to_string())?;
    }
    let updated = state
        .store
        .update_entity_exclusive(
            super::STORE_RATE_COUNTERS,
            &id,
            |counter: super::limits::RateCounter| {
                super::limits::admit(counter, Utc::now().timestamp(), tokens, rpm, 0)
            },
        )
        .map_err(|e| e.to_string())?;
    let _ = updated;
    Ok(())
}

fn copy_response_headers(from: &HeaderMap, to: &mut HeaderMap) {
    for (name, value) in from {
        if is_hop(name.as_str()) {
            continue;
        }
        if let (Ok(n), Ok(v)) = (
            HeaderName::from_bytes(name.as_str().as_bytes()),
            HeaderValue::from_bytes(value.as_bytes()),
        ) {
            to.insert(n, v);
        }
    }
    to.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, cors_origin_value());
}

fn is_hop(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailers"
            | "transfer-encoding"
            | "upgrade"
            | "content-length"
    )
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

fn dry_run_response(method: &Method, path: &str, model: &str, body_bytes: &[u8]) -> Response {
    if wants_stream(body_bytes) {
        let chunks = dry_run_sse_chunks(model);
        let stream = futures::stream::iter(
            chunks
                .into_iter()
                .map(|c| Ok::<_, std::io::Error>(axum::body::Bytes::from(c))),
        );
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/event-stream")
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(Body::from_stream(stream))
            .unwrap();
    }
    let body = if path.contains("chat/completions")
        || (method == Method::POST && path.contains("completions"))
    {
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
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"),
        ],
        Json(body),
    )
        .into_response()
}

pub fn wants_stream(body: &[u8]) -> bool {
    let text = String::from_utf8_lossy(body);
    text.contains("\"stream\":true") || text.contains("\"stream\": true")
}

/// Two SSE chunks. The gateway yields them as separate stream items.
pub fn dry_run_sse_chunks(model: &str) -> Vec<String> {
    vec![
        format!("data: {{\"model\":\"{model}\",\"choices\":[{{\"delta\":{{\"content\":\"Fabric\"}}}}]}}\n\n"),
        "data: [DONE]\n\n".into(),
    ]
}

/// Touch key usage for unit tests / quota math.
pub fn would_reject_quota(key: &InferenceApiKey) -> bool {
    key.request_quota.is_some_and(|q| key.requests_used >= q)
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
            tokens_per_minute: None,
            max_concurrent: None,
            requests_used: 2,
            tokens_used_window: 0,
            window_started_unix: 0,
            inflight: 0,
            created: Utc::now(),
            last_used: None,
        };
        assert!(would_reject_quota(&key));
        key.requests_used = 1;
        assert!(!would_reject_quota(&key));
    }

    #[test]
    fn deadline_and_shed_gates() {
        assert_eq!(request_deadline_secs(None, 120, 300).unwrap(), 120);
        assert_eq!(request_deadline_secs(Some("30"), 120, 300).unwrap(), 30);
        assert!(request_deadline_secs(Some("0"), 120, 300).is_err());
        assert!(request_deadline_secs(Some("301"), 120, 300).is_err());
        assert!(!shed_queue(&[10, 20], 0));
        assert!(!shed_queue(&[10, 20], 20));
        assert!(shed_queue(&[10, 21], 20));
    }

    #[test]
    fn dry_run_sse_is_two_chunks() {
        let body = br#"{"model":"m","stream": true}"#;
        assert!(wants_stream(body));
        assert!(!wants_stream(br#"{"stream":false}"#));
        let chunks = dry_run_sse_chunks("mistral");
        assert_eq!(chunks.len(), 2);
        assert!(chunks[0].starts_with("data: "));
        assert!(chunks[0].contains("Fabric"));
        assert!(!chunks[0].contains("[DONE]"));
        assert!(chunks[1].contains("[DONE]"));
    }

    #[test]
    fn gateway_serves_openai_paths_and_refuses_a_control_plane_jwt() {
        assert!(inference_path_allowed("/v1/chat/completions"));
        assert!(inference_path_allowed("/v1/rerank"));
        assert!(inference_path_allowed("/v1/batches/job-1"));
        assert!(!inference_path_allowed("/v1/admin"));
        assert!(reject_control_plane_jwt("fvai_abc.def.ghi").is_ok());
        assert!(reject_control_plane_jwt("aaa.bbb.ccc").is_err());
    }
}
