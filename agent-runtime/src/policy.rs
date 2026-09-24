// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Keep Sentinel policy: export/import `keep.policy.yaml` from an agent manifest.
//!
//! When `ZYVOR_AGENT_POLICY_TRUSTED_SIGNERS` is set, PUT policy requires a valid
//! Ed25519 signature over the exact YAML bytes (`X-Keep-Policy-Signature: <hex>`).

use crate::model::{AgentManifest, EgressMode, EgressRule, TaintPolicy};
use anyhow::{bail, Context, Result};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KeepPolicy {
    pub version: u32,
    #[serde(default = "default_deny")]
    pub default_egress: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub allow: Vec<KeepAllow>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub deny: Vec<KeepDeny>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub taint: Option<KeepTaint>,
}

fn default_deny() -> String {
    "deny".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KeepAllow {
    pub host: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub methods: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ask: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KeepDeny {
    pub host: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KeepTaint {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub trusted_hosts: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub on_untrusted_page: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct PolicyTrust {
    /// Hex-encoded 32-byte Ed25519 public keys. Empty = signatures not required.
    pub trusted_signers: Vec<[u8; 32]>,
    /// When true and signers are configured, unsigned policy is refused.
    pub require_signature: bool,
}

impl PolicyTrust {
    pub fn from_env() -> Result<Self> {
        let raw = std::env::var("ZYVOR_AGENT_POLICY_TRUSTED_SIGNERS").unwrap_or_default();
        let mut trusted_signers = Vec::new();
        for part in raw.split(',').map(str::trim).filter(|s| !s.is_empty()) {
            let bytes = hex::decode(part).context("invalid POLICY_TRUSTED_SIGNERS hex")?;
            let arr: [u8; 32] = bytes
                .try_into()
                .map_err(|_| anyhow::anyhow!("POLICY_TRUSTED_SIGNERS entry must be 32 bytes"))?;
            trusted_signers.push(arr);
        }
        let require_signature = match std::env::var("ZYVOR_AGENT_POLICY_REQUIRE_SIGNATURE")
            .ok()
            .as_deref()
        {
            Some("1") => true,
            Some("0") => false,
            _ => !trusted_signers.is_empty(),
        };
        Ok(Self {
            trusted_signers,
            require_signature,
        })
    }

    pub fn verify_yaml(&self, yaml: &[u8], signature_hex: Option<&str>) -> Result<()> {
        if self.trusted_signers.is_empty() {
            return Ok(());
        }
        let Some(sig_hex) = signature_hex.filter(|s| !s.trim().is_empty()) else {
            if self.require_signature {
                bail!("policy signature required (X-Keep-Policy-Signature)");
            }
            return Ok(());
        };
        let sig_bytes = hex::decode(sig_hex.trim()).context("invalid policy signature hex")?;
        let signature = Signature::from_slice(&sig_bytes).context("malformed Ed25519 signature")?;
        for pk in &self.trusted_signers {
            let key = VerifyingKey::from_bytes(pk).context("invalid trusted signer public key")?;
            if key.verify(yaml, &signature).is_ok() {
                return Ok(());
            }
        }
        bail!("policy signature did not match any trusted signer");
    }
}

/// Sign policy YAML with a 32-byte seed (tests / `keepctl policy sign`).
pub fn sign_policy_yaml(yaml: &[u8], seed32: &[u8; 32]) -> String {
    let key = SigningKey::from_bytes(seed32);
    hex::encode(key.sign(yaml).to_bytes())
}

impl KeepPolicy {
    pub fn from_manifest(m: &AgentManifest) -> Self {
        let ask = match m.egress_mode {
            EgressMode::Ask | EgressMode::Sentinel => Some("always".into()),
            EgressMode::Deny => None,
        };
        let mut allow: Vec<KeepAllow> = m
            .egress_allow_hosts
            .iter()
            .map(|host| KeepAllow {
                host: host.clone(),
                methods: vec![],
                action: None,
                ask: ask.clone(),
            })
            .collect();
        for rule in &m.egress_rules {
            if let Some(existing) = allow.iter_mut().find(|a| a.host == rule.host) {
                existing.methods = rule.methods.clone();
            } else {
                allow.push(KeepAllow {
                    host: rule.host.clone(),
                    methods: rule.methods.clone(),
                    action: None,
                    ask: ask.clone(),
                });
            }
        }
        let taint = m.taint.as_ref().map(|t| KeepTaint {
            trusted_hosts: t.trusted_hosts.clone(),
            on_untrusted_page: Some("block_egress_until_ask".into()),
        });
        Self {
            version: 1,
            default_egress: "deny".into(),
            allow,
            deny: vec![],
            taint,
        }
    }

    /// Canonical YAML for signing (stable key order via serde_yaml on sorted maps
    /// is not guaranteed for structs; we sign the exact bytes the API receives).
    pub fn to_yaml(&self) -> Result<String> {
        Ok(serde_yaml::to_string(self)?)
    }

    pub fn from_yaml(raw: &str) -> Result<Self> {
        let policy: Self = serde_yaml::from_str(raw)?;
        if policy.version != 1 {
            bail!("unsupported keep.policy.yaml version {}", policy.version);
        }
        if policy.default_egress != "deny" && policy.default_egress != "allow" {
            bail!("default_egress must be deny or allow");
        }
        Ok(policy)
    }

    pub fn apply_to_manifest(&self, m: &mut AgentManifest) {
        m.egress_allow_hosts = self.allow.iter().map(|a| a.host.clone()).collect();
        m.egress_rules = self
            .allow
            .iter()
            .filter(|a| !a.methods.is_empty())
            .map(|a| EgressRule {
                host: a.host.clone(),
                methods: a.methods.clone(),
                path_prefixes: vec![],
                max_body_bytes: None,
            })
            .collect();
        if self.allow.iter().any(|a| {
            matches!(
                a.ask.as_deref(),
                Some("always") | Some("first") | Some("ask")
            )
        }) {
            m.egress_mode = EgressMode::Ask;
        }
        if let Some(t) = &self.taint {
            m.taint = Some(TaintPolicy {
                trusted_hosts: t.trusted_hosts.clone(),
            });
        }
    }
}

/// Pack metadata written by `keepctl pack` (no raw secrets).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeepPackManifest {
    pub version: u32,
    pub agent: String,
    pub agent_version: String,
    pub packed_at: String,
    #[serde(default)]
    pub model_socket: Option<crate::model::ModelSocket>,
    #[serde(default)]
    pub cell_backend: Option<crate::model::CellBackend>,
    #[serde(default)]
    pub credential_names: Vec<String>,
    #[serde(default)]
    pub fluxvm_notes: BTreeMap<String, String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::EgressMode;

    fn bare_manifest() -> AgentManifest {
        serde_json::from_value(serde_json::json!({
            "template": "agent-node",
            "egress_allow_hosts": ["api.github.com"],
            "egress_mode": "ask",
            "taint": { "trusted_hosts": ["api.github.com"] }
        }))
        .unwrap()
    }

    #[test]
    fn round_trip_yaml() {
        let m = bare_manifest();
        let yaml = KeepPolicy::from_manifest(&m).to_yaml().unwrap();
        assert!(yaml.contains("api.github.com"));
        let back = KeepPolicy::from_yaml(&yaml).unwrap();
        let mut m2 = bare_manifest();
        m2.egress_allow_hosts.clear();
        m2.egress_mode = EgressMode::Deny;
        m2.taint = None;
        back.apply_to_manifest(&mut m2);
        assert_eq!(m2.egress_allow_hosts, vec!["api.github.com".to_string()]);
        assert_eq!(m2.egress_mode, EgressMode::Ask);
    }

    #[test]
    fn signature_round_trip() {
        let seed = [7u8; 32];
        let yaml = b"version: 1\ndefault_egress: deny\n";
        let sig = sign_policy_yaml(yaml, &seed);
        let pk = SigningKey::from_bytes(&seed).verifying_key().to_bytes();
        let trust = PolicyTrust {
            trusted_signers: vec![pk],
            require_signature: true,
        };
        trust.verify_yaml(yaml, Some(&sig)).unwrap();
        assert!(trust.verify_yaml(yaml, Some("00")).is_err());
        assert!(trust.verify_yaml(yaml, None).is_err());
    }
}
