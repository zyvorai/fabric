// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Thin reverse-proxy from Fabric JWT-auth'd `/api/agents|sessions/*`
//! onto the sibling `zyvor-fabric-agent-runtime` service (`:9096`).

use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{header, HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use security::{RequireAdmin, RequireRead};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;

use crate::server::AppState;

fn not_configured() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({
            "error": "agent_runtime.base_url is not configured — start zyvor-fabric-agent-runtime and set [agent_runtime] in zyvor-fabricd.toml"
        })),
    )
        .into_response()
}

#[allow(clippy::result_large_err)] // axum Response is intentionally large as Err
fn upstream(state: &AppState) -> Result<(String, Option<String>), Response> {
    let base = agent_runtime_base_url(&state.config.agent_runtime).ok_or_else(not_configured)?;
    let token = std::env::var("ZYVOR_FABRICD_AGENT_RUNTIME_TOKEN")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| state.config.agent_runtime.token.clone());
    Ok((base, token))
}

/// Resolve configured agent-runtime base URL (trimmed, no trailing slash).
pub(crate) fn agent_runtime_base_url(cfg: &crate::config::AgentRuntimeConfig) -> Option<String> {
    cfg.base_url
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.trim_end_matches('/').to_string())
}

async fn proxy(
    state: &AppState,
    method: Method,
    path: &str,
    query: Option<&HashMap<String, String>>,
    body: Option<serde_json::Value>,
    accept: Option<&str>,
) -> Response {
    let (base, token) = match upstream(state) {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    let mut url = format!("{base}{path}");
    if let Some(q) = query {
        if !q.is_empty() {
            let qs: Vec<String> = q
                .iter()
                .map(|(k, v)| format!("{}={}", urlencoding_encode(k), urlencoding_encode(v)))
                .collect();
            url.push('?');
            url.push_str(&qs.join("&"));
        }
    }

    let mut req = state.http_client.request(method, &url);
    if let Some(tok) = token {
        req = req.header(header::AUTHORIZATION, format!("Bearer {tok}"));
    }
    if let Some(a) = accept {
        req = req.header(header::ACCEPT, a);
    }
    if let Some(b) = body {
        req = req.json(&b);
    }

    match req.send().await {
        Ok(resp) => {
            let status =
                StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
            let mut headers = HeaderMap::new();
            if let Some(ct) = resp.headers().get(header::CONTENT_TYPE) {
                headers.insert(header::CONTENT_TYPE, ct.clone());
            }
            match resp.bytes().await {
                Ok(bytes) => {
                    let mut out = Response::new(Body::from(bytes));
                    *out.status_mut() = status;
                    *out.headers_mut() = headers;
                    out
                }
                Err(e) => (
                    StatusCode::BAD_GATEWAY,
                    Json(json!({ "error": format!("agent-runtime body: {e}") })),
                )
                    .into_response(),
            }
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": format!("agent-runtime unreachable: {e}") })),
        )
            .into_response(),
    }
}

fn urlencoding_encode(s: &str) -> String {
    // Minimal encode for query values (enough for after=<seq>).
    s.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            _ => format!("%{:02X}", c as u8),
        })
        .collect()
}

pub async fn list_agents(
    RequireRead(_): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Response {
    proxy(&state, Method::GET, "/v1/agents", None, None, None).await
}

pub async fn deploy_agent(
    RequireAdmin(_): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    proxy(&state, Method::POST, "/v1/agents", None, Some(body), None).await
}

pub async fn get_agent(
    RequireRead(_): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Response {
    proxy(
        &state,
        Method::GET,
        &format!("/v1/agents/{name}"),
        None,
        None,
        None,
    )
    .await
}

pub async fn list_sessions(
    RequireRead(_): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Response {
    proxy(&state, Method::GET, "/v1/sessions", None, None, None).await
}

pub async fn create_session(
    RequireAdmin(_): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    proxy(&state, Method::POST, "/v1/sessions", None, Some(body), None).await
}

pub async fn get_session(
    RequireRead(_): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Response {
    proxy(
        &state,
        Method::GET,
        &format!("/v1/sessions/{id}"),
        None,
        None,
        None,
    )
    .await
}

pub async fn delete_session(
    RequireAdmin(_): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Response {
    proxy(
        &state,
        Method::DELETE,
        &format!("/v1/sessions/{id}"),
        None,
        None,
        None,
    )
    .await
}

pub async fn session_action(
    RequireAdmin(_): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path((id, action)): Path<(String, String)>,
    body: Result<Json<serde_json::Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let allowed = matches!(action.as_str(), "steer" | "cancel" | "hibernate" | "resume");
    if !allowed {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "unknown session action" })),
        )
            .into_response();
    }
    let payload = body.ok().map(|Json(v)| v);
    proxy(
        &state,
        Method::POST,
        &format!("/v1/sessions/{id}/{action}"),
        None,
        payload,
        None,
    )
    .await
}

pub async fn session_events(
    RequireRead(_): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    proxy(
        &state,
        Method::GET,
        &format!("/v1/sessions/{id}/events"),
        Some(&query),
        None,
        Some("text/event-stream"),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::AgentRuntimeConfig;

    #[test]
    fn agent_runtime_base_url_none_when_unset() {
        assert!(agent_runtime_base_url(&AgentRuntimeConfig::default()).is_none());
    }

    #[test]
    fn agent_runtime_base_url_trims_slash_and_whitespace() {
        let cfg = AgentRuntimeConfig {
            base_url: Some("  http://127.0.0.1:9096/  ".into()),
            token: None,
        };
        assert_eq!(
            agent_runtime_base_url(&cfg).as_deref(),
            Some("http://127.0.0.1:9096")
        );
    }

    #[test]
    fn urlencoding_encode_leaves_safe_chars() {
        assert_eq!(urlencoding_encode("after"), "after");
        assert_eq!(urlencoding_encode("a b"), "a%20b");
    }
}
