// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

use crate::{
    audit::AuditPhase,
    credentials::{host_matches, CredentialVault, ResolveContext},
    model::{
        AgentManifest, ApprovalKind, ApprovalRecord, ApprovalStatus, EgressMode, EgressRequest,
        SessionRecord, DEFAULT_EGRESS_APPROVAL_SECONDS,
    },
    sentinel::{self, ReviewRequest, Verdict},
    AppState,
};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use base64::Engine;
use reqwest::Url;
use serde_json::{json, Value};
use sha2::Digest;
use std::{collections::BTreeMap, sync::Arc};

/// The router the sandbox can reach: the JSON egress broker and nothing else.
/// Approvals, the journal and every other operator route live only on the
/// public router, behind the operator token, so an agent cannot decide its own
/// approvals through the port it is allowed to talk to.
pub fn broker_router(state: Arc<AppState>) -> axum::Router {
    axum::Router::new()
        .route("/v1/egress", axum::routing::post(proxy))
        .with_state(state)
}

pub async fn proxy(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<EgressRequest>,
) -> Response {
    let target = AuditTarget::from_request(&headers, &request);
    match proxy_inner(&state, &headers, request).await {
        Ok(value) => {
            target
                .record(
                    &state,
                    AuditPhase::Performed,
                    json!({"status": value.get("status")}),
                )
                .await;
            (StatusCode::OK, Json(value)).into_response()
        }
        Err((status, message)) => {
            // 401 means the caller could not prove it owns the session, so its
            // claimed session id is not trustworthy enough to write to the journal.
            if status != StatusCode::UNAUTHORIZED {
                let phase = if status.is_server_error() {
                    AuditPhase::Failed
                } else {
                    AuditPhase::Denied
                };
                target
                    .record(&state, phase, json!({"reason": message}))
                    .await;
            }
            (status, Json(json!({"error": message}))).into_response()
        }
    }
}

/// What an egress call is about, captured before the request is consumed.
/// Query strings and credentials are deliberately excluded: they often carry secrets.
struct AuditTarget {
    session_id: Option<uuid::Uuid>,
    method: String,
    host: Option<String>,
    path: String,
}

impl AuditTarget {
    fn from_request(headers: &HeaderMap, request: &EgressRequest) -> Self {
        let url = Url::parse(&request.url).ok();
        Self {
            session_id: header(headers, "x-zyvor-session-id")
                .ok()
                .and_then(|id| uuid::Uuid::parse_str(id).ok()),
            method: request.method.to_ascii_uppercase(),
            host: url.as_ref().and_then(|u| u.host_str().map(str::to_string)),
            path: url.map(|u| u.path().to_string()).unwrap_or_default(),
        }
    }

    async fn record(&self, state: &AppState, phase: AuditPhase, mut detail: Value) {
        if let Some(object) = detail.as_object_mut() {
            object.insert("method".into(), json!(self.method));
            object.insert("path".into(), json!(self.path));
        }
        if let Err(error) = state
            .store
            .audit
            .append(
                self.session_id,
                phase,
                "egress.http",
                self.host.clone(),
                detail,
            )
            .await
        {
            tracing::error!(%error, "failed to write egress audit entry");
        }
    }
}

pub(crate) async fn proxy_inner(
    state: &AppState,
    headers: &HeaderMap,
    request: EgressRequest,
) -> Result<Value, (StatusCode, String)> {
    let session_id = header(headers, "x-zyvor-session-id")?;
    let capability = header(headers, "x-zyvor-egress-capability")?;
    let id = uuid::Uuid::parse_str(session_id)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "invalid session id".to_string()))?;
    let session = state
        .store
        .get_session(id)
        .await
        .ok_or((StatusCode::UNAUTHORIZED, "unknown session".to_string()))?;
    if !constant_time_eq(session.capability_token.as_bytes(), capability.as_bytes()) {
        return Err((StatusCode::UNAUTHORIZED, "invalid egress capability".into()));
    }
    if session.status.is_terminal() {
        return Err((StatusCode::FORBIDDEN, "session is no longer active".into()));
    }

    let agent = state
        .store
        .get_agent_version(&session.agent, &session.agent_version)
        .await
        .map_err(|_| {
            (
                StatusCode::FORBIDDEN,
                "pinned agent deployment no longer exists".into(),
            )
        })?;

    let url = Url::parse(&request.url)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("invalid egress URL: {e}")))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err((
            StatusCode::BAD_REQUEST,
            "only http and https egress is supported".into(),
        ));
    }
    let host = url
        .host_str()
        .ok_or((StatusCode::BAD_REQUEST, "egress URL has no host".into()))?;
    let body = match request.body_base64 {
        Some(encoded) => {
            let body = base64::engine::general_purpose::STANDARD
                .decode(encoded.as_bytes())
                .map_err(|_| (StatusCode::BAD_REQUEST, "body_base64 is invalid".into()))?;
            if body.len() > 16 * 1024 * 1024 {
                return Err((
                    StatusCode::PAYLOAD_TOO_LARGE,
                    "egress body exceeds 16 MiB".into(),
                ));
            }
            Some(body)
        }
        None => None,
    };
    // Layer 7 policy runs first, so a request the agent may never send is refused
    // before an operator is asked about it.
    crate::l7::check_rules(
        &agent.manifest.egress_rules,
        host,
        &request.method,
        url.path(),
        body.as_ref().map_or(0, Vec::len),
    )
    .map_err(|message| (StatusCode::FORBIDDEN, message))?;
    let dlp_hits = if agent.manifest.dlp {
        let mut text = url.as_str().to_string();
        for value in request.headers.values() {
            text.push('\n');
            text.push_str(value);
        }
        if let Some(bytes) = &body {
            text.push('\n');
            text.push_str(&String::from_utf8_lossy(bytes));
        }
        crate::l7::scan(&text)
    } else {
        Vec::new()
    };
    if !agent
        .manifest
        .egress_allow_hosts
        .iter()
        .any(|h| host_matches(h, host))
    {
        authorize_unlisted_host(state, &session, &agent.manifest, &url, &request.method).await?;
    }

    let port = url.port_or_known_default().unwrap_or(443);
    // Resolve once, validate, and pin the connection to that exact address
    // (rather than letting reqwest resolve the hostname a second,
    // independent time when it actually connects): otherwise an attacker
    // controlling DNS for `host` could return a public IP for this check
    // and a private/link-local one moments later for the real connection
    // (DNS rebinding), bypassing the allow_private_networks gate entirely.
    let pinned =
        resolve_and_validate_destination(host, port, agent.manifest.allow_private_networks).await?;

    let method = request
        .method
        .parse::<reqwest::Method>()
        .map_err(|_| (StatusCode::BAD_REQUEST, "invalid HTTP method".into()))?;
    let mut client_builder = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(120))
        .resolve(host, pinned);
    for root in &state.extra_roots {
        client_builder = client_builder.add_root_certificate(root.clone());
    }
    let request_client = client_builder.build().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to construct pinned egress client: {e}"),
        )
    })?;
    let mut upstream = request_client.request(method.clone(), url.clone());
    for (name, value) in request.headers {
        if is_hop_or_secret_header(&name) || state.credentials.is_injection_header(&name) {
            continue;
        }
        let header_name =
            reqwest::header::HeaderName::from_bytes(name.as_bytes()).map_err(|_| {
                (
                    StatusCode::BAD_REQUEST,
                    format!("invalid request header name: {name}"),
                )
            })?;
        let header_value = reqwest::header::HeaderValue::from_str(&value).map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                format!("invalid request header value for {name}"),
            )
        })?;
        upstream = upstream.header(header_name, header_value);
    }

    let mut needs_approval: Option<(ApprovalKind, String)> = None;
    if let Some(name) = request.credential.as_deref() {
        if !agent.manifest.credentials.iter().any(|c| c == name) {
            return Err((
                StatusCode::FORBIDDEN,
                format!("credential '{name}' is not granted to this agent"),
            ));
        }
        let is_fabric = state
            .credentials
            .descriptor(name)
            .map(|d| d.kind.eq_ignore_ascii_case("fabric"))
            .unwrap_or(false);
        if url.scheme() != "https" && !is_fabric {
            return Err((
                StatusCode::FORBIDDEN,
                "credentials are injected only into HTTPS requests".into(),
            ));
        }
        if is_fabric && !matches!(url.scheme(), "http" | "https") {
            return Err((
                StatusCode::FORBIDDEN,
                "fabric credentials require http or https".into(),
            ));
        }
        let port = url
            .port_or_known_default()
            .unwrap_or(if is_fabric { 80 } else { 443 });
        let (descriptor, secret) = state
            .credentials
            .authorize_resolve(
                name,
                &ResolveContext {
                    host,
                    method: &method,
                    path: url.path(),
                    port,
                    user_id: session.user_id.as_deref(),
                },
            )
            .map_err(|e| (StatusCode::FORBIDDEN, e.to_string()))?;
        if let Some(kind) = descriptor.approval_kind_for(&method) {
            needs_approval = Some((kind, name.to_string()));
        }
        if !secret.is_empty() {
            let header_name = reqwest::header::HeaderName::from_bytes(descriptor.header.as_bytes())
                .map_err(|_| {
                    (
                        StatusCode::BAD_GATEWAY,
                        "configured credential header is invalid".into(),
                    )
                })?;
            let header_value = reqwest::header::HeaderValue::from_str(&secret).map_err(|_| {
                (
                    StatusCode::BAD_GATEWAY,
                    "configured credential value cannot be represented as an HTTP header".into(),
                )
            })?;
            upstream = upstream.header(header_name, header_value);
        }
    }

    // Reasons a person must decide this request, gathered into one approval: a
    // credential that needs it, a secret-shaped string in the request, or a write
    // from a tainted session. This runs after every policy check and before
    // anything leaves the host.
    let mut reasons: Vec<String> = Vec::new();
    if !dlp_hits.is_empty() {
        reasons.push(format!("request contains: {}", dlp_hits.join(", ")));
    }
    if agent.manifest.taint.is_some()
        && !matches!(method, reqwest::Method::GET | reqwest::Method::HEAD)
    {
        if let Some(current) = state.store.get_session(session.id).await {
            if !current.tainted_by.is_empty() {
                reasons.push(format!(
                    "session is tainted by {}",
                    current.tainted_by.join(", ")
                ));
            }
        }
    }
    if needs_approval.is_some() || !reasons.is_empty() {
        let (kind, credential) = match needs_approval {
            Some((kind, name)) => (kind, Some(name)),
            None => (ApprovalKind::Send, None),
        };
        hold_for_approval(
            state,
            &session,
            &agent.manifest,
            kind,
            &url,
            method.as_str(),
            credential.as_deref(),
            &reasons,
            body.as_deref(),
        )
        .await?;
    }
    if let Some(body) = body {
        upstream = upstream.body(body);
    }

    let response = upstream.send().await.map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            format!("egress upstream failed: {e}"),
        )
    })?;
    let status = response.status().as_u16();
    taint_on_read(state, &session, &agent.manifest, host).await;
    let mut out_headers = BTreeMap::new();
    // `headers` collapses repeats (fine for a JSON caller); `header_list` keeps
    // every one, which the TLS-intercepting proxy needs for multiple Set-Cookie.
    let mut header_list: Vec<(String, String)> = Vec::new();
    for (name, value) in response.headers() {
        if let Ok(value) = value.to_str() {
            if !is_hop_or_secret_header(name.as_str()) {
                out_headers.insert(name.to_string(), value.to_string());
                header_list.push((name.to_string(), value.to_string()));
            }
        }
    }
    let body = response.bytes().await.map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            format!("reading upstream body: {e}"),
        )
    })?;
    if body.len() > 16 * 1024 * 1024 {
        return Err((
            StatusCode::BAD_GATEWAY,
            "upstream response exceeds 16 MiB".into(),
        ));
    }

    tracing::info!(session = %id, agent = %session.agent, %host, credential = ?request.credential, status, "agent egress");
    Ok(json!({
        "status": status,
        "headers": out_headers,
        "header_list": header_list,
        "body_base64": base64::engine::general_purpose::STANDARD.encode(body),
    }))
}

/// Resolves `host`, rejects it if any returned address is blocked (unless
/// `allow_private_networks` opts an agent out of that check), and returns
/// the first address to pin the actual connection to. The caller must
/// connect only to this exact address for this request -- resolving `host`
/// again later would reopen the DNS-rebinding gap this function exists to
/// close.
pub(crate) async fn resolve_and_validate_destination(
    host: &str,
    port: u16,
    allow_private_networks: bool,
) -> Result<std::net::SocketAddr, (StatusCode, String)> {
    let addresses: Vec<std::net::SocketAddr> = tokio::net::lookup_host((host, port))
        .await
        .map_err(|e| {
            (
                StatusCode::BAD_GATEWAY,
                format!("DNS lookup failed for {host}: {e}"),
            )
        })?
        .collect();
    let Some(first) = addresses.first().copied() else {
        return Err((
            StatusCode::BAD_GATEWAY,
            format!("DNS lookup returned no addresses for {host}"),
        ));
    };
    if !allow_private_networks {
        for address in &addresses {
            let ip = address.ip();
            let blocked = match ip {
                std::net::IpAddr::V4(v4) => {
                    v4.is_private()
                        || v4.is_loopback()
                        || v4.is_link_local()
                        || v4.is_multicast()
                        || v4.is_unspecified()
                }
                std::net::IpAddr::V6(v6) => {
                    v6.is_loopback()
                        || v6.is_unique_local()
                        || v6.is_unicast_link_local()
                        || v6.is_multicast()
                        || v6.is_unspecified()
                }
            };
            if blocked {
                return Err((
                    StatusCode::FORBIDDEN,
                    format!(
                        "destination {host} resolves to blocked private/link-local address {ip}"
                    ),
                ));
            }
        }
    }
    Ok(first)
}

fn header<'a>(headers: &'a HeaderMap, name: &str) -> Result<&'a str, (StatusCode, String)> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .filter(|v| !v.is_empty())
        .ok_or((StatusCode::UNAUTHORIZED, format!("missing {name}")))
}

fn is_hop_or_secret_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "host"
            | "authorization"
            | "proxy-authorization"
            | "content-length"
            | "connection"
            | "transfer-encoding"
    )
}

pub(crate) fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (&x, &y) in a.iter().zip(b) {
        diff |= x ^ y;
    }
    diff == 0
}

#[allow(dead_code)]
fn _assert_send_sync(_: &CredentialVault) {}

/// Taint the session when it has read content from a host the agent's taint
/// policy does not trust. Journaled once per host.
pub(crate) async fn taint_on_read(
    state: &AppState,
    session: &SessionRecord,
    manifest: &AgentManifest,
    host: &str,
) {
    let Some(policy) = &manifest.taint else {
        return;
    };
    if policy.trusted_hosts.iter().any(|h| host_matches(h, host)) {
        return;
    }
    match state.store.taint_session(session.id, host).await {
        Ok(true) => {
            if let Err(error) = state
                .store
                .audit
                .append(
                    Some(session.id),
                    AuditPhase::Performed,
                    "session.tainted",
                    Some(host.to_string()),
                    json!({"reason": "read from an untrusted host"}),
                )
                .await
            {
                tracing::error!(%error, "failed to write audit entry");
            }
        }
        Ok(false) => {}
        Err(error) => tracing::error!(%error, "failed to taint session"),
    }
}

/// True when the agent tracks taint and this session is currently tainted.
async fn is_tainted(state: &AppState, session: &SessionRecord, manifest: &AgentManifest) -> bool {
    manifest.taint.is_some()
        && state
            .store
            .get_session(session.id)
            .await
            .is_some_and(|s| !s.tainted_by.is_empty())
}

enum SentinelOutcome {
    /// One request may proceed; nothing is remembered for later requests.
    Allow,
    Deny(String),
    /// Ask an operator, passing along what the reviewer said (if anything).
    Escalate(Option<String>),
}

/// Screen a request with the reviewer model. Every failure path escalates to
/// the operator rather than allowing.
async fn sentinel_screen(
    state: &AppState,
    session: &SessionRecord,
    manifest: &AgentManifest,
    url: &Url,
    method: &str,
    host: &str,
) -> SentinelOutcome {
    let Some(config) = state.config.sentinel.as_ref() else {
        return SentinelOutcome::Escalate(Some("sentinel is not configured".into()));
    };
    let request = ReviewRequest {
        agent: &session.agent,
        allowed_hosts: &manifest.egress_allow_hosts,
        method,
        host,
        path: url.path(),
    };
    let audit = |phase: AuditPhase, detail: Value| async move {
        if let Err(error) = state
            .store
            .audit
            .append(
                Some(session.id),
                phase,
                "sentinel.egress",
                Some(host.to_string()),
                detail,
            )
            .await
        {
            tracing::error!(%error, "failed to write audit entry");
        }
    };
    match sentinel::review(&state.egress_http, config, &request).await {
        Ok(review) => {
            let detail = json!({"verdict": format!("{:?}", review.verdict).to_lowercase(), "reason": review.reason, "method": method});
            match review.verdict {
                // A tainted session may have read attacker-written content, so the
                // reviewer's say-so is not enough: a person decides.
                Verdict::Allow if is_tainted(state, session, manifest).await => {
                    SentinelOutcome::Escalate(Some(
                        "session is tainted; a person must decide".into(),
                    ))
                }
                Verdict::Allow => {
                    audit(AuditPhase::Approved, detail).await;
                    SentinelOutcome::Allow
                }
                Verdict::Deny => {
                    audit(AuditPhase::Denied, detail).await;
                    SentinelOutcome::Deny(format!(
                        "egress to {host} was denied by sentinel: {}",
                        review.reason
                    ))
                }
                Verdict::Escalate => SentinelOutcome::Escalate(Some(review.reason)),
            }
        }
        Err(error) => {
            tracing::warn!(%error, host, "sentinel review failed; asking an operator");
            SentinelOutcome::Escalate(Some(format!("sentinel unavailable: {error}")))
        }
    }
}

/// Poll interval while a request waits for an operator decision.
const APPROVAL_POLL: std::time::Duration = std::time::Duration::from_millis(250);

/// Decide what to do with a request to a host that is not on the allowlist.
///
/// In `deny` mode this is a plain refusal. In `ask` mode the request is held
/// while an operator approves or denies it. An approval only lifts the
/// allowlist check: DNS pinning and the private-network gate still run after
/// this returns, so approving a host never permits SSRF into internal ranges.
pub(crate) async fn authorize_unlisted_host(
    state: &AppState,
    session: &SessionRecord,
    manifest: &AgentManifest,
    url: &Url,
    method: &str,
) -> Result<(), (StatusCode, String)> {
    let host = url
        .host_str()
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    let refuse = |message: String| Err((StatusCode::FORBIDDEN, message));
    if manifest.egress_mode == EgressMode::Deny {
        return refuse(format!(
            "host {host} is not in this agent's egress allowlist"
        ));
    }
    if state
        .store
        .has_session_egress_grant(session.id, &host)
        .await
    {
        return Ok(());
    }

    let method = method.to_ascii_uppercase();
    let sentinel_note = if manifest.egress_mode == EgressMode::Sentinel {
        match sentinel_screen(state, session, manifest, url, &method, &host).await {
            SentinelOutcome::Allow => return Ok(()),
            SentinelOutcome::Deny(message) => return refuse(message),
            SentinelOutcome::Escalate(note) => note,
        }
    } else {
        None
    };
    let mut target = url.clone();
    target.set_query(None);
    target.set_fragment(None);
    let _ = target.set_username("");
    let _ = target.set_password(None);
    let candidate = ApprovalRecord {
        id: uuid::Uuid::new_v4(),
        session_id: session.id,
        kind: ApprovalKind::Egress,
        subject: Some(host.clone()),
        planned_action: Some(json!({
            "method": method,
            "url": target.as_str(),
            "scopes": ["once", "session"],
            "sentinel": sentinel_note,
        })),
        prompt: format!("Agent wants to {method} {target}, which is not on its egress allowlist"),
        status: ApprovalStatus::Pending,
        comment: None,
        created_at: chrono::Utc::now(),
        decided_at: None,
        source_seq: None,
        grant_scope: None,
        broker_held: true,
    };
    let (approval, created) = state
        .store
        .open_egress_approval(session.id, &host, candidate)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("failed to open egress approval: {e}"),
            )
        })?;
    if created {
        crate::app::audit_approval_planned(state, &approval).await;
    }

    wait_for_decision(
        state,
        session,
        &approval,
        approval_timeout(manifest),
        &host,
        &format!("egress to {host} was denied by an operator"),
        &format!("egress approval for {host} expired"),
    )
    .await
}

fn approval_timeout(manifest: &AgentManifest) -> std::time::Duration {
    std::time::Duration::from_secs(
        manifest
            .egress_approval_timeout_seconds
            .unwrap_or(DEFAULT_EGRESS_APPROVAL_SECONDS),
    )
}

/// Hold the current request until an operator decides `approval`. Approved
/// returns `Ok`; a denial, timeout, or the session ending refuses with 403.
/// A decision and a timeout can land at the same instant: whichever transition
/// reaches the store first wins, and the loser re-reads the result.
async fn wait_for_decision(
    state: &AppState,
    session: &SessionRecord,
    approval: &ApprovalRecord,
    timeout: std::time::Duration,
    subject: &str,
    denied_message: &str,
    expired_message: &str,
) -> Result<(), (StatusCode, String)> {
    let refuse = |message: &str| Err((StatusCode::FORBIDDEN, message.to_string()));
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        let current = state.store.get_approval(approval.id).await;
        match current.as_ref().map(|r| r.status) {
            Some(ApprovalStatus::Approved) => return Ok(()),
            Some(ApprovalStatus::Denied) => return refuse(denied_message),
            Some(ApprovalStatus::Expired) | None => return refuse(expired_message),
            Some(ApprovalStatus::Pending) => {}
        }
        let session_over = state
            .store
            .get_session(session.id)
            .await
            .is_none_or(|s| s.status.is_terminal());
        let timed_out = tokio::time::Instant::now() >= deadline;
        if session_over || timed_out {
            let expired = state
                .store
                .transition_approval(
                    approval.id,
                    ApprovalStatus::Expired,
                    Some(if session_over {
                        "session ended".into()
                    } else {
                        "timed out".into()
                    }),
                    None,
                )
                .await
                .ok()
                .flatten();
            if expired.is_some() {
                if let Err(error) = state
                    .store
                    .audit
                    .append(
                        Some(session.id),
                        AuditPhase::Denied,
                        &format!("approval.{}", approval.kind.as_str()),
                        Some(subject.to_string()),
                        json!({"approval_id": approval.id, "reason": "expired"}),
                    )
                    .await
                {
                    tracing::error!(%error, "failed to write audit entry");
                }
                return refuse(expired_message);
            }
            continue;
        }
        tokio::time::sleep(APPROVAL_POLL).await;
    }
}

/// Open a fresh approval for one credentialed request and hold it until an
/// operator decides. Unlike unlisted-host approvals these are never shared or
/// remembered: each request needs its own decision, because what is being
/// approved (a send, a purchase) is specific to that request. The record shows
/// the method, URL without its query string, the credential name, and a digest
/// and length of the body, never the body or any header.
#[allow(clippy::too_many_arguments)]
async fn hold_for_approval(
    state: &AppState,
    session: &SessionRecord,
    manifest: &AgentManifest,
    kind: ApprovalKind,
    url: &Url,
    method: &str,
    credential: Option<&str>,
    reasons: &[String],
    body: Option<&[u8]>,
) -> Result<(), (StatusCode, String)> {
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    let mut target = url.clone();
    target.set_query(None);
    target.set_fragment(None);
    let _ = target.set_username("");
    let _ = target.set_password(None);
    let (body_len, body_sha256) = match body {
        Some(bytes) => (bytes.len(), hex::encode(sha2::Sha256::digest(bytes))),
        None => (0, String::new()),
    };
    let approval = ApprovalRecord {
        id: uuid::Uuid::new_v4(),
        session_id: session.id,
        kind,
        subject: Some(host.clone()),
        planned_action: Some(json!({
            "method": method,
            "url": target.as_str(),
            "credential": credential,
            "reasons": reasons,
            "body_bytes": body_len,
            "body_sha256": body_sha256,
            "scopes": ["once"],
        })),
        prompt: {
            let mut prompt = format!("Agent wants to {method} {target}");
            if let Some(name) = credential {
                prompt.push_str(&format!(" using credential '{name}'"));
            }
            if !reasons.is_empty() {
                prompt.push_str(&format!(" ({})", reasons.join("; ")));
            }
            prompt
        },
        status: ApprovalStatus::Pending,
        comment: None,
        created_at: chrono::Utc::now(),
        decided_at: None,
        source_seq: None,
        grant_scope: None,
        broker_held: true,
    };
    state
        .store
        .save_approval(approval.clone())
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("failed to open approval: {e}"),
            )
        })?;
    crate::app::audit_approval_planned(state, &approval).await;
    let what = kind.as_str();
    wait_for_decision(
        state,
        session,
        &approval,
        approval_timeout(manifest),
        &host,
        &format!("{what} to {host} was denied by an operator"),
        &format!("{what} approval for {host} expired"),
    )
    .await
}

#[cfg(test)]
pub(crate) mod ask_tests {
    use super::*;
    use crate::{
        audit::AuditPhase,
        config::Config,
        model::{GrantScope, SessionStartMode, SessionStartPolicy, SessionStatus},
    };
    use std::sync::Arc;

    async fn state_and_session() -> (Arc<AppState>, SessionRecord) {
        state_and_session_with(None).await
    }

    pub(crate) async fn state_and_session_with(
        sentinel: Option<crate::sentinel::SentinelConfig>,
    ) -> (Arc<AppState>, SessionRecord) {
        state_and_session_cfg(|config| config.sentinel = sentinel).await
    }

    pub(crate) async fn state_and_session_cfg(
        tweak: impl FnOnce(&mut Config),
    ) -> (Arc<AppState>, SessionRecord) {
        let root = std::env::temp_dir().join(format!("zyvor-egress-ask-{}", uuid::Uuid::new_v4()));
        let mut config = Config {
            listen: "127.0.0.1:0".parse().unwrap(),
            egress_listen: "127.0.0.1:0".parse().unwrap(),
            state_dir: root.join("state"),
            snapshot_dir: root.join("snap"),
            fluxvm_url: "http://127.0.0.1:1".into(),
            fluxvm_token: None,
            api_token: None,
            credentials_file: None,
            skill_scopes_file: None,
            sentinel: None,
            approval_webhook: None,
            proxy_listen: None,
            proxy_connect_ports: vec![443],
            mitm_ca_dir: None,
            extra_ca_files: vec![],
            confine_all: false,
            security_profile: None,
            max_vcpus: None,
            max_memory_mib: None,
            egress_advertise_host: None,
            sync_interval_ms: 300,
            guest_start_timeout_secs: 30,
            idle_scan_interval_ms: 1000,
            warm_pool_reconcile_interval_ms: 2000,
            warm_pool_max_create_per_tick: 2,
            warm_pool_claim_stale_secs: 300,
            expiry_scan_interval_ms: 1000,
        };
        tweak(&mut config);
        let state = AppState::from_config(config).await.unwrap();
        let now = chrono::Utc::now();
        let session = SessionRecord {
            id: uuid::Uuid::new_v4(),
            agent: "a".into(),
            agent_version: "v".into(),
            sandbox_id: uuid::Uuid::new_v4(),
            status: SessionStatus::Running,
            input: json!({}),
            created_at: now,
            updated_at: now,
            last_event_seq: 0,
            guest_event_cursor: 0,
            request_id: None,
            start_policy: SessionStartPolicy::PreferWarm,
            start_mode: SessionStartMode::Cold,
            startup_ms: None,
            expires_at: None,
            sandbox_released: false,
            capability_token: "cap".into(),
            error: None,
            parent_session_id: None,
            user_id: None,
            tainted_by: vec![],
            confidential: None,
        };
        state.store.save_session(session.clone()).await.unwrap();
        (state, session)
    }

    pub(crate) fn manifest(mode: EgressMode, timeout: Option<u64>) -> AgentManifest {
        AgentManifest {
            egress_rules: vec![],
            dlp: false,
            taint: None,
            confinement: Default::default(),
            resources: None,
            confidential: Default::default(),
            inner_container: Default::default(),
            persistent: false,
            browser_port: None,
            template: "t".into(),
            credentials: vec![],
            egress_allow_hosts: vec![],
            allow_private_networks: false,
            runtime_port: 8080,
            ttl_seconds: None,
            max_concurrent_sessions: None,
            idle_hibernate_seconds: None,
            warm_pool_size: 0,
            runtime: Default::default(),
            egress_mode: mode,
            home_volume: None,
            skills: vec![],
            skill_scope: None,
            egress_approval_timeout_seconds: timeout,
            model_socket: None,
            cell_backend: None,
        }
    }

    fn url() -> Url {
        Url::parse("https://Example.com/path?token=secret").unwrap()
    }

    /// Wait until an egress approval for the session is pending, then return it.
    pub(crate) async fn wait_pending(state: &AppState, session: uuid::Uuid) -> ApprovalRecord {
        for _ in 0..200 {
            if let Some(found) = state
                .store
                .list_approvals()
                .await
                .into_iter()
                .find(|a| a.session_id == session && a.status == ApprovalStatus::Pending)
            {
                return found;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        panic!("no pending approval appeared");
    }

    #[tokio::test]
    async fn deny_mode_refuses_without_opening_an_approval() {
        let (state, session) = state_and_session().await;
        let err = authorize_unlisted_host(
            &state,
            &session,
            &manifest(EgressMode::Deny, None),
            &url(),
            "GET",
        )
        .await
        .unwrap_err();
        assert_eq!(err.0, StatusCode::FORBIDDEN);
        assert!(err.1.contains("allowlist"));
        assert!(state.store.list_approvals().await.is_empty());
    }

    #[tokio::test]
    async fn ask_mode_approve_once_does_not_cover_later_requests() {
        let (state, session) = state_and_session().await;
        let m = manifest(EgressMode::Ask, Some(1));
        let task = {
            let (state, session, m) = (state.clone(), session.clone(), m.clone());
            tokio::spawn(async move {
                authorize_unlisted_host(&state, &session, &m, &url(), "GET").await
            })
        };
        let pending = wait_pending(&state, session.id).await;
        assert_eq!(pending.kind, ApprovalKind::Egress);
        assert_eq!(pending.subject.as_deref(), Some("example.com"));
        let planned = pending.planned_action.clone().unwrap().to_string();
        assert!(
            !planned.contains("secret"),
            "query string must not be stored: {planned}"
        );
        state
            .store
            .transition_approval(
                pending.id,
                ApprovalStatus::Approved,
                None,
                Some(GrantScope::Once),
            )
            .await
            .unwrap()
            .unwrap();
        assert!(task.await.unwrap().is_ok());

        // A later request is not covered and, with nobody deciding, expires.
        let err = authorize_unlisted_host(&state, &session, &m, &url(), "GET")
            .await
            .unwrap_err();
        assert_eq!(err.0, StatusCode::FORBIDDEN);
        assert!(err.1.contains("expired"));
    }

    #[tokio::test]
    async fn ask_mode_session_grant_covers_later_requests_immediately() {
        let (state, session) = state_and_session().await;
        let m = manifest(EgressMode::Ask, Some(30));
        let task = {
            let (state, session, m) = (state.clone(), session.clone(), m.clone());
            tokio::spawn(async move {
                authorize_unlisted_host(&state, &session, &m, &url(), "GET").await
            })
        };
        let pending = wait_pending(&state, session.id).await;
        state
            .store
            .transition_approval(
                pending.id,
                ApprovalStatus::Approved,
                None,
                Some(GrantScope::Session),
            )
            .await
            .unwrap();
        assert!(task.await.unwrap().is_ok());
        let started = std::time::Instant::now();
        assert!(
            authorize_unlisted_host(&state, &session, &m, &url(), "POST")
                .await
                .is_ok()
        );
        assert!(started.elapsed() < std::time::Duration::from_secs(1));
        assert_eq!(state.store.list_approvals().await.len(), 1);
    }

    #[tokio::test]
    async fn ask_mode_denied_by_operator() {
        let (state, session) = state_and_session().await;
        let m = manifest(EgressMode::Ask, Some(30));
        let task = {
            let (state, session, m) = (state.clone(), session.clone(), m.clone());
            tokio::spawn(async move {
                authorize_unlisted_host(&state, &session, &m, &url(), "GET").await
            })
        };
        let pending = wait_pending(&state, session.id).await;
        state
            .store
            .transition_approval(pending.id, ApprovalStatus::Denied, Some("no".into()), None)
            .await
            .unwrap();
        let err = task.await.unwrap().unwrap_err();
        assert_eq!(err.0, StatusCode::FORBIDDEN);
        assert!(err.1.contains("denied by an operator"));
    }

    #[tokio::test]
    async fn concurrent_requests_to_one_host_share_one_approval() {
        let (state, session) = state_and_session().await;
        let m = manifest(EgressMode::Ask, Some(30));
        let mut tasks = Vec::new();
        for _ in 0..3 {
            let (state, session, m) = (state.clone(), session.clone(), m.clone());
            tasks.push(tokio::spawn(async move {
                authorize_unlisted_host(&state, &session, &m, &url(), "GET").await
            }));
        }
        let pending = wait_pending(&state, session.id).await;
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        assert_eq!(state.store.list_approvals().await.len(), 1);
        state
            .store
            .transition_approval(
                pending.id,
                ApprovalStatus::Approved,
                None,
                Some(GrantScope::Once),
            )
            .await
            .unwrap();
        for task in tasks {
            assert!(task.await.unwrap().is_ok());
        }
    }

    #[test]
    fn default_manifest_serialization_omits_egress_mode_fields() {
        // Agent version ids hash the serialized manifest, so defaults must not
        // change the bytes of manifests deployed before these fields existed.
        let value = serde_json::to_value(manifest(EgressMode::Deny, None)).unwrap();
        assert!(value.get("egress_mode").is_none());
        assert!(value.get("egress_approval_timeout_seconds").is_none());
        assert!(value.get("skills").is_none());
        assert!(value.get("skill_scope").is_none());
        assert!(value.get("home_volume").is_none());
        let asked = serde_json::to_value(manifest(EgressMode::Ask, Some(30))).unwrap();
        assert_eq!(asked["egress_mode"], "ask");
        assert_eq!(asked["egress_approval_timeout_seconds"], 30);
    }

    #[tokio::test]
    async fn ending_the_session_expires_the_wait_and_is_journaled() {
        let (state, session) = state_and_session().await;
        let m = manifest(EgressMode::Ask, Some(30));
        let task = {
            let (state, session, m) = (state.clone(), session.clone(), m.clone());
            tokio::spawn(async move {
                authorize_unlisted_host(&state, &session, &m, &url(), "GET").await
            })
        };
        wait_pending(&state, session.id).await;
        let mut ended = session.clone();
        ended.status = SessionStatus::Cancelled;
        state.store.save_session(ended).await.unwrap();
        let err = task.await.unwrap().unwrap_err();
        assert!(err.1.contains("expired"));
        let entries = state.store.audit.list(Some(session.id), 100).await.unwrap();
        assert!(entries.iter().any(|e| e.phase == AuditPhase::Planned));
        assert!(entries
            .iter()
            .any(|e| e.phase == AuditPhase::Denied && e.detail["reason"] == "expired"));
        assert!(state.store.audit.verify().await.unwrap().chain_ok);
    }

    async fn reviewer(answer: &'static str) -> crate::sentinel::SentinelConfig {
        let app = axum::Router::new().route(
            "/v1/chat/completions",
            axum::routing::post(move || async move {
                Json(json!({"choices": [{"message": {"content": answer}}]}))
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        crate::sentinel::SentinelConfig {
            url: format!("http://{addr}/v1"),
            model: "m".into(),
            api_key: None,
            timeout: std::time::Duration::from_secs(5),
            can_allow: false,
        }
    }

    #[tokio::test]
    async fn sentinel_deny_refuses_without_a_human_and_is_journaled() {
        let cfg = reviewer(r#"{"verdict":"deny","reason":"paste site"}"#).await;
        let (state, session) = state_and_session_with(Some(cfg)).await;
        let m = manifest(EgressMode::Sentinel, Some(30));
        let err = authorize_unlisted_host(&state, &session, &m, &url(), "GET")
            .await
            .unwrap_err();
        assert_eq!(err.0, StatusCode::FORBIDDEN);
        assert!(err.1.contains("sentinel") && err.1.contains("paste site"));
        assert!(state.store.list_approvals().await.is_empty());
        let entries = state.store.audit.list(Some(session.id), 50).await.unwrap();
        assert!(entries
            .iter()
            .any(|e| e.action == "sentinel.egress" && e.phase == AuditPhase::Denied));
    }

    #[tokio::test]
    async fn sentinel_escalate_asks_an_operator_and_passes_the_note() {
        let cfg = reviewer(r#"{"verdict":"escalate","reason":"unfamiliar host"}"#).await;
        let (state, session) = state_and_session_with(Some(cfg)).await;
        let m = manifest(EgressMode::Sentinel, Some(30));
        let waiter = {
            let (state, session, m) = (state.clone(), session.clone(), m.clone());
            tokio::spawn(async move {
                authorize_unlisted_host(&state, &session, &m, &url(), "GET").await
            })
        };
        let pending = wait_pending(&state, session.id).await;
        assert_eq!(
            pending.planned_action.as_ref().unwrap()["sentinel"],
            "unfamiliar host"
        );
        state
            .store
            .transition_approval(
                pending.id,
                ApprovalStatus::Approved,
                None,
                Some(GrantScope::Once),
            )
            .await
            .unwrap();
        assert!(waiter.await.unwrap().is_ok());
    }

    #[tokio::test]
    async fn sentinel_allow_needs_operator_opt_in_and_never_persists() {
        let mut cfg = reviewer(r#"{"verdict":"allow","reason":"docs site"}"#).await;
        cfg.can_allow = true;
        let (state, session) = state_and_session_with(Some(cfg)).await;
        let m = manifest(EgressMode::Sentinel, Some(30));
        authorize_unlisted_host(&state, &session, &m, &url(), "GET")
            .await
            .unwrap();
        assert!(state.store.list_approvals().await.is_empty());
        assert!(
            !state
                .store
                .has_session_egress_grant(session.id, "example.com")
                .await
        );
    }

    #[tokio::test]
    async fn sentinel_unconfigured_or_unreachable_falls_back_to_asking() {
        for cfg in [
            None,
            Some(crate::sentinel::SentinelConfig {
                url: "http://127.0.0.1:1/v1".into(),
                model: "m".into(),
                api_key: None,
                timeout: std::time::Duration::from_secs(1),
                can_allow: true,
            }),
        ] {
            let (state, session) = state_and_session_with(cfg).await;
            let m = manifest(EgressMode::Sentinel, Some(5));
            let waiter = {
                let (state, session, m) = (state.clone(), session.clone(), m.clone());
                tokio::spawn(async move {
                    authorize_unlisted_host(&state, &session, &m, &url(), "GET").await
                })
            };
            let pending = wait_pending(&state, session.id).await;
            state
                .store
                .transition_approval(pending.id, ApprovalStatus::Denied, None, None)
                .await
                .unwrap();
            assert!(waiter.await.unwrap().is_err());
        }
    }

    #[test]
    fn sentinel_mode_serializes_as_sentinel() {
        let value = serde_json::to_value(manifest(EgressMode::Sentinel, None)).unwrap();
        assert_eq!(value["egress_mode"], "sentinel");
    }

    // ---- credentialed requests that need a human (send / purchase) ----

    async fn upstream_counter() -> (u16, Arc<std::sync::atomic::AtomicUsize>) {
        let hits = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counter = hits.clone();
        let app = axum::Router::new().route(
            "/send",
            axum::routing::any(move || {
                let counter = counter.clone();
                async move {
                    counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    "ok"
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (port, hits)
    }

    /// A state whose agent holds a `mail` credential that needs approval for POST.
    async fn approval_gated_agent(port: u16) -> (Arc<AppState>, SessionRecord) {
        let file = std::env::temp_dir().join(format!("zyvor-cred-{}.json", uuid::Uuid::new_v4()));
        std::fs::write(
            &file,
            json!({"mail": {
                "host": "127.0.0.1", "header": "authorization", "kind": "fabric",
                "allowed_ports": [port], "requires_approval": ["POST"], "approval_kind": "send"
            }})
            .to_string(),
        )
        .unwrap();
        let (state, session) =
            state_and_session_cfg(|config| config.credentials_file = Some(file)).await;
        let mut m = manifest(EgressMode::Deny, Some(30));
        m.credentials = vec!["mail".into()];
        m.egress_allow_hosts = vec!["127.0.0.1".into()];
        m.allow_private_networks = true;
        let deployed = state
            .store
            .deploy_agent(crate::model::DeployAgentRequest {
                name: session.agent.clone(),
                bundle_base64: base64::engine::general_purpose::STANDARD.encode("export default 1"),
                manifest: m,
            })
            .await
            .unwrap();
        let session = state
            .store
            .update_session(session.id, |s| s.agent_version = deployed.version.clone())
            .await
            .unwrap();
        (state, session)
    }

    async fn call(
        state: &AppState,
        session: &SessionRecord,
        port: u16,
        method: &str,
        body: Option<&str>,
    ) -> Result<Value, (StatusCode, String)> {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-zyvor-session-id",
            session.id.to_string().parse().unwrap(),
        );
        headers.insert("x-zyvor-egress-capability", "cap".parse().unwrap());
        proxy_inner(
            state,
            &headers,
            EgressRequest {
                url: format!("http://127.0.0.1:{port}/send?token=hunter2"),
                method: method.into(),
                headers: Default::default(),
                body_base64: body.map(|b| base64::engine::general_purpose::STANDARD.encode(b)),
                credential: Some("mail".into()),
            },
        )
        .await
    }

    #[tokio::test]
    async fn send_credential_holds_the_request_until_approved_and_never_records_the_body() {
        let (port, hits) = upstream_counter().await;
        let (state, session) = approval_gated_agent(port).await;
        let waiter = {
            let (state, session) = (state.clone(), session.clone());
            tokio::spawn(async move {
                call(&state, &session, port, "POST", Some("hello secret body")).await
            })
        };
        let pending = wait_pending(&state, session.id).await;
        assert_eq!(pending.kind, ApprovalKind::Send);
        let planned = pending.planned_action.clone().unwrap();
        assert_eq!(planned["method"], "POST");
        assert_eq!(planned["credential"], "mail");
        assert_eq!(planned["body_bytes"], 17);
        let expected = hex::encode(sha2::Sha256::digest(b"hello secret body"));
        assert_eq!(planned["body_sha256"], expected);
        let stored = format!("{planned} {}", pending.prompt);
        assert!(
            !stored.contains("hello secret body"),
            "body leaked: {stored}"
        );
        assert!(!stored.contains("hunter2"), "query leaked: {stored}");
        // Nothing left the host while the decision was pending.
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 0);
        assert!(!waiter.is_finished());

        state
            .store
            .transition_approval(
                pending.id,
                ApprovalStatus::Approved,
                None,
                Some(GrantScope::Once),
            )
            .await
            .unwrap();
        let reply = waiter.await.unwrap().unwrap();
        assert_eq!(reply["status"], 200);
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn approving_one_send_does_not_cover_the_next_and_denial_stops_it() {
        let (port, hits) = upstream_counter().await;
        let (state, session) = approval_gated_agent(port).await;
        for decision in [ApprovalStatus::Approved, ApprovalStatus::Denied] {
            let waiter = {
                let (state, session) = (state.clone(), session.clone());
                tokio::spawn(async move { call(&state, &session, port, "POST", Some("x")).await })
            };
            // Each request opens its own approval, even after an earlier approval.
            let pending = wait_pending(&state, session.id).await;
            state
                .store
                .transition_approval(pending.id, decision, None, Some(GrantScope::Session))
                .await
                .unwrap();
            let result = waiter.await.unwrap();
            if decision == ApprovalStatus::Denied {
                assert!(result.unwrap_err().1.contains("denied by an operator"));
            } else {
                assert!(result.is_ok());
            }
        }
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn methods_not_listed_skip_the_approval() {
        let (port, hits) = upstream_counter().await;
        let (state, session) = approval_gated_agent(port).await;
        let reply = call(&state, &session, port, "GET", None).await.unwrap();
        assert_eq!(reply["status"], 200);
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 1);
        assert!(state.store.list_approvals().await.is_empty());
    }

    // ---- the agent cannot reach the approval API ----

    async fn status(
        router: axum::Router,
        method: &str,
        uri: &str,
        bearer: Option<&str>,
    ) -> StatusCode {
        use tower::ServiceExt;
        let mut request = axum::http::Request::builder().method(method).uri(uri);
        if let Some(token) = bearer {
            request = request.header("authorization", format!("Bearer {token}"));
        }
        let request = request
            .header("content-type", "application/json")
            .body(axum::body::Body::from("{\"decision\":\"approved\"}"))
            .unwrap();
        router.oneshot(request).await.unwrap().status()
    }

    #[tokio::test]
    async fn the_egress_broker_does_not_serve_operator_routes() {
        let (state, session) = state_and_session().await;
        let id = uuid::Uuid::new_v4();
        for (method, uri) in [
            ("GET", "/v1/approvals".to_string()),
            ("POST", format!("/v1/approvals/{id}")),
            ("GET", "/v1/audit".to_string()),
            ("POST", "/v1/agents".to_string()),
            ("GET", format!("/v1/sessions/{}", session.id)),
        ] {
            let code = status(broker_router(state.clone()), method, &uri, Some("cap")).await;
            assert_eq!(code, StatusCode::NOT_FOUND, "{method} {uri}");
        }
    }

    #[tokio::test]
    async fn a_session_capability_is_not_an_operator_token() {
        let (state, session) =
            state_and_session_cfg(|c| c.api_token = Some("operator".into())).await;
        let public = || crate::app::public_router(state.clone());
        let id = uuid::Uuid::new_v4();
        let uri = format!("/v1/approvals/{id}");
        // The agent's own credential is refused outright.
        for token in ["cap", &session.id.to_string()] {
            assert_eq!(
                status(public(), "GET", "/v1/approvals", Some(token)).await,
                StatusCode::UNAUTHORIZED
            );
            assert_eq!(
                status(public(), "POST", &uri, Some(token)).await,
                StatusCode::UNAUTHORIZED
            );
        }
        assert_eq!(
            status(public(), "GET", "/v1/approvals", None).await,
            StatusCode::UNAUTHORIZED
        );
        // The operator token gets through to the handler (404: no such approval).
        assert_eq!(
            status(public(), "POST", &uri, Some("operator")).await,
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            status(public(), "GET", "/v1/approvals", Some("operator")).await,
            StatusCode::OK
        );
    }

    // ---- layer 7 rules, DLP, and taint ----

    /// Deploy an agent that may reach 127.0.0.1 and adjust its manifest, and
    /// point the session at that version.
    async fn deploy_local_agent(
        state: &AppState,
        session: &SessionRecord,
        tweak: impl FnOnce(&mut AgentManifest),
    ) -> SessionRecord {
        let mut m = manifest(EgressMode::Deny, Some(30));
        m.egress_allow_hosts = vec!["127.0.0.1".into()];
        m.allow_private_networks = true;
        tweak(&mut m);
        let deployed = state
            .store
            .deploy_agent(crate::model::DeployAgentRequest {
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
            .unwrap()
    }

    async fn plain_call(
        state: &AppState,
        session: &SessionRecord,
        port: u16,
        method: &str,
        body: Option<&str>,
    ) -> Result<Value, (StatusCode, String)> {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-zyvor-session-id",
            session.id.to_string().parse().unwrap(),
        );
        headers.insert("x-zyvor-egress-capability", "cap".parse().unwrap());
        proxy_inner(
            state,
            &headers,
            EgressRequest {
                url: format!("http://127.0.0.1:{port}/send"),
                method: method.into(),
                headers: Default::default(),
                body_base64: body.map(|b| base64::engine::general_purpose::STANDARD.encode(b)),
                credential: None,
            },
        )
        .await
    }

    fn hits(counter: &Arc<std::sync::atomic::AtomicUsize>) -> usize {
        counter.load(std::sync::atomic::Ordering::SeqCst)
    }

    #[tokio::test]
    async fn egress_rules_refuse_before_anything_is_asked_or_sent() {
        let (port, counter) = upstream_counter().await;
        let (state, session) = state_and_session().await;
        let session = deploy_local_agent(&state, &session, |m| {
            m.egress_rules = vec![crate::model::EgressRule {
                host: "127.0.0.1".into(),
                methods: vec!["GET".into()],
                path_prefixes: vec![],
                max_body_bytes: None,
            }];
        })
        .await;
        assert!(plain_call(&state, &session, port, "GET", None)
            .await
            .is_ok());
        let error = plain_call(&state, &session, port, "POST", Some("x"))
            .await
            .unwrap_err();
        assert_eq!(error.0, StatusCode::FORBIDDEN);
        assert!(error.1.contains("egress rules"), "{}", error.1);
        assert_eq!(hits(&counter), 1);
        assert!(state.store.list_approvals().await.is_empty());
    }

    #[tokio::test]
    async fn dlp_holds_a_request_carrying_a_secret_and_never_stores_it() {
        let (port, counter) = upstream_counter().await;
        let (state, session) = state_and_session().await;
        let session = deploy_local_agent(&state, &session, |m| m.dlp = true).await;
        // A clean request goes straight through.
        assert!(plain_call(&state, &session, port, "POST", Some("hello"))
            .await
            .is_ok());
        assert_eq!(hits(&counter), 1);

        let secret = "AKIAIOSFODNN7EXAMPLE";
        let waiter = {
            let (state, session) = (state.clone(), session.clone());
            tokio::spawn(async move {
                plain_call(
                    &state,
                    &session,
                    port,
                    "POST",
                    Some(&format!("key={secret}")),
                )
                .await
            })
        };
        let pending = wait_pending(&state, session.id).await;
        assert_eq!(pending.kind, ApprovalKind::Send);
        let stored = format!("{:?} {}", pending.planned_action, pending.prompt);
        assert!(stored.contains("aws-access-key"), "{stored}");
        assert!(!stored.contains(secret), "secret leaked: {stored}");
        assert_eq!(hits(&counter), 1, "held request must not have been sent");
        state
            .store
            .transition_approval(pending.id, ApprovalStatus::Denied, None, None)
            .await
            .unwrap();
        assert!(waiter.await.unwrap().is_err());
        assert_eq!(hits(&counter), 1);
    }

    #[tokio::test]
    async fn reading_untrusted_content_taints_and_a_tainted_session_needs_approval_to_write() {
        let (port, counter) = upstream_counter().await;
        let (state, session) = state_and_session().await;
        let session = deploy_local_agent(&state, &session, |m| {
            m.taint = Some(crate::model::TaintPolicy {
                trusted_hosts: vec!["trusted.example".into()],
            });
        })
        .await;
        // A fresh session is clean, so its first write is not held.
        assert!(state
            .store
            .get_session(session.id)
            .await
            .unwrap()
            .tainted_by
            .is_empty());
        assert!(plain_call(&state, &session, port, "POST", Some("a"))
            .await
            .is_ok());
        // Any response from an untrusted host is content the agent has read, so
        // even that first write's reply taints the session.
        assert!(plain_call(&state, &session, port, "GET", None)
            .await
            .is_ok());
        let tainted = state.store.get_session(session.id).await.unwrap();
        assert_eq!(tainted.tainted_by, vec!["127.0.0.1".to_string()]);
        let entries = state.store.audit.list(Some(session.id), 50).await.unwrap();
        assert!(entries.iter().any(|e| e.action == "session.tainted"));
        // Reads still flow; a write is held.
        assert!(plain_call(&state, &session, port, "GET", None)
            .await
            .is_ok());
        let before = hits(&counter);
        let waiter = {
            let (state, session) = (state.clone(), session.clone());
            tokio::spawn(async move { plain_call(&state, &session, port, "POST", Some("b")).await })
        };
        let pending = wait_pending(&state, session.id).await;
        assert!(
            pending.prompt.contains("tainted by 127.0.0.1"),
            "{}",
            pending.prompt
        );
        assert_eq!(hits(&counter), before);
        state
            .store
            .transition_approval(
                pending.id,
                ApprovalStatus::Approved,
                None,
                Some(GrantScope::Once),
            )
            .await
            .unwrap();
        assert!(waiter.await.unwrap().is_ok());
        // An operator clearing the taint frees later writes.
        state.store.untaint_session(session.id).await.unwrap();
        assert!(plain_call(&state, &session, port, "POST", Some("c"))
            .await
            .is_ok());
    }

    #[tokio::test]
    async fn trusted_hosts_do_not_taint() {
        let (port, _counter) = upstream_counter().await;
        let (state, session) = state_and_session().await;
        let session = deploy_local_agent(&state, &session, |m| {
            m.taint = Some(crate::model::TaintPolicy {
                trusted_hosts: vec!["127.0.0.1".into()],
            });
        })
        .await;
        assert!(plain_call(&state, &session, port, "GET", None)
            .await
            .is_ok());
        assert!(state
            .store
            .get_session(session.id)
            .await
            .unwrap()
            .tainted_by
            .is_empty());
    }

    #[tokio::test]
    async fn a_tainted_session_cannot_be_auto_allowed_by_sentinel() {
        let mut cfg = reviewer(r#"{"verdict":"allow","reason":"looks fine"}"#).await;
        cfg.can_allow = true;
        let (state, session) = state_and_session_with(Some(cfg)).await;
        let mut m = manifest(EgressMode::Sentinel, Some(30));
        m.taint = Some(Default::default());
        // Untainted: the reviewer's allow lets it through with no human.
        authorize_unlisted_host(&state, &session, &m, &url(), "GET")
            .await
            .unwrap();
        assert!(state.store.list_approvals().await.is_empty());
        // Tainted: the same verdict now escalates to a person.
        state
            .store
            .taint_session(session.id, "evil.example")
            .await
            .unwrap();
        let waiter = {
            let (state, session, m) = (state.clone(), session.clone(), m.clone());
            tokio::spawn(async move {
                authorize_unlisted_host(&state, &session, &m, &url(), "GET").await
            })
        };
        let pending = wait_pending(&state, session.id).await;
        assert!(pending.planned_action.as_ref().unwrap()["sentinel"]
            .as_str()
            .unwrap()
            .contains("tainted"));
        state
            .store
            .transition_approval(pending.id, ApprovalStatus::Denied, None, None)
            .await
            .unwrap();
        assert!(waiter.await.unwrap().is_err());
    }

    #[tokio::test]
    async fn only_the_operator_can_untaint_a_session() {
        let (state, session) =
            state_and_session_cfg(|c| c.api_token = Some("operator".into())).await;
        state
            .store
            .taint_session(session.id, "evil.example")
            .await
            .unwrap();
        let uri = format!("/v1/sessions/{}/untaint", session.id);
        let public = || crate::app::public_router(state.clone());
        assert_eq!(
            status(public(), "POST", &uri, Some("cap")).await,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            status(broker_router(state.clone()), "POST", &uri, Some("cap")).await,
            StatusCode::NOT_FOUND
        );
        assert!(!state
            .store
            .get_session(session.id)
            .await
            .unwrap()
            .tainted_by
            .is_empty());
        assert_eq!(
            status(public(), "POST", &uri, Some("operator")).await,
            StatusCode::OK
        );
        assert!(state
            .store
            .get_session(session.id)
            .await
            .unwrap()
            .tainted_by
            .is_empty());
        let entries = state.store.audit.list(Some(session.id), 50).await.unwrap();
        assert!(entries.iter().any(|e| e.action == "session.untainted"));
    }

    /// Regression: deciding an approval the broker is holding used to steer the
    /// session too, which fails when the guest is unreachable and is meaningless
    /// because no agent is waiting for it.
    #[tokio::test]
    async fn deciding_a_broker_held_approval_does_not_steer_the_session() {
        let (state, session) =
            state_and_session_cfg(|c| c.api_token = Some("operator".into())).await;
        let open = |held: bool| ApprovalRecord {
            id: uuid::Uuid::new_v4(),
            session_id: session.id,
            kind: ApprovalKind::Send,
            subject: Some("mail.example".into()),
            planned_action: None,
            prompt: "send".into(),
            status: ApprovalStatus::Pending,
            comment: None,
            created_at: chrono::Utc::now(),
            decided_at: None,
            source_seq: None,
            broker_held: held,
            grant_scope: None,
        };
        let held = open(true);
        state.store.save_approval(held.clone()).await.unwrap();
        let uri = format!("/v1/approvals/{}", held.id);
        let public = crate::app::public_router(state.clone());
        assert_eq!(
            status(public, "POST", &uri, Some("operator")).await,
            StatusCode::OK
        );
        assert_eq!(
            state.store.get_approval(held.id).await.unwrap().status,
            ApprovalStatus::Approved
        );
        // Control: an agent-initiated approval still steers the (unreachable) guest.
        let asked = open(false);
        state.store.save_approval(asked.clone()).await.unwrap();
        let uri = format!("/v1/approvals/{}", asked.id);
        let public = crate::app::public_router(state.clone());
        assert_ne!(
            status(public, "POST", &uri, Some("operator")).await,
            StatusCode::OK
        );
    }
}
