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
    /// Host env variable holding the refresh token: one identity for the whole host. Leave empty when `connection` is set.
    #[serde(default)]
    pub refresh_token_env: String,
    /// Makes the credential **per person**: the refresh token is the one that person stored under this connection name
    /// (`PUT /v1/connections/{name}`), and the access token is minted for them on first use. A session with no user cannot use it.
    #[serde(default)]
    pub connection: Option<String>,
    /// Refresh this many seconds before the access token expires. Default 300.
    #[serde(default = "default_refresh_margin")]
    pub refresh_margin_secs: u64,
}

fn default_refresh_margin() -> u64 {
    300
}

/// The kind name for credentials whose secret is a refreshed OAuth access token.
pub const KIND_OAUTH_REFRESH: &str = "oauth-refresh";

fn env_secret(var: &str, required: bool) -> Result<String> {
    match std::env::var(var) {
        Ok(v) if !v.is_empty() => Ok(v),
        _ if !required => Ok(String::new()),
        _ => bail!("host environment variable {var} is not set"),
    }
}

/// The refresh-token grant against the token endpoint. The client id and secret come from host env; `refresh_token` is passed in. The error
/// text carries Google's error code at most, never a secret.
async fn mint_access_token(
    oauth: &OAuthRefresh,
    refresh_token: &str,
    name: &str,
    http: &reqwest::Client,
) -> Result<(String, Duration)> {
    let body = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("grant_type", "refresh_token")
        .append_pair("client_id", &env_secret(&oauth.client_id_env, true)?)
        .append_pair(
            "client_secret",
            &env_secret(&oauth.client_secret_env, false)?,
        )
        .append_pair("refresh_token", refresh_token)
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
    Ok((token.to_string(), lifetime))
}

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
    /// Access tokens minted for one person's connection, by (credential, person).
    user_tokens: Arc<RwLock<HashMap<(String, String), CachedToken>>>,
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
            user_tokens: Arc::default(),
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
        self.resolve_for(name, None)
    }

    /// Like [`resolve`](Self::resolve), for a request made on behalf of `user` (needed for a per-person credential).
    pub fn resolve_for(
        &self,
        name: &str,
        user: Option<&str>,
    ) -> Result<(&CredentialDescriptor, String)> {
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
            let per_person = descriptor
                .oauth
                .as_ref()
                .is_some_and(|o| o.connection.is_some());
            let candidate = if per_person {
                let user = user.with_context(|| {
                    format!("credential '{name}' belongs to a person's own connection and needs a session with a user")
                })?;
                self.user_tokens
                    .read()
                    .ok()
                    .and_then(|t| t.get(&(name.to_string(), user.to_string())).cloned())
            } else {
                self.tokens.read().ok().and_then(|t| t.get(name).cloned())
            };
            let cached = candidate.filter(|t| t.valid_until > Instant::now()).with_context(|| {
                format!("credential '{name}' has no valid access token yet (the last refresh failed, is pending, or the person has not connected)")
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
            .filter(|o| {
                descriptor.kind.eq_ignore_ascii_case(KIND_OAUTH_REFRESH) && o.connection.is_none()
            })
            .with_context(|| {
                format!("credential '{name}' is not a host-wide oauth-refresh credential")
            })?;
        let refresh_token = env_secret(&oauth.refresh_token_env, true)?;
        let (token, lifetime) = mint_access_token(oauth, &refresh_token, name, http).await?;
        self.tokens
            .write()
            .map_err(|_| anyhow::anyhow!("token cache lock poisoned"))?
            .insert(
                name.to_string(),
                CachedToken {
                    value: token,
                    valid_until: Instant::now() + lifetime,
                },
            );
        Ok(lifetime)
    }

    /// Whether `name` is a per-person credential (its refresh token is the person's own connection).
    pub fn is_per_person(&self, name: &str) -> bool {
        self.descriptors
            .get(name)
            .and_then(|d| d.oauth.as_ref())
            .is_some_and(|o| o.connection.is_some())
    }

    /// The connection a per-person credential uses (`google`), if it is one.
    pub fn connection_of(&self, name: &str) -> Option<&str> {
        self.descriptors
            .get(name)?
            .oauth
            .as_ref()?
            .connection
            .as_deref()
    }

    /// Every connection name some credential asks a person to provide, sorted.
    pub fn connection_names(&self) -> Vec<String> {
        let mut names: Vec<String> = self
            .descriptors
            .values()
            .filter_map(|d| d.oauth.as_ref()?.connection.clone())
            .collect();
        names.sort();
        names.dedup();
        names
    }

    /// Makes sure `user` has a valid access token for the per-person credential `name`, minting one from `refresh_token` (the person's own,
    /// from their connection) when there is none or it is about to expire. A missing connection or a refusal is an error that names no secret.
    pub async fn ensure_user_token(
        &self,
        name: &str,
        user: &str,
        refresh_token: Option<&str>,
        http: &reqwest::Client,
    ) -> Result<()> {
        let descriptor = self
            .descriptor(name)
            .with_context(|| format!("credential '{name}' is not configured"))?;
        let oauth = descriptor
            .oauth
            .as_ref()
            .filter(|o| o.connection.is_some())
            .with_context(|| format!("credential '{name}' is not a per-person credential"))?;
        let key = (name.to_string(), user.to_string());
        let margin = Duration::from_secs(oauth.refresh_margin_secs.min(600));
        let fresh = self
            .user_tokens
            .read()
            .map_err(|_| anyhow::anyhow!("token cache lock poisoned"))?
            .get(&key)
            .is_some_and(|t| t.valid_until > Instant::now() + margin);
        if fresh {
            return Ok(());
        }
        let refresh_token = refresh_token.with_context(|| {
            format!(
                "connect your {} account first (credential '{name}' uses your own connection)",
                oauth.connection.as_deref().unwrap_or("account")
            )
        })?;
        let (token, lifetime) = mint_access_token(oauth, refresh_token, name, http).await?;
        self.user_tokens
            .write()
            .map_err(|_| anyhow::anyhow!("token cache lock poisoned"))?
            .insert(
                key,
                CachedToken {
                    value: token,
                    valid_until: Instant::now() + lifetime,
                },
            );
        Ok(())
    }

    /// Drops the cached access tokens of `user` for every credential that uses `connection` (after they disconnect or replace it).
    pub fn forget_user_connection(&self, user: &str, connection: &str) {
        let names: Vec<&String> = self
            .descriptors
            .iter()
            .filter(|(_, d)| {
                d.oauth.as_ref().and_then(|o| o.connection.as_deref()) == Some(connection)
            })
            .map(|(n, _)| n)
            .collect();
        if let Ok(mut cache) = self.user_tokens.write() {
            cache.retain(|(n, u), _| !(u == user && names.iter().any(|x| *x == n)));
        }
    }

    /// Get a first token for every `oauth-refresh` credential (a failure is logged, not fatal:
    /// the credential then fails closed until a later attempt works) and keep refreshing each one
    /// in the background, `refresh_margin_secs` before it expires, with backoff after a failure.
    pub async fn start_oauth_refresh(&self, http: reqwest::Client) {
        let names: Vec<String> = self
            .descriptors
            .iter()
            .filter(|(_, d)| {
                d.kind.eq_ignore_ascii_case(KIND_OAUTH_REFRESH)
                    && d.oauth.as_ref().is_some_and(|o| o.connection.is_none())
            })
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
        self.resolve_for(name, ctx.user_id)
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
        if o.client_id_env.trim().is_empty() {
            bail!("credential '{name}' oauth needs client_id_env");
        }
        match (&o.connection, o.refresh_token_env.trim().is_empty()) {
            (None, true) => bail!("credential '{name}' oauth needs refresh_token_env, or a connection for a per-person credential"),
            (Some(_), false) => bail!("credential '{name}' oauth sets both refresh_token_env and connection; choose one"),
            (Some(c), true) => {
                if c.is_empty() || c.len() > 32 || !c.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-') {
                    bail!("credential '{name}' oauth connection must be 1 to 32 characters of a-z, 0-9 and '-'");
                }
                if d.intercept {
                    bail!("credential '{name}' is per person and cannot be intercepted");
                }
            }
            (None, false) => {}
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

    /// A token endpoint that answers `access_token = "at-" + the refresh token it was given`, and records the refresh tokens seen.
    async fn per_person_token_endpoint() -> (String, Arc<std::sync::Mutex<Vec<String>>>) {
        use axum::{extract::State, routing::post, Router};
        let seen: Arc<std::sync::Mutex<Vec<String>>> = Arc::default();
        let app = Router::new()
            .route(
                "/token",
                post(|State(seen): State<Arc<std::sync::Mutex<Vec<String>>>>, body: String| async move {
                    let rt = url::form_urlencoded::parse(body.as_bytes()).find(|(k, _)| k == "refresh_token").map(|(_, v)| v.to_string()).unwrap_or_default();
                    seen.lock().unwrap().push(rt.clone());
                    axum::Json(serde_json::json!({"access_token": format!("at-{rt}"), "expires_in": 3600}))
                }),
            )
            .with_state(seen.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/token", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (url, seen)
    }

    fn person_vault(token_url: &str) -> CredentialVault {
        std::env::set_var("PP_CLIENT_ID", "cid");
        std::env::set_var("PP_CLIENT_SECRET", "csecret");
        let d: CredentialDescriptor = serde_json::from_value(serde_json::json!({
            "host": "gmail.googleapis.com", "header": "authorization", "kind": "oauth-refresh", "allowed_methods": ["GET"],
            "oauth": {"token_url": token_url, "client_id_env": "PP_CLIENT_ID", "client_secret_env": "PP_CLIENT_SECRET", "connection": "google"}
        }))
        .unwrap();
        validate_descriptor("gmail", &d).unwrap();
        CredentialVault::from_descriptors(HashMap::from([("gmail".to_string(), d)]))
    }

    #[tokio::test]
    async fn a_per_person_credential_uses_each_persons_own_refresh_token_and_caches_it() {
        let (url, seen) = per_person_token_endpoint().await;
        let vault = person_vault(&url);
        let http = reqwest::Client::new();
        assert!(vault.is_per_person("gmail") && vault.connection_of("gmail") == Some("google"));
        assert_eq!(vault.connection_names(), ["google"]);
        // nothing works without a user, or before the person connected
        assert!(
            vault.resolve_for("gmail", None).is_err(),
            "a session with no user"
        );
        assert!(vault.resolve("gmail").is_err(), "and the host-wide path");
        let err = vault
            .ensure_user_token("gmail", "ana", None, &http)
            .await
            .unwrap_err()
            .to_string();
        assert!(err.contains("connect your google account first"), "{err}");
        assert!(
            seen.lock().unwrap().is_empty(),
            "nothing was sent to the token endpoint"
        );
        // two people, two tokens, each minted from their own refresh token
        vault
            .ensure_user_token("gmail", "ana", Some("1//ana-refresh"), &http)
            .await
            .unwrap();
        vault
            .ensure_user_token("gmail", "ben", Some("1//ben-refresh"), &http)
            .await
            .unwrap();
        assert_eq!(
            vault.resolve_for("gmail", Some("ana")).unwrap().1,
            "Bearer at-1//ana-refresh"
        );
        assert_eq!(
            vault.resolve_for("gmail", Some("ben")).unwrap().1,
            "Bearer at-1//ben-refresh"
        );
        assert!(
            vault.resolve_for("gmail", Some("cam")).is_err(),
            "a person who has not connected gets nothing"
        );
        // a second use does not call the endpoint again
        vault
            .ensure_user_token("gmail", "ana", Some("1//ana-refresh"), &http)
            .await
            .unwrap();
        assert_eq!(*seen.lock().unwrap(), ["1//ana-refresh", "1//ben-refresh"]);
        // the policy still applies through authorize_resolve
        let get = reqwest::Method::GET;
        let post = reqwest::Method::POST;
        let ctx = |m, u| ResolveContext {
            host: "gmail.googleapis.com",
            method: m,
            path: "/gmail/v1/users/me/messages",
            port: 443,
            user_id: u,
        };
        assert!(vault
            .authorize_resolve("gmail", &ctx(&get, Some("ana")))
            .is_ok());
        assert!(vault
            .authorize_resolve("gmail", &ctx(&post, Some("ana")))
            .is_err());
        assert!(vault.authorize_resolve("gmail", &ctx(&get, None)).is_err());
    }

    #[tokio::test]
    async fn disconnecting_or_replacing_a_connection_drops_only_that_persons_tokens() {
        let (url, seen) = per_person_token_endpoint().await;
        let vault = person_vault(&url);
        let http = reqwest::Client::new();
        vault
            .ensure_user_token("gmail", "ana", Some("1//ana-refresh"), &http)
            .await
            .unwrap();
        vault
            .ensure_user_token("gmail", "ben", Some("1//ben-refresh"), &http)
            .await
            .unwrap();
        vault.forget_user_connection("ana", "google");
        assert!(
            vault.resolve_for("gmail", Some("ana")).is_err(),
            "ana's token is gone at once"
        );
        assert!(
            vault.resolve_for("gmail", Some("ben")).is_ok(),
            "ben's is not"
        );
        vault.forget_user_connection("ben", "another-connection");
        assert!(
            vault.resolve_for("gmail", Some("ben")).is_ok(),
            "a different connection name leaves it alone"
        );
        // a new refresh token mints a new access token
        vault
            .ensure_user_token("gmail", "ana", Some("1//ana-new"), &http)
            .await
            .unwrap();
        assert_eq!(
            vault.resolve_for("gmail", Some("ana")).unwrap().1,
            "Bearer at-1//ana-new"
        );
        assert_eq!(seen.lock().unwrap().len(), 3);
    }

    #[tokio::test]
    async fn a_refused_refresh_names_the_error_code_and_no_secret() {
        use axum::{routing::post, Router};
        let app = Router::new().route("/token", post(|| async { (axum::http::StatusCode::BAD_REQUEST, axum::Json(serde_json::json!({"error": "invalid_grant", "error_description": "Token has been revoked 1//ana-refresh"}))) }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/token", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let vault = person_vault(&url);
        let err = format!(
            "{:#}",
            vault
                .ensure_user_token(
                    "gmail",
                    "ana",
                    Some("1//ana-refresh"),
                    &reqwest::Client::new()
                )
                .await
                .unwrap_err()
        );
        assert!(
            err.contains("invalid_grant")
                && !err.contains("1//ana-refresh")
                && !err.contains("csecret"),
            "{err}"
        );
        assert!(
            vault.resolve_for("gmail", Some("ana")).is_err(),
            "and it stays closed"
        );
    }

    #[test]
    fn a_descriptor_uses_either_a_host_refresh_token_or_a_persons_connection() {
        let make = |oauth: serde_json::Value, extra: serde_json::Value| {
            let mut d = serde_json::json!({"host": "h", "header": "authorization", "kind": "oauth-refresh", "oauth": oauth});
            for (k, v) in extra.as_object().cloned().unwrap_or_default() {
                d[k] = v;
            }
            serde_json::from_value::<CredentialDescriptor>(d).unwrap()
        };
        let base = |rt: &str, conn: Option<&str>| {
            let mut o = serde_json::json!({"token_url": "https://oauth2.googleapis.com/token", "client_id_env": "A", "client_secret_env": "B", "refresh_token_env": rt});
            if let Some(c) = conn {
                o["connection"] = c.into();
            }
            o
        };
        assert!(
            validate_descriptor("g", &make(base("C", None), serde_json::json!({}))).is_ok(),
            "host-wide"
        );
        assert!(
            validate_descriptor("g", &make(base("", Some("google")), serde_json::json!({})))
                .is_ok(),
            "per person"
        );
        assert!(
            validate_descriptor("g", &make(base("", None), serde_json::json!({}))).is_err(),
            "neither"
        );
        assert!(
            validate_descriptor("g", &make(base("C", Some("google")), serde_json::json!({})))
                .is_err(),
            "both"
        );
        for bad in ["", "Google", "with space", &"x".repeat(33)] {
            assert!(
                validate_descriptor("g", &make(base("", Some(bad)), serde_json::json!({})))
                    .is_err(),
                "{bad:?}"
            );
        }
        assert!(
            validate_descriptor(
                "g",
                &make(
                    base("", Some("google")),
                    serde_json::json!({"intercept": true})
                )
            )
            .is_err(),
            "a per-person credential is not intercepted"
        );
    }

    #[tokio::test]
    async fn the_host_wide_refresher_leaves_per_person_credentials_alone() {
        let (url, seen) = per_person_token_endpoint().await;
        let vault = person_vault(&url);
        vault.start_oauth_refresh(reqwest::Client::new()).await;
        assert!(
            seen.lock().unwrap().is_empty(),
            "no host refresh token exists for a per-person credential"
        );
    }
}
