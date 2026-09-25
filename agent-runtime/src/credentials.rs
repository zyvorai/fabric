// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::Path};

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
        Ok(Self { descriptors })
    }

    /// A vault of the given descriptors (used by tests and embedders).
    pub fn from_descriptors(descriptors: HashMap<String, CredentialDescriptor>) -> Self {
        Self { descriptors }
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
        let value = std::env::var(&descriptor.env)
            .with_context(|| format!("host environment variable {} is not set", descriptor.env))?;
        if value.is_empty() {
            bail!("host environment variable {} is empty", descriptor.env);
        }
        Ok((descriptor, format!("{}{}", descriptor.prefix, value)))
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
    if !d.kind.eq_ignore_ascii_case("fabric") && d.env.trim().is_empty() {
        bail!("credential '{name}' requires env unless kind is fabric");
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
}
