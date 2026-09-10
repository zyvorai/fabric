// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

use crate::{
    credentials::{credential_allows_request, host_matches, CredentialVault},
    model::EgressRequest,
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
    match proxy_inner(&state, &headers, request).await {
        Ok(value) => (StatusCode::OK, Json(value)).into_response(),
        Err((status, message)) => (status, Json(json!({"error": message}))).into_response(),
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
        .map_err(|_| (StatusCode::FORBIDDEN, "pinned agent deployment no longer exists".into()))?;

    let url = Url::parse(&request.url)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("invalid egress URL: {e}")))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err((StatusCode::BAD_REQUEST, "only http and https egress is supported".into()));
    }
    let host = url
        .host_str()
        .ok_or((StatusCode::BAD_REQUEST, "egress URL has no host".into()))?;
    if !agent.manifest.egress_allow_hosts.iter().any(|h| host_matches(h, host)) {
        return Err((StatusCode::FORBIDDEN, format!("host {host} is not in this agent's egress allowlist")));
    }

    if !agent.manifest.allow_private_networks {
        reject_private_destination(host, url.port_or_known_default().unwrap_or(443)).await?;
    }

    let method = request
        .method
        .parse::<reqwest::Method>()
        .map_err(|_| (StatusCode::BAD_REQUEST, "invalid HTTP method".into()))?;
    let mut upstream = state.egress_http.request(method.clone(), url.clone());
    for (name, value) in request.headers {
        if is_hop_or_secret_header(&name) || state.credentials.is_injection_header(&name) {
            continue;
        }
        let header_name = reqwest::header::HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| (StatusCode::BAD_REQUEST, format!("invalid request header name: {name}")))?;
        let header_value = reqwest::header::HeaderValue::from_str(&value)
            .map_err(|_| (StatusCode::BAD_REQUEST, format!("invalid request header value for {name}")))?;
        upstream = upstream.header(header_name, header_value);
    }

    if let Some(name) = request.credential.as_deref() {
        if !agent.manifest.credentials.iter().any(|c| c == name) {
            return Err((StatusCode::FORBIDDEN, format!("credential '{name}' is not granted to this agent")));
        }
        if url.scheme() != "https" {
            return Err((StatusCode::FORBIDDEN, "credentials are injected only into HTTPS requests".into()));
        }
        let (descriptor, secret) = state
            .credentials
            .resolve(name)
            .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;
        if !host_matches(&descriptor.host, host) {
            return Err((StatusCode::FORBIDDEN, format!("credential '{name}' cannot be used for host {host}")));
        }
        let port = url.port_or_known_default().unwrap_or(443);
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
        let header_name = reqwest::header::HeaderName::from_bytes(descriptor.header.as_bytes())
            .map_err(|_| (StatusCode::BAD_GATEWAY, "configured credential header is invalid".into()))?;
        let header_value = reqwest::header::HeaderValue::from_str(&secret)
            .map_err(|_| (StatusCode::BAD_GATEWAY, "configured credential value cannot be represented as an HTTP header".into()))?;
        upstream = upstream.header(header_name, header_value);
    }

    if let Some(encoded) = request.body_base64 {
        let body = base64::engine::general_purpose::STANDARD
            .decode(encoded.as_bytes())
            .map_err(|_| (StatusCode::BAD_REQUEST, "body_base64 is invalid".into()))?;
        if body.len() > 16 * 1024 * 1024 {
            return Err((StatusCode::PAYLOAD_TOO_LARGE, "egress body exceeds 16 MiB".into()));
        }
        upstream = upstream.body(body);
    }

    let response = upstream
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("egress upstream failed: {e}")))?;
    let status = response.status().as_u16();
    let mut out_headers = BTreeMap::new();
    for (name, value) in response.headers() {
        if let Ok(value) = value.to_str() {
            if !is_hop_or_secret_header(name.as_str()) {
                out_headers.insert(name.to_string(), value.to_string());
            }
        }
    }
    let body = response
        .bytes()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("reading upstream body: {e}")))?;
    if body.len() > 16 * 1024 * 1024 {
        return Err((StatusCode::BAD_GATEWAY, "upstream response exceeds 16 MiB".into()));
    }

    tracing::info!(session = %id, agent = %session.agent, %host, credential = ?request.credential, status, "agent egress");
    Ok(json!({
        "status": status,
        "headers": out_headers,
        "body_base64": base64::engine::general_purpose::STANDARD.encode(body),
    }))
}


async fn reject_private_destination(host: &str, port: u16) -> Result<(), (StatusCode, String)> {
    let addresses = tokio::net::lookup_host((host, port))
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("DNS lookup failed for {host}: {e}")))?;
    let mut saw = false;
    for address in addresses {
        saw = true;
        let ip = address.ip();
        let blocked = match ip {
            std::net::IpAddr::V4(v4) => v4.is_private() || v4.is_loopback() || v4.is_link_local() || v4.is_multicast() || v4.is_unspecified(),
            std::net::IpAddr::V6(v6) => v6.is_loopback() || v6.is_unique_local() || v6.is_unicast_link_local() || v6.is_multicast() || v6.is_unspecified(),
        };
        if blocked {
            return Err((StatusCode::FORBIDDEN, format!("destination {host} resolves to blocked private/link-local address {ip}")));
        }
    }
    if !saw {
        return Err((StatusCode::BAD_GATEWAY, format!("DNS lookup returned no addresses for {host}")));
    }
    Ok(())
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
        "host" | "authorization" | "proxy-authorization" | "content-length" | "connection" | "transfer-encoding"
    )
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() { return false; }
    let mut diff = 0u8;
    for (&x, &y) in a.iter().zip(b) { diff |= x ^ y; }
    diff == 0
}

#[allow(dead_code)]
fn _assert_send_sync(_: &CredentialVault) {}
