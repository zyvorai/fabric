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
    let context = context_tokens(&body_bytes);
    let cap = tighter_context_limit(
        context_limit(),
        policy_context_cap(state, key.tenant.as_deref()),
    );
    if !context_allowed(context, cap) {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            format!("context of {context} tokens exceeds {cap}"),
        ));
    }
    let (prompt_tokens, generated_tokens) = token_parts(&body_bytes);
    if let Err(msg) = generation_allowed(
        prompt_tokens,
        generated_tokens,
        max_prompt_tokens(),
        max_generated_tokens(),
    ) {
        return Err((StatusCode::PAYLOAD_TOO_LARGE, msg.into()));
    }
    if let Some(daily) = daily_tokens() {
        admit_daily(state, tokens, daily).map_err(|e| (StatusCode::TOO_MANY_REQUESTS, e))?;
    }
    if let Some((rpm, tpm)) = rate_window(global_rpm(), global_tpm()) {
        admit_scope(state, "global", "fabric", tokens, rpm, tpm)
            .map_err(|e| (StatusCode::TOO_MANY_REQUESTS, e))?;
    }
    if let Some((rpm, tpm)) = rate_window(tenant_rpm(), tenant_tpm()) {
        if let Some(tenant) = tenant_rate_name(key.tenant.as_deref())
            .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
        {
            admit_scope(state, "tenant", tenant, tokens, rpm, tpm)
                .map_err(|e| (StatusCode::TOO_MANY_REQUESTS, e))?;
        }
    }
    if let Some((rpm, tpm)) = rate_window(project_rpm(), project_tpm()) {
        if let Some(project) = project_id(
            parts
                .headers
                .get("x-project-id")
                .and_then(|value| value.to_str().ok()),
        )
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
        {
            admit_scope(state, "project", project, tokens, rpm, tpm)
                .map_err(|e| (StatusCode::TOO_MANY_REQUESTS, e))?;
        }
    }
    if let Some((rpm, tpm)) = rate_window(gateway_rpm(), gateway_tpm()) {
        admit_scope(state, "endpoint", endpoint_name, tokens, rpm, tpm)
            .map_err(|e| (StatusCode::TOO_MANY_REQUESTS, e))?;
    }
    if let Some((rpm, tpm)) = rate_window(model_rpm(), model_tpm()) {
        admit_scope(state, "model", &dep.model, tokens, rpm, tpm)
            .map_err(|e| (StatusCode::TOO_MANY_REQUESTS, e))?;
    }
    if let Some((rpm, tpm)) = rate_window(user_rpm(), user_tpm()) {
        if let Some(user) = user_id(
            parts
                .headers
                .get("x-user-id")
                .and_then(|value| value.to_str().ok()),
        )
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
        {
            admit_scope(state, "user", user, tokens, rpm, tpm)
                .map_err(|e| (StatusCode::TOO_MANY_REQUESTS, e))?;
        }
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
    let priority = parse_priority(
        parts
            .headers
            .get("x-request-priority")
            .and_then(|v| v.to_str().ok()),
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
    if shed_queue(&depths, shed_limit_for(shed_limit(), priority)) {
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
    let targets = upstream_targets(ep, dep);
    if targets.is_empty() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "no ready inference backend (set VIP or wait for replicas)".into(),
        ));
    }

    let session = req
        .headers()
        .get("x-session-id")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let incoming_type = req
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/json")
        .to_string();
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
    let body_bytes = axum::body::to_bytes(req.into_body(), body_limit())
        .await
        .map_err(|_| {
            (
                StatusCode::PAYLOAD_TOO_LARGE,
                format!("body exceeds {} bytes", body_limit()),
            )
        })?;
    let streaming = wants_stream(&body_bytes);
    let vip_first = ep.vip.as_deref().is_some_and(|vip| !vip.is_empty());
    let mut targets = targets;
    apply_affinity(
        &mut targets,
        vip_first,
        &affinity_key(session.as_deref(), &body_bytes),
    );
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let primary = targets[0].clone();
    let mut result = post_upstream(
        &client,
        method,
        &format!("http://{primary}{upstream_path}"),
        &incoming_type,
        deadline,
        &body_bytes,
    )
    .await;
    if result.is_err() {
        if let Some(alt) = retry_before_stream(streaming, false, &primary, &targets) {
            result = post_upstream(
                &client,
                method,
                &format!("http://{alt}{upstream_path}"),
                &incoming_type,
                deadline,
                &body_bytes,
            )
            .await;
        }
    }
    let upstream_resp = result.map_err(|e| (StatusCode::BAD_GATEWAY, format!("upstream: {e}")))?;

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

fn global_rpm() -> Option<u64> {
    env_limit("FLUXVM_AI_GLOBAL_RPM")
}

fn tenant_rpm() -> Option<u64> {
    env_limit("FLUXVM_AI_TENANT_RPM")
}

fn gateway_rpm() -> Option<u64> {
    env_limit("FLUXVM_AI_GATEWAY_RPM")
}

fn project_rpm() -> Option<u64> {
    env_limit("FLUXVM_AI_PROJECT_RPM")
}

fn model_rpm() -> Option<u64> {
    env_limit("FLUXVM_AI_MODEL_RPM")
}

fn user_rpm() -> Option<u64> {
    env_limit("FLUXVM_AI_USER_RPM")
}

fn global_tpm() -> Option<u64> {
    env_limit("FLUXVM_AI_GLOBAL_TPM")
}

fn tenant_tpm() -> Option<u64> {
    env_limit("FLUXVM_AI_TENANT_TPM")
}

fn project_tpm() -> Option<u64> {
    env_limit("FLUXVM_AI_PROJECT_TPM")
}

fn gateway_tpm() -> Option<u64> {
    env_limit("FLUXVM_AI_GATEWAY_TPM")
}

fn model_tpm() -> Option<u64> {
    env_limit("FLUXVM_AI_MODEL_TPM")
}

fn user_tpm() -> Option<u64> {
    env_limit("FLUXVM_AI_USER_TPM")
}

/// One stored window when either cap is set. Zero means that cap is off.
pub fn rate_window(rpm: Option<u64>, tpm: Option<u64>) -> Option<(u64, u64)> {
    let rpm = rpm.unwrap_or(0);
    let tpm = tpm.unwrap_or(0);
    if rpm == 0 && tpm == 0 {
        None
    } else {
        Some((rpm, tpm))
    }
}

fn env_limit(name: &str) -> Option<u64> {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .filter(|n| *n > 0)
}

/// A key with no tenant skips the tenant window. A tenant id is a counter name.
pub fn tenant_rate_name(tenant: Option<&str>) -> Result<Option<&str>, &'static str> {
    let Some(raw) = tenant.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    if raw.len() > 128 || raw.contains('/') || raw.contains("..") {
        return Err("tenant id cannot be used as a rate-limit scope");
    }
    Ok(Some(raw))
}

/// `x-user-id` is optional. When present it must be a short stable identifier.
pub fn user_id(header: Option<&str>) -> Result<Option<&str>, &'static str> {
    labeled_id(
        header,
        "x-user-id must be 1 to 128 letters, digits, or . _ @ -",
    )
}

/// `x-project-id` uses the same shape as `x-user-id`.
pub fn project_id(header: Option<&str>) -> Result<Option<&str>, &'static str> {
    labeled_id(
        header,
        "x-project-id must be 1 to 128 letters, digits, or . _ @ -",
    )
}

fn labeled_id<'a>(
    header: Option<&'a str>,
    bad: &'static str,
) -> Result<Option<&'a str>, &'static str> {
    let Some(raw) = header.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let ok = raw.len() <= 128
        && !raw.contains("..")
        && raw
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '@'));
    if ok {
        Ok(Some(raw))
    } else {
        Err(bad)
    }
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequestPriority {
    Low,
    Normal,
    High,
}

pub fn parse_priority(header: Option<&str>) -> Result<RequestPriority, &'static str> {
    match header.map(str::trim).filter(|value| !value.is_empty()) {
        None => Ok(RequestPriority::Normal),
        Some(value) if value.eq_ignore_ascii_case("low") => Ok(RequestPriority::Low),
        Some(value) if value.eq_ignore_ascii_case("normal") => Ok(RequestPriority::Normal),
        Some(value) if value.eq_ignore_ascii_case("high") => Ok(RequestPriority::High),
        Some(_) => Err("x-request-priority must be low, normal, or high"),
    }
}

/// Low sheds at half the base queue, high at double. A base of 0 disables shedding.
pub fn shed_limit_for(base: u32, priority: RequestPriority) -> u32 {
    if base == 0 {
        return 0;
    }
    match priority {
        RequestPriority::Low => (base / 2).max(1),
        RequestPriority::Normal => base,
        RequestPriority::High => base.saturating_mul(2),
    }
}

fn shed_limit() -> u32 {
    std::env::var("FLUXVM_AI_SHED_QUEUE")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0)
}

/// Prompt characters divided by 4, plus `max_tokens`. The prompt text is not kept.
pub fn context_tokens(body: &[u8]) -> u32 {
    let (prompt, generated) = token_parts(body);
    u32::saturating_add(prompt, generated)
}

pub fn token_parts(body: &[u8]) -> (u32, u32) {
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(body) else {
        return (0, 0);
    };
    let generated = value
        .get("max_tokens")
        .and_then(|v| v.as_u64())
        .unwrap_or(0)
        .min(u64::from(u32::MAX)) as u32;
    let prompt = ((prompt_chars(&value) as u64) / 4).min(u64::from(u32::MAX)) as u32;
    (prompt, generated)
}

pub fn generation_allowed(
    prompt: u32,
    generated: u32,
    max_prompt: u32,
    max_generated: u32,
) -> Result<(), &'static str> {
    if max_prompt > 0 && prompt > max_prompt {
        return Err("prompt exceeds the maximum prompt tokens");
    }
    if max_generated > 0 && generated > max_generated {
        return Err("max_tokens exceeds the maximum generated tokens");
    }
    Ok(())
}

fn max_prompt_tokens() -> u32 {
    env_u32("FLUXVM_AI_MAX_PROMPT_TOKENS")
}

fn max_generated_tokens() -> u32 {
    env_u32("FLUXVM_AI_MAX_GENERATED_TOKENS")
}

fn daily_tokens() -> Option<u64> {
    env_limit("FLUXVM_AI_DAILY_TOKENS")
}

fn env_u32(name: &str) -> u32 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0)
}

fn prompt_chars(value: &serde_json::Value) -> usize {
    let mut count = 0usize;
    for key in ["prompt", "input"] {
        if let Some(text) = value.get(key).and_then(|v| v.as_str()) {
            count = count.saturating_add(text.chars().count());
        }
    }
    if let Some(messages) = value.get("messages").and_then(|v| v.as_array()) {
        for message in messages {
            if let Some(content) = message.get("content") {
                count = count.saturating_add(content_chars(content));
            }
        }
    }
    count
}

fn content_chars(value: &serde_json::Value) -> usize {
    match value {
        serde_json::Value::String(text) => text.chars().count(),
        serde_json::Value::Array(parts) => parts
            .iter()
            .filter_map(|part| part.get("text").and_then(|text| text.as_str()))
            .map(|text| text.chars().count())
            .fold(0usize, usize::saturating_add),
        _ => 0,
    }
}

pub fn context_allowed(tokens: u32, limit: u32) -> bool {
    limit == 0 || tokens <= limit
}

/// The smaller positive cap. Zero means that side sets no cap.
pub fn tighter_context_limit(gateway: u32, policy: u32) -> u32 {
    match (gateway, policy) {
        (0, 0) => 0,
        (0, policy) => policy,
        (gateway, 0) => gateway,
        (gateway, policy) => gateway.min(policy),
    }
}

fn context_limit() -> u32 {
    std::env::var("FLUXVM_AI_MAX_CONTEXT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(32_768)
}

fn policy_context_cap(state: &AppState, tenant: Option<&str>) -> u32 {
    let Some(tenant) = tenant.filter(|tenant| !tenant.is_empty()) else {
        return 0;
    };
    state
        .store
        .get_entity::<super::policy::TenantAiPolicy>(super::STORE_POLICIES, tenant)
        .ok()
        .flatten()
        .map(|policy| policy.max_context_tokens)
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

fn admit_scope(
    state: &AppState,
    scope: &str,
    name: &str,
    tokens: u64,
    rpm: u64,
    tpm: u64,
) -> Result<(), String> {
    let id = super::limits::counter_id(scope, name);
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
            day_started_unix: 0,
            day_tokens: 0,
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
                super::limits::admit(counter, Utc::now().timestamp(), tokens, rpm, tpm)
            },
        )
        .map_err(|e| e.to_string())?;
    let _ = updated;
    Ok(())
}

fn admit_daily(state: &AppState, tokens: u64, daily: u64) -> Result<(), String> {
    let id = super::limits::counter_id("global", "day");
    let current = super::limits::RateCounter {
        id: id.clone(),
        window_started_unix: 0,
        requests: 0,
        tokens: 0,
        day_started_unix: 0,
        day_tokens: 0,
    };
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
    state
        .store
        .update_entity_exclusive(
            super::STORE_RATE_COUNTERS,
            &id,
            |counter: super::limits::RateCounter| {
                super::limits::admit_day(counter, Utc::now().timestamp(), tokens, daily)
            },
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
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

fn upstream_targets(ep: &InferenceEndpoint, dep: &InferenceDeployment) -> Vec<String> {
    let mut targets = Vec::new();
    if let Some(vip) = ep.vip.as_deref().filter(|vip| !vip.is_empty()) {
        targets.push(format!("{vip}:{}", ep.port));
    }
    for rep in &dep.status.replicas {
        if !rep.ready || rep.draining {
            continue;
        }
        if let Some(addr) = rep.address.as_deref().filter(|addr| !addr.is_empty()) {
            let target = format!("{addr}:{}", ep.port);
            if !targets.iter().any(|existing| existing == &target) {
                targets.push(target);
            }
        }
    }
    targets
}

/// One other backend, and only when no response has started.
/// Streaming requests are not retried.
pub fn retry_before_stream<'a>(
    streaming: bool,
    response_started: bool,
    tried: &str,
    candidates: &'a [String],
) -> Option<&'a str> {
    if streaming || response_started || tried.is_empty() {
        return None;
    }
    candidates
        .iter()
        .find(|candidate| candidate.as_str() != tried)
        .map(String::as_str)
}

pub fn affinity_index(key: &str, len: usize) -> Option<usize> {
    if key.is_empty() || len == 0 {
        return None;
    }
    let mut hash = 2166136261u32;
    for byte in key.as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(16777619);
    }
    Some(hash as usize % len)
}

/// The same key sticks to the same replica even if the slice is rotated.
pub fn sticky_target(replicas: &[String], key: &str) -> Option<String> {
    if replicas.is_empty() {
        return None;
    }
    let mut ordered = replicas.to_vec();
    ordered.sort();
    let index = affinity_index(key, ordered.len())?;
    Some(ordered[index].clone())
}

/// Session id wins. Otherwise the first 64 characters of the prompt are the prefix.
/// The key is used only to order backends and is not written to the audit log.
pub fn affinity_key(session: Option<&str>, body: &[u8]) -> String {
    if let Some(session) = session.map(str::trim).filter(|value| !value.is_empty()) {
        return session.to_string();
    }
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(body) else {
        return String::new();
    };
    let mut text = String::new();
    if let Some(prompt) = value.get("prompt").and_then(|item| item.as_str()) {
        text.push_str(prompt);
    } else if let Some(messages) = value.get("messages").and_then(|item| item.as_array()) {
        for message in messages {
            if let Some(content) = message.get("content").and_then(|item| item.as_str()) {
                text.push_str(content);
                break;
            }
        }
    }
    text.chars().take(64).collect()
}

/// Keep a VIP in front. Move the sticky replica to the first replica slot.
pub fn apply_affinity(targets: &mut Vec<String>, vip_first: bool, key: &str) {
    let start = usize::from(vip_first && !targets.is_empty());
    if start >= targets.len() {
        return;
    }
    let Some(chosen) = sticky_target(&targets[start..], key) else {
        return;
    };
    if targets.get(start).is_some_and(|target| target == &chosen) {
        return;
    }
    let Some(pos) = targets.iter().position(|target| target == &chosen) else {
        return;
    };
    let chosen = targets.remove(pos);
    targets.insert(start, chosen);
}

async fn post_upstream(
    client: &reqwest::Client,
    method: &Method,
    url: &str,
    content_type: &str,
    deadline: Duration,
    body: &[u8],
) -> Result<reqwest::Response, String> {
    client
        .request(
            reqwest::Method::from_bytes(method.as_str().as_bytes())
                .unwrap_or(reqwest::Method::POST),
            url,
        )
        .header(header::CONTENT_TYPE, content_type)
        .timeout(deadline)
        .body(body.to_vec())
        .send()
        .await
        .map_err(|e| e.to_string())
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
        assert_eq!(shed_limit_for(20, parse_priority(Some("low")).unwrap()), 10);
        assert_eq!(shed_limit_for(20, parse_priority(None).unwrap()), 20);
        assert_eq!(
            shed_limit_for(20, parse_priority(Some("HIGH")).unwrap()),
            40
        );
        assert_eq!(shed_limit_for(0, RequestPriority::Low), 0);
        assert!(parse_priority(Some("urgent")).is_err());
        assert_eq!(user_id(None).unwrap(), None);
        assert_eq!(user_id(Some("ada@lab")).unwrap(), Some("ada@lab"));
        assert!(user_id(Some("../root")).is_err());
        assert_eq!(tenant_rate_name(None).unwrap(), None);
        assert_eq!(tenant_rate_name(Some("acme")).unwrap(), Some("acme"));
        assert!(tenant_rate_name(Some("../acme")).is_err());
        assert_eq!(project_id(Some("lab-1")).unwrap(), Some("lab-1"));
        assert!(project_id(Some("a/b")).is_err());
    }

    #[test]
    fn session_affinity_keeps_the_vip_and_sticks_the_same_prefix() {
        let key = affinity_key(None, br#"{"prompt":"abcdefghijklmnopqrstuvwxyz"}"#);
        assert_eq!(key, "abcdefghijklmnopqrstuvwxyz");
        assert_eq!(
            affinity_key(Some("sess-1"), br#"{"prompt":"other"}"#),
            "sess-1"
        );
        assert_eq!(affinity_index("sess-1", 3), affinity_index("sess-1", 3));
        let replicas = vec![
            "10.0.0.2:8000".to_string(),
            "10.0.0.3:8000".to_string(),
            "10.0.0.4:8000".to_string(),
        ];
        let chosen = sticky_target(&replicas, "sess-1").unwrap();
        let mut targets = vec!["10.96.0.1:8000".to_string()];
        targets.extend(replicas);
        apply_affinity(&mut targets, true, "sess-1");
        assert_eq!(targets[0], "10.96.0.1:8000");
        assert_eq!(targets[1], chosen);
        apply_affinity(&mut targets, true, "sess-1");
        assert_eq!(targets[1], chosen);
    }

    #[test]
    fn retry_skips_streaming_and_a_started_response() {
        let targets = vec![String::from("10.0.0.1:8000"), String::from("10.0.0.2:8000")];
        assert_eq!(
            retry_before_stream(false, false, &targets[0], &targets),
            Some("10.0.0.2:8000")
        );
        assert_eq!(
            retry_before_stream(true, false, &targets[0], &targets),
            None
        );
        assert_eq!(
            retry_before_stream(false, true, &targets[0], &targets),
            None
        );
        assert_eq!(retry_before_stream(false, false, "", &targets), None);
    }

    #[test]
    fn context_counts_prompt_and_max_tokens() {
        let body = br#"{"messages":[{"role":"user","content":"hello world!!"}],"max_tokens":8}"#;
        assert_eq!(context_tokens(body), 11);
        assert!(context_allowed(11, 32));
        assert!(!context_allowed(33, 32));
        assert!(context_allowed(100, 0));
        assert_eq!(tighter_context_limit(32_768, 1024), 1024);
        assert_eq!(tighter_context_limit(0, 0), 0);
        assert_eq!(token_parts(body), (3, 8));
        assert!(generation_allowed(3, 8, 0, 0).is_ok());
        assert!(generation_allowed(3, 8, 2, 0).is_err());
        assert!(generation_allowed(3, 8, 0, 7).is_err());
        assert_eq!(rate_window(None, None), None);
        assert_eq!(rate_window(Some(10), None), Some((10, 0)));
        assert_eq!(rate_window(None, Some(40)), Some((0, 40)));
        assert_eq!(rate_window(Some(10), Some(40)), Some((10, 40)));
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
