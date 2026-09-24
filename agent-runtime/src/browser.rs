// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Read-only view of the agent's browser, so a person can see what it is on.
//!
//! An agent with `browser_port` set runs Chromium with remote debugging on that
//! port inside the guest. This forwards the DevTools HTTP listing endpoints
//! (`/json/version`, `/json/list`) to an operator, through FluxVM's sandbox
//! proxy. Nothing that changes the browser is forwarded, and the WebSocket URLs
//! that would let a caller drive it are removed: **watching a live screencast or
//! taking over is not implemented**, that needs a WebSocket bridge to the guest.

use crate::{
    app::{ApiError, ApiResult},
    model::SessionStatus,
    AppState,
};
use axum::{
    extract::{Path, State},
    Json,
};
use reqwest::Method;
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;

/// The only DevTools paths forwarded: listings, no mutation.
const ALLOWED: [&str; 4] = ["json", "json/list", "json/version", "json/protocol"];

/// Fields that would hand out guest-internal addresses or a way to drive the page.
const STRIPPED: [&str; 2] = ["webSocketDebuggerUrl", "devtoolsFrontendUrl"];

pub fn allowed_path(path: &str) -> bool {
    ALLOWED.contains(&path.trim_matches('/'))
}

/// Remove control URLs from a DevTools response, recursively.
pub fn sanitize(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for key in STRIPPED {
                map.remove(key);
            }
            map.values_mut().for_each(sanitize);
        }
        Value::Array(items) => items.iter_mut().for_each(sanitize),
        _ => {}
    }
}

pub(crate) async fn devtools(
    State(state): State<Arc<AppState>>,
    Path((id, path)): Path<(Uuid, String)>,
) -> ApiResult<Json<Value>> {
    if !allowed_path(&path) {
        return Err(ApiError::not_found(
            "only DevTools listing endpoints are available",
        ));
    }
    let session = state
        .store
        .get_session(id)
        .await
        .ok_or_else(|| ApiError::not_found("session not found"))?;
    if session.status != SessionStatus::Running {
        return Err(ApiError::conflict("session is not running"));
    }
    let agent = state
        .store
        .get_agent_version(&session.agent, &session.agent_version)
        .await
        .map_err(|_| ApiError::not_found("agent deployment not found"))?;
    let port = agent
        .manifest
        .browser_port
        .ok_or_else(|| ApiError::not_found("agent has no browser_port"))?;
    let mut value = state
        .fluxvm
        .guest_request(session.sandbox_id, port, Method::GET, &path, None)
        .await
        .map_err(ApiError::bad_gateway)?;
    sanitize(&mut value);
    Ok(Json(value))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        egress::ask_tests::{manifest, state_and_session_cfg},
        model::{DeployAgentRequest, EgressMode},
    };
    use axum::{http::StatusCode, routing::get, Router};
    use base64::Engine;
    use serde_json::json;

    #[test]
    fn only_listing_paths_are_allowed() {
        for ok in ["json", "json/list", "/json/version", "json/protocol/"] {
            assert!(allowed_path(ok), "{ok}");
        }
        for bad in [
            "json/new",
            "json/close/ABC",
            "json/activate/1",
            "devtools/inspector.html",
            "",
            "json/../x",
        ] {
            assert!(!allowed_path(bad), "{bad}");
        }
    }

    #[test]
    fn control_urls_are_removed_everywhere() {
        let mut value = json!([
            {"id": "1", "title": "Inbox", "url": "https://mail.example/", "webSocketDebuggerUrl": "ws://10.0.2.15:9222/devtools/page/1", "devtoolsFrontendUrl": "/devtools/inspector.html?ws=x"},
            {"Browser": "Chrome/1", "webSocketDebuggerUrl": "ws://x"}
        ]);
        sanitize(&mut value);
        let text = value.to_string();
        assert!(
            !text.contains("ws://") && !text.contains("devtools"),
            "{text}"
        );
        assert_eq!(value[0]["title"], "Inbox");
        assert_eq!(value[1]["Browser"], "Chrome/1");
    }

    async fn setup(browser_port: Option<u16>) -> (Arc<AppState>, Uuid) {
        let app = Router::new().route(
            "/v1/sandboxes/{id}/http/{port}/{*path}",
            get(
                |axum::extract::Path((_, port, path)): axum::extract::Path<(
                    String,
                    u16,
                    String,
                )>| async move {
                    assert_eq!(port, 9222);
                    assert!(path == "json/list" || path == "json/version");
                    axum::Json(json!([{"title": "Inbox", "url": "https://mail.example/",
                    "webSocketDebuggerUrl": "ws://10.0.2.15:9222/devtools/page/1"}]))
                },
            ),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let (state, session) = state_and_session_cfg(|c| {
            c.fluxvm_url = url;
            c.api_token = Some("operator".into());
        })
        .await;
        let mut m = manifest(EgressMode::Deny, None);
        m.browser_port = browser_port;
        let deployed = state
            .store
            .deploy_agent(DeployAgentRequest {
                name: session.agent.clone(),
                bundle_base64: base64::engine::general_purpose::STANDARD.encode("export default 1"),
                manifest: m,
            })
            .await
            .unwrap();
        state
            .store
            .update_session(session.id, |s| s.agent_version = deployed.version.clone())
            .await
            .unwrap();
        (state, session.id)
    }

    async fn get_status(state: &Arc<AppState>, uri: &str, bearer: &str) -> (StatusCode, String) {
        use tower::ServiceExt;
        let request = axum::http::Request::builder()
            .uri(uri)
            .header("authorization", format!("Bearer {bearer}"))
            .body(axum::body::Body::empty())
            .unwrap();
        let response = crate::app::public_router(state.clone())
            .oneshot(request)
            .await
            .unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        (status, String::from_utf8_lossy(&bytes).into_owned())
    }

    #[tokio::test]
    async fn an_operator_sees_the_tabs_but_not_the_control_urls() {
        let (state, id) = setup(Some(9222)).await;
        let (status, body) = get_status(
            &state,
            &format!("/v1/sessions/{id}/browser/json/list"),
            "operator",
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert!(body.contains("Inbox") && body.contains("mail.example"));
        assert!(
            !body.contains("ws://") && !body.contains("webSocketDebuggerUrl"),
            "{body}"
        );
    }

    #[tokio::test]
    async fn mutating_paths_the_agents_credential_and_other_agents_are_refused() {
        let (state, id) = setup(Some(9222)).await;
        for path in ["json/new", "json/close/1", "devtools/page/1"] {
            let (status, _) = get_status(
                &state,
                &format!("/v1/sessions/{id}/browser/{path}"),
                "operator",
            )
            .await;
            assert_eq!(status, StatusCode::NOT_FOUND, "{path}");
        }
        let (status, _) = get_status(
            &state,
            &format!("/v1/sessions/{id}/browser/json/list"),
            "cap",
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        let (no_browser, id) = setup(None).await;
        let (status, body) = get_status(
            &no_browser,
            &format!("/v1/sessions/{id}/browser/json/list"),
            "operator",
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert!(body.contains("browser_port"));
    }
}
