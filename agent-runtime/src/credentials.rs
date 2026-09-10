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
    pub env: String,
    #[serde(default)]
    pub prefix: String,
}

#[derive(Debug, Clone, Default)]
pub struct CredentialVault {
    descriptors: HashMap<String, CredentialDescriptor>,
}

impl CredentialVault {
    pub async fn load(path: Option<&Path>) -> Result<Self> {
        let Some(path) = path else { return Ok(Self::default()); };
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

    pub fn descriptor(&self, name: &str) -> Option<&CredentialDescriptor> {
        self.descriptors.get(name)
    }

    pub fn is_injection_header(&self, header: &str) -> bool {
        self.descriptors.values().any(|d| d.header.eq_ignore_ascii_case(header))
    }

    pub fn resolve(&self, name: &str) -> Result<(&CredentialDescriptor, String)> {
        let descriptor = self
            .descriptor(name)
            .with_context(|| format!("credential '{name}' is not configured on this Fabric host"))?;
        let value = std::env::var(&descriptor.env)
            .with_context(|| format!("host environment variable {} is not set", descriptor.env))?;
        if value.is_empty() {
            bail!("host environment variable {} is empty", descriptor.env);
        }
        Ok((descriptor, format!("{}{}", descriptor.prefix, value)))
    }
}

fn validate_descriptor(name: &str, d: &CredentialDescriptor) -> Result<()> {
    if name.is_empty() || d.host.trim().is_empty() || d.header.trim().is_empty() || d.env.trim().is_empty() {
        bail!("credential descriptors require non-empty name, host, header and env");
    }
    if d.header.eq_ignore_ascii_case("host") || d.header.eq_ignore_ascii_case("content-length") {
        bail!("credential '{name}' may not inject the {} header", d.header);
    }
    reqwest::header::HeaderName::from_bytes(d.header.as_bytes())
        .with_context(|| format!("credential '{name}' has an invalid HTTP header name"))?;
    Ok(())
}

pub fn host_matches(pattern: &str, host: &str) -> bool {
    let pattern = pattern.trim().trim_start_matches('.').trim_end_matches('.').to_ascii_lowercase();
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
}
