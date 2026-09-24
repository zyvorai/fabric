// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Keep Sentinel policy: export/import `keep.policy.yaml` from an agent manifest.
//!
//! The YAML is the readable form of egress allow/deny/ask + taint. Signing is
//! operator-side (Ed25519 over canonical bytes); this module only maps fields.

use crate::model::{AgentManifest, EgressMode, EgressRule, TaintPolicy};
use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};

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

    /// Apply allow hosts / rules / taint onto a manifest (does not clear unrelated fields).
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
        assert!(yaml.contains("block_egress_until_ask"));
        let back = KeepPolicy::from_yaml(&yaml).unwrap();
        let mut m2 = bare_manifest();
        m2.egress_allow_hosts.clear();
        m2.egress_mode = EgressMode::Deny;
        m2.taint = None;
        back.apply_to_manifest(&mut m2);
        assert_eq!(m2.egress_allow_hosts, vec!["api.github.com".to_string()]);
        assert_eq!(m2.egress_mode, EgressMode::Ask);
        assert!(m2.taint.is_some());
    }
}
