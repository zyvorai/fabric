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
        return Ok(Response::builder()
            .status(StatusCode::NO_CONTENT)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header(
                header::ACCESS_CONTROL_ALLOW_HEADERS,
                "authorization, content-type",
            )
            .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, OPTIONS")
            .body(Body::empty())
            .unwrap());
    }

    let secret = extract_bearer(req.headers()).ok_or((
        StatusCode::UNAUTHORIZED,
        "missing or invalid Authorization: Bearer <api-key>".into(),
    ))?;

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

    key = keys::consume_request(state, &key.id).await.map_err(|e| {
        let status = if e.contains("quota") {
            StatusCode::TOO_MANY_REQUESTS
        } else {
            StatusCode::INTERNAL_SERVER_ERROR
        };
        (status, e)
    })?;

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
        let body_bytes = axum::body::to_bytes(req.into_body(), 1024 * 1024)
            .await
            .unwrap_or_default();
        audit(
            state,
            &format!("apikey:{}", key.prefix),
            "INFER",
            &resource,
            "SUCCESS",
        );
        return Ok(dry_run_response(
            &method,
            &upstream_path,
            &dep.model,
            &body_bytes,
        ));
    }

    let proxied = proxy_upstream(&method, &ep, &dep, &upstream_path, req).await;
    let outcome = match &proxied {
        Ok(resp) if resp.status().is_success() => "SUCCESS",
        _ => "FAILED",
    };
    audit(
        state,
        &format!("apikey:{}", key.prefix),
        "INFER",
        &resource,
        outcome,
    );
    proxied
}

async fn proxy_upstream(
    method: &Method,
    ep: &InferenceEndpoint,
    dep: &InferenceDeployment,
    upstream_path: &str,
    req: Request,
) -> Result<Response, (StatusCode, String)> {
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
    to.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
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
            requests_used: 2,
            created: Utc::now(),
            last_used: None,
        };
        assert!(would_reject_quota(&key));
        key.requests_used = 1;
        assert!(!would_reject_quota(&key));
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
}
