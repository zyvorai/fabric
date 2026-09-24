// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Read-only view of the agent's browser, so a person can see what it is on.
//!
//! An agent with `browser_port` set runs Chromium with remote debugging on that
//! port inside the guest. This forwards the DevTools HTTP listing endpoints
//! (`/json/version`, `/json/list`) to an operator, through FluxVM's sandbox
//! proxy. Nothing that changes the browser is forwarded, and the WebSocket URLs
//! that would let a caller drive it are removed from listing responses.
//!
//! **Screenshot (Keep 0.2 scaffolding):** `GET /v1/sessions/{id}/browser/screenshot`
//! opens a short-lived CDP session via FluxVM's sandbox WS bridge, captures one
//! JPEG, and returns it. Input / takeover are still not exposed.

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
use futures::{SinkExt, StreamExt};
use reqwest::Method;
use serde_json::{json, Value};
use std::sync::Arc;
use tokio_tungstenite::tungstenite::Message as WsMessage;
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

/// Path portion of a Chromium `webSocketDebuggerUrl` (`/devtools/page/…`).
pub fn debugger_path_from_ws_url(url: &str) -> Option<String> {
    let rest = url
        .strip_prefix("ws://")
        .or_else(|| url.strip_prefix("wss://"))?;
    let path = rest.split_once('/')?.1;
    if path.is_empty() {
        return None;
    }
    Some(path.to_string())
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
    if let Some(msg) = crate::attestation::host_channel_forbidden(session.confidential.as_ref()) {
        return Err(ApiError::forbidden(msg));
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

/// Operator live view: sanitized open tabs (title + URL). No raw CDP WebSocket.
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
        "screenshot": format!("/v1/sessions/{id}/browser/screenshot"),
        "screencast": format!("/v1/sessions/{id}/browser/screencast"),
        "honesty": "Tab listing + screenshot/screencast via host CDP bridge (software-test). Input takeover is not implemented; host can still see the guest.",
        "note": "Live tab listing. Poll /browser/screenshot or open /browser/screencast WS for frames. Input takeover is not implemented.",
    })))
}

/// One JPEG via short-lived CDP over FluxVM's sandbox WS bridge (no operator CDP).
pub(crate) async fn browser_screenshot(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let (sandbox_id, port) = browser_port(&state, id).await?;
    let list = state
        .fluxvm
        .guest_request(sandbox_id, port, Method::GET, "json/list", None)
        .await
        .map_err(ApiError::bad_gateway)?;
    let page = list
        .as_array()
        .into_iter()
        .flatten()
        .find(|t| t.get("type").and_then(|v| v.as_str()) == Some("page"))
        .ok_or_else(|| ApiError::not_found("no open page target for screenshot"))?;
    let path = first_page_debugger(&state, sandbox_id, port).await?;
    let title = page
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let page_url = page
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let jpeg = cdp_capture_jpeg(&state, sandbox_id, port, &path)
        .await
        .map_err(ApiError::bad_gateway)?;
    Ok(Json(json!({
        "session_id": id,
        "mime": "image/jpeg",
        "image_base64": jpeg,
        "title": title,
        "url": page_url,
        "mode": "screenshot",
        "honesty": "Screenshot via host CDP bridge (software-test). Not unread-by-operator; input takeover is not implemented.",
    })))
}

async fn cdp_capture_jpeg(
    state: &AppState,
    sandbox_id: Uuid,
    port: u16,
    debugger_path: &str,
) -> anyhow::Result<String> {
    let mut ws = state
        .fluxvm
        .guest_ws(sandbox_id, port, debugger_path)
        .await?;
    // Enable page domain then capture one frame.
    ws.send(WsMessage::Text(
        json!({"id": 1, "method": "Page.enable"}).to_string().into(),
    ))
    .await?;
    ws.send(WsMessage::Text(
        json!({
            "id": 2,
            "method": "Page.captureScreenshot",
            "params": { "format": "jpeg", "quality": 60 }
        })
        .to_string()
        .into(),
    ))
    .await?;

    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(15);
    loop {
        if tokio::time::Instant::now() > deadline {
            anyhow::bail!("CDP screenshot timed out");
        }
        let msg = tokio::time::timeout(std::time::Duration::from_secs(5), ws.next())
            .await
            .map_err(|_| anyhow::anyhow!("CDP read timed out"))?
            .ok_or_else(|| anyhow::anyhow!("CDP connection closed"))??;
        let text = match msg {
            WsMessage::Text(t) => t.to_string(),
            WsMessage::Binary(b) => String::from_utf8_lossy(&b).to_string(),
            WsMessage::Close(_) => anyhow::bail!("CDP closed before screenshot"),
            _ => continue,
        };
        let v: Value = serde_json::from_str(&text)?;
        if v.get("id").and_then(|i| i.as_i64()) == Some(2) {
            if let Some(err) = v.get("error") {
                anyhow::bail!("CDP error: {err}");
            }
            let data = v
                .pointer("/result/data")
                .and_then(|d| d.as_str())
                .ok_or_else(|| anyhow::anyhow!("CDP screenshot missing result.data"))?;
            let _ = ws.close(None).await;
            return Ok(data.to_string());
        }
    }
}

/// Resolve the first page target's debugger path for CDP.
async fn first_page_debugger(state: &AppState, sandbox_id: Uuid, port: u16) -> ApiResult<String> {
    let list = state
        .fluxvm
        .guest_request(sandbox_id, port, Method::GET, "json/list", None)
        .await
        .map_err(ApiError::bad_gateway)?;
    let page = list
        .as_array()
        .into_iter()
        .flatten()
        .find(|t| t.get("type").and_then(|v| v.as_str()) == Some("page"))
        .ok_or_else(|| ApiError::not_found("no open page target for screenshot"))?;
    let ws_url = page
        .get("webSocketDebuggerUrl")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ApiError::bad_gateway("page has no webSocketDebuggerUrl"))?;
    debugger_path_from_ws_url(ws_url)
        .ok_or_else(|| ApiError::bad_gateway("could not parse debugger path"))
}

/// Read-only screencast WebSocket. Operator receives `{type:"frame",…}` only;
/// input / arbitrary CDP is refused. Present `Authorization: Bearer` or `?token=`.
pub(crate) async fn browser_screencast(
    ws: axum::extract::ws::WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<axum::response::Response, ApiError> {
    let (sandbox_id, port) = browser_port(&state, id).await?;
    let path = first_page_debugger(&state, sandbox_id, port).await?;
    Ok(ws.on_upgrade(move |socket| async move {
        if let Err(e) = run_screencast(state, socket, id, sandbox_id, port, path).await {
            tracing::warn!(session = %id, error = %e, "screencast ended");
        }
    }))
}

async fn run_screencast(
    state: Arc<AppState>,
    mut client: axum::extract::ws::WebSocket,
    session_id: Uuid,
    sandbox_id: Uuid,
    port: u16,
    debugger_path: String,
) -> anyhow::Result<()> {
    use axum::extract::ws::Message as AxumMsg;

    let _ = client
        .send(AxumMsg::Text(
            json!({
                "type": "hello",
                "session_id": session_id,
                "mode": "screencast",
                "honesty": "Host CDP screencast (software-test). No input takeover; host can still see the guest.",
            })
            .to_string()
            .into(),
        ))
        .await;

    let mut cdp = state
        .fluxvm
        .guest_ws(sandbox_id, port, &debugger_path)
        .await?;
    cdp.send(WsMessage::Text(
        json!({"id": 1, "method": "Page.enable"}).to_string().into(),
    ))
    .await?;
    cdp.send(WsMessage::Text(
        json!({
            "id": 2,
            "method": "Page.startScreencast",
            "params": {
                "format": "jpeg",
                "quality": 50,
                "maxWidth": 1280,
                "maxHeight": 720,
                "everyNthFrame": 2
            }
        })
        .to_string()
        .into(),
    ))
    .await?;

    let mut next_id: i64 = 10;
    loop {
        tokio::select! {
            client_msg = client.next() => {
                match client_msg {
                    Some(Ok(AxumMsg::Close(_))) | None => break,
                    Some(Ok(AxumMsg::Text(t))) => {
                        let v: Value = serde_json::from_str(&t).unwrap_or(Value::Null);
                        match v.get("type").and_then(|x| x.as_str()) {
                            Some("stop") => break,
                            Some("ack") => {
                                // Optional frame ack — CDP uses sessionId from event
                                if let Some(sid) = v.get("sessionId").and_then(|x| x.as_i64()) {
                                    next_id += 1;
                                    let _ = cdp.send(WsMessage::Text(
                                        json!({
                                            "id": next_id,
                                            "method": "Page.screencastFrameAck",
                                            "params": { "sessionId": sid }
                                        }).to_string().into()
                                    )).await;
                                }
                            }
                            Some("ping") => {
                                let _ = client.send(AxumMsg::Text(
                                    json!({"type":"pong"}).to_string().into()
                                )).await;
                            }
                            _ => {
                                // Refuse input / arbitrary CDP from the operator.
                                let _ = client.send(AxumMsg::Text(
                                    json!({
                                        "type": "error",
                                        "error": "only stop/ack/ping allowed; input takeover is not implemented"
                                    }).to_string().into()
                                )).await;
                            }
                        }
                    }
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
            cdp_msg = cdp.next() => {
                match cdp_msg {
                    Some(Ok(WsMessage::Text(t))) => {
                        let v: Value = match serde_json::from_str(&t) {
                            Ok(v) => v,
                            Err(_) => continue,
                        };
                        if v.get("method").and_then(|m| m.as_str()) == Some("Page.screencastFrame") {
                            let params = v.get("params").cloned().unwrap_or(Value::Null);
                            let data = params.get("data").and_then(|d| d.as_str()).unwrap_or("");
                            let session_id_cdp = params.get("sessionId").cloned();
                            let meta = params.get("metadata").cloned();
                            let _ = client.send(AxumMsg::Text(
                                json!({
                                    "type": "frame",
                                    "mime": "image/jpeg",
                                    "image_base64": data,
                                    "sessionId": session_id_cdp,
                                    "metadata": meta,
                                }).to_string().into()
                            )).await;
                            // Auto-ack so Chrome keeps sending frames.
                            if let Some(sid) = params.get("sessionId").and_then(|x| x.as_i64()) {
                                next_id += 1;
                                let _ = cdp.send(WsMessage::Text(
                                    json!({
                                        "id": next_id,
                                        "method": "Page.screencastFrameAck",
                                        "params": { "sessionId": sid }
                                    }).to_string().into()
                                )).await;
                            }
                        }
                    }
                    Some(Ok(WsMessage::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
        }
    }
    let _ = cdp
        .send(WsMessage::Text(
            json!({"id": 99, "method": "Page.stopScreencast"})
                .to_string()
                .into(),
        ))
        .await;
    let _ = cdp.close(None).await;
    let _ = client.send(AxumMsg::Close(None)).await;
    Ok(())
}

#[derive(Debug, serde::Deserialize)]
pub struct BrowserPageQuery {
    #[serde(default)]
    pub session: Option<String>,
}

/// Minimal HTML that polls tab listing + optional screenshot for operators.
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
main{{padding:1rem;max-width:960px;margin:0 auto}}
.card{{background:#162032;border:1px solid #243044;border-radius:12px;padding:1rem;margin-bottom:1rem}}
a{{color:#8ec7ff}} input,button{{font:inherit;padding:.5rem .75rem;border-radius:8px;border:1px solid #345}}
button{{background:#2b6cff;color:#fff;border:0;cursor:pointer}}
.tab{{padding:.75rem 0;border-bottom:1px solid #243044}}
.muted{{opacity:.7;font-size:13px}}
img.frame{{max-width:100%;border-radius:8px;border:1px solid #243044;background:#000}}
</style></head><body>
<header><strong>Keep browser</strong> · tabs + screencast
<div class="muted">Host CDP bridge (software-test). Frames only — no input takeover.</div>
</header>
<main>
<div class="card">
<label>API <input id="base" placeholder="http://127.0.0.1:9096" style="width:55%"/></label>
<label>Token <input id="token" type="password" style="width:35%"/></label>
<label>Session <input id="sid" value="{session_esc}" style="width:50%"/></label>
<button id="go">Refresh tabs</button>
<button id="cast" type="button">Start screencast</button>
<button id="stop" type="button">Stop</button>
</div>
<div id="shot" class="card muted">Screencast / screenshot frames appear here.</div>
<div id="out" class="card muted">Load a running session with browser_port set.</div>
</main>
<script>
const $=id=>document.getElementById(id);
let castWs=null;
async function refresh(){{
  const base=$('base').value.replace(/\/$/,'')||location.origin;
  const sid=$('sid').value.trim();
  const tok=$('token').value.trim();
  const headers=tok?{{Authorization:'Bearer '+tok}}:{{}};
  if(!sid){{$('out').textContent='session id required';return;}}
  const r=await fetch(base+'/v1/sessions/'+sid+'/browser/view',{{headers}});
  const j=await r.json();
  if(!r.ok){{$('out').textContent=JSON.stringify(j);return;}}
  const tabs=j.tabs||[];
  $('out').innerHTML=tabs.length?tabs.map(t=>`<div class="tab"><strong>${{t.title||'(untitled)'}}</strong><div class="muted">${{t.url||''}}</div></div>`).join('')
    :`<div class="muted">No open tabs. ${{j.note||''}}</div>`;
}}
function startCast(){{
  const base=$('base').value.replace(/\/$/,'')||location.origin;
  const sid=$('sid').value.trim();
  const tok=$('token').value.trim();
  if(!sid){{$('shot').textContent='session id required';return;}}
  if(castWs){{ try{{castWs.close();}}catch(e){{}} }}
  const u=new URL(base.replace(/^http/,'ws')+'/v1/sessions/'+sid+'/browser/screencast');
  if(tok) u.searchParams.set('token', tok);
  castWs=new WebSocket(u);
  castWs.onmessage=(ev)=>{{
    try{{
      const m=JSON.parse(ev.data);
      if(m.type==='frame' && m.image_base64){{
        $('shot').innerHTML=`<img class="frame" alt="screencast" src="data:${{m.mime||'image/jpeg'}};base64,${{m.image_base64}}"/>`;
      }} else if(m.type==='hello' || m.type==='error'){{
        const note=document.createElement('div'); note.className='muted'; note.textContent=m.honesty||m.error||m.type;
        if(!$('shot').querySelector('img')) $('shot').textContent=note.textContent;
      }}
    }}catch(e){{}}
  }};
  castWs.onerror=()=>{{$('shot').textContent='screencast socket error';}};
  castWs.onclose=()=>{{castWs=null;}};
}}
function stopCast(){{
  if(castWs && castWs.readyState===1) castWs.send(JSON.stringify({{type:'stop'}}));
  if(castWs) try{{castWs.close();}}catch(e){{}}
  castWs=null;
}}
$('go').onclick=refresh;
$('cast').onclick=startCast;
$('stop').onclick=stopCast;
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

    #[test]
    fn debugger_path_parsed_from_ws_url() {
        assert_eq!(
            debugger_path_from_ws_url("ws://127.0.0.1:9222/devtools/page/ABC").as_deref(),
            Some("devtools/page/ABC")
        );
        assert!(debugger_path_from_ws_url("http://nope").is_none());
    }
}
