// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Read-only view of the agent's browser, so a person can see what it is on.
//!
//! An agent with `browser_port` set runs Chromium with remote debugging on that
//! port inside the guest. This forwards the DevTools HTTP listing endpoints
//! (`/json/version`, `/json/list`) to an operator, through FluxVM's sandbox
//! proxy. Nothing that changes the browser is forwarded, and the WebSocket URLs
//! that would let a caller drive it are removed.
//!
//! **Live view (Keep 0.1):** `GET /v1/sessions/{id}/browser/view` returns a
//! sanitized tab summary for the operator UI / `/keep/browser`. Screencast and
//! input takeover are **not** implemented (need a WebSocket bridge).

use crate::{
    app::{ApiError, ApiResult},
    model::SessionStatus,
    AppState,
};
use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    Json,
};
use reqwest::Method;
use serde_json::{json, Value};
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

async fn browser_port(state: &AppState, session_id: Uuid) -> ApiResult<(Uuid, u16)> {
    let session = state
        .store
        .get_session(session_id)
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
    Ok((session.sandbox_id, port))
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
    let (sandbox_id, port) = browser_port(&state, id).await?;
    let mut value = state
        .fluxvm
        .guest_request(sandbox_id, port, Method::GET, &path, None)
        .await
        .map_err(ApiError::bad_gateway)?;
    sanitize(&mut value);
    Ok(Json(value))
}

/// Operator live view: sanitized open tabs (title + URL). No CDP WebSocket.
pub(crate) async fn browser_view(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let (sandbox_id, port) = browser_port(&state, id).await?;
    let mut list = state
        .fluxvm
        .guest_request(sandbox_id, port, Method::GET, "json/list", None)
        .await
        .map_err(ApiError::bad_gateway)?;
    sanitize(&mut list);
    let tabs: Vec<Value> = list
        .as_array()
        .into_iter()
        .flatten()
        .map(|tab| {
            let title = tab.get("title").and_then(|v| v.as_str()).unwrap_or("");
            let url = tab.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let id = tab.get("id").and_then(|v| v.as_str()).unwrap_or("");
            json!({
                "id": id,
                "title": title,
                "url": url,
                "type": tab.get("type").and_then(|v| v.as_str()).unwrap_or("page"),
            })
        })
        .collect();
    Ok(Json(json!({
        "session_id": id,
        "tabs": tabs,
        "mode": "listing",
        "honesty": "Live tab listing only (software-test). Screencast and input takeover are not implemented; host can still see the guest.",
        "note": "Live tab listing only. Screencast and takeover are not implemented in Keep 0.1.",
    })))
}

#[derive(Debug, serde::Deserialize)]
pub struct BrowserPageQuery {
    #[serde(default)]
    pub session: Option<String>,
}

/// Minimal HTML that polls `/v1/sessions/{id}/browser/view` for operators.
pub async fn browser_page(Query(q): Query<BrowserPageQuery>) -> impl IntoResponse {
    let session = q.session.unwrap_or_default();
    let session_esc = session
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;");
    let html = format!(
        r#"<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Keep browser view</title>
<style>
body{{font-family:ui-sans-serif,system-ui,sans-serif;margin:0;background:#0f1419;color:#e7ecf3}}
header{{padding:1rem 1.25rem;border-bottom:1px solid #243044}}
main{{padding:1rem;max-width:900px;margin:0 auto}}
.card{{background:#162032;border:1px solid #243044;border-radius:12px;padding:1rem;margin-bottom:1rem}}
a{{color:#8ec7ff}} input,button{{font:inherit;padding:.5rem .75rem;border-radius:8px;border:1px solid #345}}
button{{background:#2b6cff;color:#fff;border:0;cursor:pointer}}
.tab{{padding:.75rem 0;border-bottom:1px solid #243044}}
.muted{{opacity:.7;font-size:13px}}
</style></head><body>
<header><strong>Keep browser</strong> · read-only tab listing
<div class="muted">No screencast / takeover in Keep 0.1 — CDP WebSocket stays inside the guest.</div>
</header>
<main>
<div class="card">
<label>API <input id="base" placeholder="http://127.0.0.1:9096" style="width:55%"/></label>
<label>Token <input id="token" type="password" style="width:35%"/></label>
<label>Session <input id="sid" value="{session_esc}" style="width:50%"/></label>
<button id="go">Refresh</button>
</div>
<div id="out" class="card muted">Load a running session with browser_port set.</div>
</main>
<script>
const $=id=>document.getElementById(id);
async function refresh(){{
  const base=$('base').value.replace(/\/$/,'')||location.origin;
  const sid=$('sid').value.trim();
  const tok=$('token').value.trim();
  if(!sid){{$('out').textContent='session id required';return;}}
  const r=await fetch(base+'/v1/sessions/'+sid+'/browser/view',{{headers: tok?{{Authorization:'Bearer '+tok}}:{{}}}});
  const j=await r.json();
  if(!r.ok){{$('out').textContent=JSON.stringify(j);return;}}
  const tabs=j.tabs||[];
  $('out').innerHTML=tabs.length?tabs.map(t=>`<div class="tab"><strong>${{t.title||'(untitled)'}}</strong><div class="muted">${{t.url||''}}</div></div>`).join('')
    :`<div class="muted">No open tabs. ${{j.note||''}}</div>`;
}}
$('go').onclick=refresh;
const u=new URL(location.href);
if(u.searchParams.get('token')) $('token').value=u.searchParams.get('token');
if(u.searchParams.get('base')) $('base').value=u.searchParams.get('base');
if($('sid').value) refresh();
setInterval(()=>{{ if($('sid').value) refresh(); }}, 4000);
</script></body></html>"#
    );
    (
        [(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")],
        html,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_listing_paths_are_allowed() {
        for ok in ["json", "json/list", "/json/version", "json/protocol/"] {
            assert!(allowed_path(ok), "{ok}");
        }
        for bad in ["json/new", "json/activate/1", "json/close/1", ""] {
            assert!(!allowed_path(bad), "{bad}");
        }
    }

    #[test]
    fn sanitize_strips_control_urls() {
        let mut v = json!({
            "title": "x",
            "webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/page/1",
            "devtoolsFrontendUrl": "/devtools/inspector.html",
            "nested": { "webSocketDebuggerUrl": "ws://evil" }
        });
        sanitize(&mut v);
        assert!(v.get("webSocketDebuggerUrl").is_none());
        assert!(v.get("devtoolsFrontendUrl").is_none());
        assert!(v["nested"].get("webSocketDebuggerUrl").is_none());
        assert_eq!(v["title"], "x");
    }
}
