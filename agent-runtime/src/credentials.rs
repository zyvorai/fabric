// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, RwLock},
    time::{Duration, Instant},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialDescriptor {
    /// Exact host or parent suffix that may receive this credential.
    pub host: String,
    /// Header injected by the host broker, e.g. `authorization` or `x-api-key`.
    pub header: String,
    /// Host environment variable containing the secret. Its value is never persisted.
    /// For `kind=fabric`, leave empty — no external provider key is required.
    #[serde(default)]
    pub env: String,
    #[serde(default)]
    pub prefix: String,
    /// Optional HTTP method allowlist for this credential. Empty means any method.
    #[serde(default)]
    pub allowed_methods: Vec<String>,
    /// Optional URL path-prefix allowlist. Empty means any path on the bound host.
    #[serde(default)]
    pub path_prefixes: Vec<String>,
    /// Additional HTTPS ports that may receive this credential. Port 443 is always allowed.
    /// For `kind=fabric`, non-TLS Maglev ports (e.g. 8000) may be listed.
    #[serde(default)]
    pub allowed_ports: Vec<u16>,
    /// `provider` (default) injects a host env secret over HTTPS.
    /// `fabric` routes to a Fabric InferenceEndpoint VIP with no external API key
    /// (optional `FABRIC_AI_API_KEY` when endpoint keys are enabled).
    #[serde(default = "default_kind")]
    pub kind: String,
    /// Methods (or `*` for any) that need a human decision before this credential
    /// is used, e.g. `["POST"]` for a mail-sending or checkout credential.
    #[serde(default)]
    pub requires_approval: Vec<String>,
    /// Session `user_id` allowlist. Empty means any user (including no user_id).
    #[serde(default)]
    pub allowed_users: Vec<String>,
    /// Let the CONNECT proxy terminate TLS for this credential's host so a
    /// per-session surrogate token the agent holds can be swapped for the real
    /// secret in flight. Needs `ZYVOR_AGENT_MITM_CA_DIR`; see `mitm`.
    #[serde(default)]
    pub intercept: bool,
    /// What such an approval is called to the operator: `send` (default) or `purchase`.
    #[serde(default)]
    pub approval_kind: Option<String>,
    /// Approvals for this credential must be signed by the user's enrolled phone key when a user
    /// token decides them (see `devices.rs`). The operator token can always decide unsigned.
    #[serde(default)]
    pub require_device_signature: bool,
    /// For `kind=oauth-refresh`: how the host mints short-lived access tokens from a long-lived
    /// refresh token (e.g. Google). The access token is what gets injected; the refresh token,
    /// client id and client secret stay in host env and never reach a cell.
    #[serde(default)]
    pub oauth: Option<OAuthRefresh>,
}

/// Token-endpoint settings for `kind=oauth-refresh` (RFC 6749 section 6, refresh-token grant).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthRefresh {
    /// `https` token endpoint, e.g. `https://oauth2.googleapis.com/token`. Plain `http` is
    /// accepted only for a loopback address (tests, local fixtures).
    pub token_url: String,
    /// Host env variable holding the OAuth client id.
    pub client_id_env: String,
    /// Host env variable holding the OAuth client secret (empty env value means a public client).
    pub client_secret_env: String,
    /// Host env variable holding the refresh token.
    pub refresh_token_env: String,
    /// Refresh this many seconds before the access token expires. Default 300.
    #[serde(default = "default_refresh_margin")]
    pub refresh_margin_secs: u64,
}

fn default_refresh_margin() -> u64 {
    300
}

/// The kind name for credentials whose secret is a refreshed OAuth access token.
pub const KIND_OAUTH_REFRESH: &str = "oauth-refresh";

#[derive(Debug, Clone)]
struct CachedToken {
    value: String,
    valid_until: Instant,
}

/// The stand-in for credential `name` that a session's agent holds. It is derived
/// from the session's capability, so it is stable for the session, different for
/// every session, and worthless anywhere but through this runtime.
pub fn surrogate(capability: &str, name: &str) -> String {
    let mac = crate::schedules::hmac_sha256(capability.as_bytes(), name.as_bytes());
    format!("zy_sur_{}", &hex::encode(mac)[..32])
}

impl CredentialDescriptor {
    /// The approval kind this request needs, if its method requires one.
    pub fn approval_kind_for(
        &self,
        method: &reqwest::Method,
    ) -> Option<crate::model::ApprovalKind> {
        let needed = self
            .requires_approval
            .iter()
            .any(|m| m == "*" || m.eq_ignore_ascii_case(method.as_str()));
        needed.then_some(match self.approval_kind.as_deref() {
            Some("purchase") => crate::model::ApprovalKind::Purchase,
            _ => crate::model::ApprovalKind::Send,
        })
    }
}

fn default_kind() -> String {
    "provider".into()
}

#[derive(Debug, Clone, Default)]
pub struct CredentialVault {
    descriptors: HashMap<String, CredentialDescriptor>,
    /// Current access tokens of `oauth-refresh` credentials. Shared by clones of the vault so
    /// the refresher task and request handlers see the same values. Never persisted or logged.
    tokens: Arc<RwLock<HashMap<String, CachedToken>>>,
}

impl CredentialVault {
    pub async fn load(path: Option<&Path>) -> Result<Self> {
        let Some(path) = path else {
            return Ok(Self::default());
        };
        let raw = tokio::fs::read(path)
            .await
            .with_context(|| format!("reading credentials descriptor file {}", path.display()))?;
        let descriptors = serde_json::from_slice::<HashMap<String, CredentialDescriptor>>(&raw)
            .context("decoding credentials descriptor JSON")?;
        for (name, d) in &descriptors {
            validate_descriptor(name, d)?;
        }
        Ok(Self::from_descriptors(descriptors))
    }

    /// A vault of the given descriptors (used by tests and embedders).
    pub fn from_descriptors(descriptors: HashMap<String, CredentialDescriptor>) -> Self {
        Self {
            descriptors,
            tokens: Arc::default(),
        }
    }

    pub fn descriptor(&self, name: &str) -> Option<&CredentialDescriptor> {
        self.descriptors.get(name)
    }

    /// Descriptor names only (never secret values).
    pub fn names(&self) -> Vec<String> {
        let mut names: Vec<_> = self.descriptors.keys().cloned().collect();
        names.sort();
        names
    }

    pub fn is_injection_header(&self, header: &str) -> bool {
        self.descriptors
            .values()
            .any(|d| d.header.eq_ignore_ascii_case(header))
    }

    /// Names, among `granted`, of credentials whose host is `host` and that ask to
    /// be intercepted.
    pub fn intercepted_for<'a>(&self, granted: &'a [String], host: &str) -> Vec<&'a str> {
        granted
            .iter()
            .filter(|name| {
                self.descriptor(name)
                    .is_some_and(|d| d.intercept && host_matches(&d.host, host))
            })
            .map(String::as_str)
            .collect()
    }

    pub fn resolve(&self, name: &str) -> Result<(&CredentialDescriptor, String)> {
        let descriptor = self.descriptor(name).with_context(|| {
            format!("credential '{name}' is not configured on this Fabric host")
        })?;
        if descriptor.kind.eq_ignore_ascii_case("fabric") {
            // Optional endpoint API key; empty means no Authorization header.
            let value = std::env::var("FABRIC_AI_API_KEY").unwrap_or_default();
            if value.is_empty() {
                return Ok((descriptor, String::new()));
            }
            return Ok((descriptor, format!("{}{}", descriptor.prefix, value)));
        }
        if descriptor.kind.eq_ignore_ascii_case(KIND_OAUTH_REFRESH) {
            let cached = self
                .tokens
                .read()
                .ok()
                .and_then(|t| t.get(name).cloned())
                .filter(|t| t.valid_until > Instant::now())
                .with_context(|| {
                    format!("credential '{name}' has no valid access token yet (the last refresh failed or is pending)")
                })?;
            let prefix = if descriptor.prefix.is_empty() {
                "Bearer "
            } else {
                descriptor.prefix.as_str()
            };
            return Ok((descriptor, format!("{prefix}{}", cached.value)));
        }
        let value = std::env::var(&descriptor.env)
            .with_context(|| format!("host environment variable {} is not set", descriptor.env))?;
        if value.is_empty() {
            bail!("host environment variable {} is empty", descriptor.env);
        }
        Ok((descriptor, format!("{}{}", descriptor.prefix, value)))
    }

    /// Mint an access token for the `oauth-refresh` credential `name` now and cache it. Returns
    /// how long the new token is valid. Nothing secret is put in the error text.
    pub async fn refresh_now(&self, name: &str, http: &reqwest::Client) -> Result<Duration> {
        let descriptor = self
            .descriptor(name)
            .with_context(|| format!("credential '{name}' is not configured"))?;
        let oauth = descriptor
            .oauth
            .as_ref()
            .filter(|_| descriptor.kind.eq_ignore_ascii_case(KIND_OAUTH_REFRESH))
            .with_context(|| format!("credential '{name}' is not an oauth-refresh credential"))?;
        let env = |var: &str, required: bool| -> Result<String> {
            match std::env::var(var) {
                Ok(v) if !v.is_empty() => Ok(v),
                _ if !required => Ok(String::new()),
                _ => bail!("host environment variable {var} is not set"),
            }
        };
        let body = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("grant_type", "refresh_token")
            .append_pair("client_id", &env(&oauth.client_id_env, true)?)
            .append_pair("client_secret", &env(&oauth.client_secret_env, false)?)
            .append_pair("refresh_token", &env(&oauth.refresh_token_env, true)?)
            .finish();
        let response = http
            .post(&oauth.token_url)
            .header("content-type", "application/x-www-form-urlencoded")
            .header("accept", "application/json")
            .body(body)
            .timeout(Duration::from_secs(20))
            .send()
            .await
            .with_context(|| format!("token endpoint for '{name}' is unreachable"))?;
        let status = response.status();
        let json: serde_json::Value = response.json().await.with_context(|| {
            format!("token endpoint for '{name}' returned status {status} with a non-JSON body")
        })?;
        if !status.is_success() {
            // The `error` code (e.g. invalid_grant) is safe to show; the description can be long.
            let code = json
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            bail!("token endpoint for '{name}' refused the refresh: status {status}, error {code}");
        }
        let token = json
            .get("access_token")
            .and_then(|v| v.as_str())
            .filter(|t| !t.is_empty())
            .with_context(|| format!("token endpoint for '{name}' returned no access_token"))?;
        let lifetime = Duration::from_secs(
            json.get("expires_in")
                .and_then(|v| v.as_u64())
                .unwrap_or(3600)
                .max(1),
        );
        self.tokens
            .write()
            .map_err(|_| anyhow::anyhow!("token cache lock poisoned"))?
            .insert(
                name.to_string(),
                CachedToken {
                    value: token.to_string(),
                    valid_until: Instant::now() + lifetime,
                },
            );
        Ok(lifetime)
    }

    /// Get a first token for every `oauth-refresh` credential (a failure is logged, not fatal:
    /// the credential then fails closed until a later attempt works) and keep refreshing each one
    /// in the background, `refresh_margin_secs` before it expires, with backoff after a failure.
    pub async fn start_oauth_refresh(&self, http: reqwest::Client) {
        let names: Vec<String> = self
            .descriptors
            .iter()
            .filter(|(_, d)| d.kind.eq_ignore_ascii_case(KIND_OAUTH_REFRESH))
            .map(|(n, _)| n.clone())
            .collect();
        for name in names {
            let margin = self
                .descriptors
                .get(&name)
                .and_then(|d| d.oauth.as_ref())
                .map_or(300, |o| o.refresh_margin_secs);
            let first =
                tokio::time::timeout(Duration::from_secs(25), self.refresh_now(&name, &http))
                    .await
                    .unwrap_or_else(|_| Err(anyhow::anyhow!("timed out")));
            match &first {
                Ok(life) => {
                    tracing::info!(credential = %name, expires_in = life.as_secs(), "oauth access token obtained")
                }
                Err(error) => {
                    tracing::warn!(credential = %name, %error, "oauth token refresh failed; the credential fails closed until it works")
                }
            }
            let vault = self.clone();
            let http = http.clone();
            tokio::spawn(async move {
                let mut backoff = Duration::from_secs(15);
                let mut wait = match first {
                    Ok(life) => life
                        .saturating_sub(Duration::from_secs(margin))
                        .max(Duration::from_secs(30)),
                    Err(_) => backoff,
                };
                loop {
                    tokio::time::sleep(wait).await;
                    match vault.refresh_now(&name, &http).await {
                        Ok(life) => {
                            backoff = Duration::from_secs(15);
                            wait = life
                                .saturating_sub(Duration::from_secs(margin))
                                .max(Duration::from_secs(30));
                        }
                        Err(error) => {
                            tracing::warn!(credential = %name, %error, "oauth token refresh failed; retrying");
                            wait = backoff;
                            backoff = (backoff * 2).min(Duration::from_secs(300));
                        }
                    }
                }
            });
        }
    }

    /// Credential authority (Keep 0.1): resolve a secret only when the request
    /// matches the descriptor allowlist for host / method / path / port / user.
    /// Secrets still come from host env — user-held unwrap is Keep 0.2.
    pub fn authorize_resolve(
        &self,
        name: &str,
        ctx: &ResolveContext<'_>,
    ) -> Result<(&CredentialDescriptor, String)> {
        let descriptor = self.descriptor(name).with_context(|| {
            format!("credential '{name}' is not configured on this Fabric host")
        })?;
        if !host_matches(&descriptor.host, ctx.host) {
            bail!("credential '{name}' cannot be used for host {}", ctx.host);
        }
        if !credential_allows_request(descriptor, ctx.method, ctx.path, ctx.port) {
            bail!(
                "credential '{name}' policy denies {} {} on port {}",
                ctx.method.as_str(),
                ctx.path,
                ctx.port
            );
        }
        if !descriptor.allowed_users.is_empty() {
            let Some(uid) = ctx.user_id.filter(|u| !u.is_empty()) else {
                bail!("credential '{name}' requires a session user_id");
            };
            if !descriptor
                .allowed_users
                .iter()
                .any(|u| u.eq_ignore_ascii_case(uid))
            {
                bail!("credential '{name}' is not allowed for user '{uid}'");
            }
        }
        self.resolve(name)
    }
}

/// Request context for [`CredentialVault::authorize_resolve`].
#[derive(Debug, Clone, Copy)]
pub struct ResolveContext<'a> {
    pub host: &'a str,
    pub method: &'a reqwest::Method,
    pub path: &'a str,
    pub port: u16,
    pub user_id: Option<&'a str>,
}

fn validate_descriptor(name: &str, d: &CredentialDescriptor) -> Result<()> {
    if name.is_empty() || d.host.trim().is_empty() || d.header.trim().is_empty() {
        bail!("credential descriptors require non-empty name, host and header");
    }
    if d.kind.eq_ignore_ascii_case(KIND_OAUTH_REFRESH) {
        let Some(o) = &d.oauth else {
            bail!("credential '{name}' has kind oauth-refresh and needs an oauth block");
        };
        let url = url::Url::parse(&o.token_url)
            .with_context(|| format!("credential '{name}' has an invalid oauth token_url"))?;
        let loopback = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
        if url.scheme() != "https" && !(url.scheme() == "http" && loopback) {
            bail!("credential '{name}' oauth token_url must be https (http only for loopback)");
        }
        if o.client_id_env.trim().is_empty() || o.refresh_token_env.trim().is_empty() {
            bail!("credential '{name}' oauth needs client_id_env and refresh_token_env");
        }
    } else if !d.kind.eq_ignore_ascii_case("fabric") && d.env.trim().is_empty() {
        bail!("credential '{name}' requires env unless kind is fabric or oauth-refresh");
    }
    if d.header.eq_ignore_ascii_case("host") || d.header.eq_ignore_ascii_case("content-length") {
        bail!("credential '{name}' may not inject the {} header", d.header);
    }
    reqwest::header::HeaderName::from_bytes(d.header.as_bytes())
        .with_context(|| format!("credential '{name}' has an invalid HTTP header name"))?;
    for method in &d.allowed_methods {
        reqwest::Method::from_bytes(method.as_bytes()).with_context(|| {
            format!("credential '{name}' has invalid allowed method '{method}'")
        })?;
    }
    for method in &d.requires_approval {
        if method != "*" {
            reqwest::Method::from_bytes(method.as_bytes()).with_context(|| {
                format!("credential '{name}' has invalid requires_approval method '{method}'")
            })?;
        }
    }
    if let Some(kind) = d.approval_kind.as_deref() {
        if !matches!(kind, "send" | "purchase") {
            bail!("credential '{name}' approval_kind must be 'send' or 'purchase'");
        }
    }
    if d.path_prefixes.iter().any(|p| !p.starts_with('/')) {
        bail!("credential '{name}' path_prefixes must start with '/'");
    }
    if d.allowed_ports.contains(&0) {
        bail!("credential '{name}' allowed_ports may not contain 0");
    }
    Ok(())
}

pub fn credential_allows_request(
    descriptor: &CredentialDescriptor,
    method: &reqwest::Method,
    path: &str,
    port: u16,
) -> bool {
    let method_ok = descriptor.allowed_methods.is_empty()
        || descriptor
            .allowed_methods
            .iter()
            .any(|m| m.eq_ignore_ascii_case(method.as_str()));
    let path_ok = descriptor.path_prefixes.is_empty()
        || descriptor
            .path_prefixes
            .iter()
            .any(|prefix| path.starts_with(prefix));
    let port_ok = port == 443
        || port == 80
        || descriptor.allowed_ports.contains(&port)
        || (descriptor.kind.eq_ignore_ascii_case("fabric")
            && descriptor.allowed_ports.is_empty()
            && (port == 8000 || port == 8080));
    method_ok && path_ok && port_ok
}

pub fn host_matches(pattern: &str, host: &str) -> bool {
    let pattern = pattern
        .trim()
        .trim_start_matches('.')
        .trim_end_matches('.')
        .to_ascii_lowercase();
    let host = host.trim().trim_end_matches('.').to_ascii_lowercase();
    host == pattern || host.ends_with(&format!(".{pattern}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_suffix_is_boundary_safe() {
        assert!(host_matches("openai.com", "api.openai.com"));
        assert!(host_matches("api.openai.com", "api.openai.com"));
        assert!(!host_matches("openai.com", "evilopenai.com"));
    }

    #[test]
    fn credential_policy_checks_method_path_and_port() {
        let d = CredentialDescriptor {
            host: "api.example.com".into(),
            header: "authorization".into(),
            env: "EXAMPLE_KEY".into(),
            prefix: "Bearer ".into(),
            allowed_methods: vec!["POST".into()],
            path_prefixes: vec!["/v1/".into()],
            allowed_ports: vec![8443],
            kind: "provider".into(),
            requires_approval: vec![],
            allowed_users: vec![],
            approval_kind: None,
            intercept: false,
            require_device_signature: false,
            oauth: None,
        };
        assert!(credential_allows_request(
            &d,
            &reqwest::Method::POST,
            "/v1/run",
            443
        ));
        assert!(credential_allows_request(
            &d,
            &reqwest::Method::POST,
            "/v1/run",
            8443
        ));
        assert!(!credential_allows_request(
            &d,
            &reqwest::Method::GET,
            "/v1/run",
            443
        ));
        assert!(!credential_allows_request(
            &d,
            &reqwest::Method::POST,
            "/admin",
            443
        ));
        assert!(!credential_allows_request(
            &d,
            &reqwest::Method::POST,
            "/v1/run",
            9443
        ));
    }

    fn gated(methods: &[&str], kind: Option<&str>) -> CredentialDescriptor {
        serde_json::from_value(serde_json::json!({
            "host": "mail.example", "header": "authorization", "env": "K",
            "requires_approval": methods, "approval_kind": kind,
        }))
        .unwrap()
    }

    #[test]
    fn approval_kind_follows_the_method_list() {
        use crate::model::ApprovalKind;
        let d = gated(&["POST", "delete"], None);
        assert_eq!(
            d.approval_kind_for(&reqwest::Method::POST),
            Some(ApprovalKind::Send)
        );
        assert_eq!(
            d.approval_kind_for(&reqwest::Method::DELETE),
            Some(ApprovalKind::Send)
        );
        assert_eq!(d.approval_kind_for(&reqwest::Method::GET), None);
        let any = gated(&["*"], Some("purchase"));
        assert_eq!(
            any.approval_kind_for(&reqwest::Method::GET),
            Some(ApprovalKind::Purchase)
        );
        assert_eq!(
            gated(&[], Some("purchase")).approval_kind_for(&reqwest::Method::POST),
            None
        );
    }

    #[test]
    fn descriptor_validation_rejects_bad_approval_settings() {
        assert!(validate_descriptor("c", &gated(&["POST", "*"], Some("send"))).is_ok());
        assert!(validate_descriptor("c", &gated(&["PO ST"], None)).is_err());
        assert!(validate_descriptor("c", &gated(&["POST"], Some("wire"))).is_err());
    }

    #[test]
    fn authorize_resolve_checks_user_allowlist() {
        std::env::set_var("AUTH_TEST_KEY", "secret-value");
        let mut map = HashMap::new();
        map.insert(
            "mail".into(),
            serde_json::from_value::<CredentialDescriptor>(serde_json::json!({
                "host": "mail.example",
                "header": "authorization",
                "env": "AUTH_TEST_KEY",
                "allowed_users": ["alice"],
            }))
            .unwrap(),
        );
        let vault = CredentialVault::from_descriptors(map);
        let method = reqwest::Method::GET;
        let denied = vault.authorize_resolve(
            "mail",
            &ResolveContext {
                host: "mail.example",
                method: &method,
                path: "/",
                port: 443,
                user_id: Some("bob"),
            },
        );
        assert!(denied.is_err());
        let ok = vault
            .authorize_resolve(
                "mail",
                &ResolveContext {
                    host: "mail.example",
                    method: &method,
                    path: "/",
                    port: 443,
                    user_id: Some("alice"),
                },
            )
            .unwrap();
        assert!(ok.1.contains("secret-value"));
        std::env::remove_var("AUTH_TEST_KEY");
    }

    /// A token endpoint on loopback that records each form body and answers with `reply`.
    async fn fake_token_endpoint(
        status: u16,
        reply: serde_json::Value,
    ) -> (String, Arc<std::sync::Mutex<Vec<String>>>) {
        use axum::{extract::State, http::StatusCode, routing::post, Router};
        type Seen = Arc<std::sync::Mutex<Vec<String>>>;
        let seen: Seen = Arc::default();
        let app = Router::new()
            .route(
                "/token",
                post(
                    |State((seen, status, reply)): State<(Seen, u16, serde_json::Value)>,
                     body: String| async move {
                        seen.lock().unwrap().push(body);
                        (StatusCode::from_u16(status).unwrap(), axum::Json(reply))
                    },
                ),
            )
            .with_state((seen.clone(), status, reply));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/token", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (url, seen)
    }

    fn oauth_vault(token_url: &str, tag: &str) -> CredentialVault {
        std::env::set_var(format!("OA_{tag}_ID"), "client-id-1");
        std::env::set_var(format!("OA_{tag}_SECRET"), "client-secret-1");
        std::env::set_var(format!("OA_{tag}_REFRESH"), "refresh-token-1");
        let d: CredentialDescriptor = serde_json::from_value(serde_json::json!({
            "host": "gmail.googleapis.com", "header": "authorization", "kind": "oauth-refresh",
            "allowed_methods": ["GET"],
            "oauth": {
                "token_url": token_url,
                "client_id_env": format!("OA_{tag}_ID"),
                "client_secret_env": format!("OA_{tag}_SECRET"),
                "refresh_token_env": format!("OA_{tag}_REFRESH"),
            }
        }))
        .unwrap();
        validate_descriptor("google", &d).unwrap();
        CredentialVault::from_descriptors(HashMap::from([("google".to_string(), d)]))
    }

    #[tokio::test]
    async fn oauth_refresh_mints_caches_and_injects_a_bearer_token() {
        let (url, seen) = fake_token_endpoint(
            200,
            serde_json::json!({"access_token": "ya29.fresh", "expires_in": 3599, "token_type": "Bearer"}),
        )
        .await;
        let vault = oauth_vault(&url, "OK");
        // Fails closed before the first refresh.
        assert!(vault.resolve("google").is_err());
        let life = vault
            .refresh_now("google", &reqwest::Client::new())
            .await
            .unwrap();
        assert_eq!(life.as_secs(), 3599);
        let (_, value) = vault.resolve("google").unwrap();
        assert_eq!(value, "Bearer ya29.fresh");
        let body = seen.lock().unwrap()[0].clone();
        assert!(body.contains("grant_type=refresh_token"));
        assert!(body.contains("client_id=client-id-1"));
        assert!(body.contains("client_secret=client-secret-1"));
        assert!(body.contains("refresh_token=refresh-token-1"));
        // The policy checks still apply through authorize_resolve.
        let get = reqwest::Method::GET;
        let post = reqwest::Method::POST;
        let ctx = |m| ResolveContext {
            host: "gmail.googleapis.com",
            method: m,
            path: "/gmail/v1/users/me/messages",
            port: 443,
            user_id: None,
        };
        assert!(vault.authorize_resolve("google", &ctx(&get)).is_ok());
        assert!(vault.authorize_resolve("google", &ctx(&post)).is_err());
    }

    #[tokio::test]
    async fn oauth_refresh_failure_keeps_the_credential_closed_and_leaks_nothing() {
        let (url, _) = fake_token_endpoint(
            400,
            serde_json::json!({"error": "invalid_grant", "error_description": "Token has been revoked. refresh-token-1"}),
        )
        .await;
        let vault = oauth_vault(&url, "BAD");
        let error = vault
            .refresh_now("google", &reqwest::Client::new())
            .await
            .unwrap_err();
        let text = format!("{error:#}");
        assert!(text.contains("invalid_grant"), "{text}");
        assert!(
            !text.contains("refresh-token-1") && !text.contains("client-secret-1"),
            "{text}"
        );
        assert!(vault.resolve("google").is_err());
    }

    #[tokio::test]
    async fn oauth_token_stops_being_used_after_it_expires() {
        let (url, _) = fake_token_endpoint(
            200,
            serde_json::json!({"access_token": "short", "expires_in": 1}),
        )
        .await;
        let vault = oauth_vault(&url, "EXP");
        vault
            .refresh_now("google", &reqwest::Client::new())
            .await
            .unwrap();
        assert!(vault.resolve("google").is_ok());
        tokio::time::sleep(Duration::from_millis(1150)).await;
        assert!(vault.resolve("google").is_err());
    }

    #[tokio::test]
    async fn background_refresher_gets_the_first_token_at_startup() {
        let (url, _) = fake_token_endpoint(
            200,
            serde_json::json!({"access_token": "boot", "expires_in": 3600}),
        )
        .await;
        let vault = oauth_vault(&url, "BOOT");
        vault.start_oauth_refresh(reqwest::Client::new()).await;
        assert_eq!(vault.resolve("google").unwrap().1, "Bearer boot");
    }

    #[test]
    fn oauth_descriptor_validation() {
        let make =
            |v: serde_json::Value| serde_json::from_value::<CredentialDescriptor>(v).unwrap();
        let base = |oauth: serde_json::Value| {
            make(serde_json::json!({
                "host": "gmail.googleapis.com", "header": "authorization", "kind": "oauth-refresh", "oauth": oauth,
            }))
        };
        let ok = serde_json::json!({"token_url": "https://oauth2.googleapis.com/token", "client_id_env": "A", "client_secret_env": "B", "refresh_token_env": "C"});
        assert!(validate_descriptor("g", &base(ok.clone())).is_ok());
        let mut plain_http = ok.clone();
        plain_http["token_url"] = "http://oauth2.example/token".into();
        assert!(validate_descriptor("g", &base(plain_http)).is_err());
        let mut loopback = ok.clone();
        loopback["token_url"] = "http://127.0.0.1:9/token".into();
        assert!(validate_descriptor("g", &base(loopback)).is_ok());
        let mut no_refresh = ok.clone();
        no_refresh["refresh_token_env"] = "".into();
        assert!(validate_descriptor("g", &base(no_refresh)).is_err());
        let missing = make(
            serde_json::json!({"host": "h", "header": "authorization", "kind": "oauth-refresh"}),
        );
        assert!(validate_descriptor("g", &missing).is_err());
    }
}
