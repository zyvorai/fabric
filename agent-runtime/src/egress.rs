// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

use crate::{
    audit::AuditPhase,
    credentials::{credential_allows_request, host_matches, CredentialVault},
    model::{
        AgentManifest, ApprovalKind, ApprovalRecord, ApprovalStatus, EgressMode, EgressRequest,
        SessionRecord, DEFAULT_EGRESS_APPROVAL_SECONDS,
    },
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
use std::{collections::BTreeMap, sync::Arc};

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

async fn proxy_inner(
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
    let request_client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(120))
        .resolve(host, pinned)
        .build()
        .map_err(|e| {
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
        let (descriptor, secret) = state
            .credentials
            .resolve(name)
            .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;
        if !host_matches(&descriptor.host, host) {
            return Err((
                StatusCode::FORBIDDEN,
                format!("credential '{name}' cannot be used for host {host}"),
            ));
        }
        let port = url
            .port_or_known_default()
            .unwrap_or(if is_fabric { 80 } else { 443 });
        if !credential_allows_request(descriptor, &method, url.path(), port) {
            return Err((
                StatusCode::FORBIDDEN,
                format!(
                    "credential '{name}' policy denies {} {} on port {port}",
                    method.as_str(),
                    url.path()
                ),
            ));
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

    if let Some(encoded) = request.body_base64 {
        let body = base64::engine::general_purpose::STANDARD
            .decode(encoded.as_bytes())
            .map_err(|_| (StatusCode::BAD_REQUEST, "body_base64 is invalid".into()))?;
        if body.len() > 16 * 1024 * 1024 {
            return Err((
                StatusCode::PAYLOAD_TOO_LARGE,
                "egress body exceeds 16 MiB".into(),
            ));
        }
        upstream = upstream.body(body);
    }

    let response = upstream.send().await.map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            format!("egress upstream failed: {e}"),
        )
    })?;
    let status = response.status().as_u16();
    let mut out_headers = BTreeMap::new();
    for (name, value) in response.headers() {
        if let Ok(value) = value.to_str() {
            if !is_hop_or_secret_header(name.as_str()) {
                out_headers.insert(name.to_string(), value.to_string());
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
        "body_base64": base64::engine::general_purpose::STANDARD.encode(body),
    }))
}

/// Resolves `host`, rejects it if any returned address is blocked (unless
/// `allow_private_networks` opts an agent out of that check), and returns
/// the first address to pin the actual connection to. The caller must
/// connect only to this exact address for this request -- resolving `host`
/// again later would reopen the DNS-rebinding gap this function exists to
/// close.
async fn resolve_and_validate_destination(
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

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
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

/// Poll interval while a request waits for an operator decision.
const APPROVAL_POLL: std::time::Duration = std::time::Duration::from_millis(250);

/// Decide what to do with a request to a host that is not on the allowlist.
///
/// In `deny` mode this is a plain refusal. In `ask` mode the request is held
/// while an operator approves or denies it. An approval only lifts the
/// allowlist check: DNS pinning and the private-network gate still run after
/// this returns, so approving a host never permits SSRF into internal ranges.
async fn authorize_unlisted_host(
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
        })),
        prompt: format!("Agent wants to {method} {target}, which is not on its egress allowlist"),
        status: ApprovalStatus::Pending,
        comment: None,
        created_at: chrono::Utc::now(),
        decided_at: None,
        source_seq: None,
        grant_scope: None,
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

    let timeout = std::time::Duration::from_secs(
        manifest
            .egress_approval_timeout_seconds
            .unwrap_or(DEFAULT_EGRESS_APPROVAL_SECONDS),
    );
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        let current = state.store.get_approval(approval.id).await;
        match current.as_ref().map(|r| r.status) {
            Some(ApprovalStatus::Approved) => return Ok(()),
            Some(ApprovalStatus::Denied) => {
                return refuse(format!("egress to {host} was denied by an operator"));
            }
            Some(ApprovalStatus::Expired) | None => {
                return refuse(format!("egress approval for {host} expired"));
            }
            Some(ApprovalStatus::Pending) => {}
        }
        let session_over = state
            .store
            .get_session(session.id)
            .await
            .is_none_or(|s| s.status.is_terminal());
        let timed_out = tokio::time::Instant::now() >= deadline;
        if session_over || timed_out {
            // A decision may land at the same instant; whichever transition
            // reaches the store first wins, and the loser re-reads the result.
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
                        "approval.egress",
                        Some(host.clone()),
                        json!({"approval_id": approval.id, "reason": "expired"}),
                    )
                    .await
                {
                    tracing::error!(%error, "failed to write audit entry");
                }
                return refuse(format!("egress approval for {host} expired"));
            }
            continue;
        }
        tokio::time::sleep(APPROVAL_POLL).await;
    }
}

#[cfg(test)]
mod ask_tests {
    use super::*;
    use crate::{
        audit::AuditPhase,
        config::Config,
        model::{GrantScope, SessionStartMode, SessionStartPolicy, SessionStatus},
    };
    use std::sync::Arc;

    async fn state_and_session() -> (Arc<AppState>, SessionRecord) {
        let root = std::env::temp_dir().join(format!("zyvor-egress-ask-{}", uuid::Uuid::new_v4()));
        let config = Config {
            listen: "127.0.0.1:0".parse().unwrap(),
            egress_listen: "127.0.0.1:0".parse().unwrap(),
            state_dir: root.join("state"),
            snapshot_dir: root.join("snap"),
            fluxvm_url: "http://127.0.0.1:1".into(),
            fluxvm_token: None,
            api_token: None,
            credentials_file: None,
            skill_scopes_file: None,
            egress_advertise_host: None,
            sync_interval_ms: 300,
            guest_start_timeout_secs: 30,
            idle_scan_interval_ms: 1000,
            warm_pool_reconcile_interval_ms: 2000,
            warm_pool_max_create_per_tick: 2,
            warm_pool_claim_stale_secs: 300,
            expiry_scan_interval_ms: 1000,
        };
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
        };
        state.store.save_session(session.clone()).await.unwrap();
        (state, session)
    }

    fn manifest(mode: EgressMode, timeout: Option<u64>) -> AgentManifest {
        AgentManifest {
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
        }
    }

    fn url() -> Url {
        Url::parse("https://Example.com/path?token=secret").unwrap()
    }

    /// Wait until an egress approval for the session is pending, then return it.
    async fn wait_pending(state: &AppState, session: uuid::Uuid) -> ApprovalRecord {
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
}
