// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Cilium-style per-VM packet-flow controls mapped onto FluxVM
//! `VmNetworkPolicy` (schema v4). Fabric does not write Cilium-private maps.
//!
//! | UX action | Policy effect |
//! |-----------|----------------|
//! | **Open**  | `default_allow=true`, `audit_mode=false` |
//! | **Audit** | evaluate policy, do not drop (`audit_mode=true`) |
//! | **Guard** | enforce default-deny (`default_allow=false`, `audit_mode=false`) |
//! | **Block** | add destination CIDR to `deny_cidrs` |
//! | **Allow** | add destination CIDR to `allow_cidrs` |
//! | **Invert**| swap allow/deny CIDR lists and flip `default_allow` |

use crate::VmNetworkPolicy;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EnforcementMode {
    Open,
    Audit,
    Guard,
}

impl EnforcementMode {
    pub fn from_policy(p: &VmNetworkPolicy) -> Self {
        if p.audit_mode {
            Self::Audit
        } else if p.default_allow {
            Self::Open
        } else {
            Self::Guard
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ControlAction {
    Open,
    Audit,
    Guard,
    Invert,
    Block,
    Allow,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ControlRequest {
    pub action: ControlAction,
    #[serde(default)]
    pub cidr: Option<String>,
    #[serde(default)]
    pub port: Option<String>,
    #[serde(default)]
    pub entity: Option<String>,
}

fn push_unique(list: &mut Vec<String>, value: String) {
    if !value.is_empty() && !list.iter().any(|x| x == &value) {
        list.push(value);
    }
}

fn host_cidr(addr: &str) -> String {
    let addr = addr.split('/').next().unwrap_or(addr).trim();
    if addr.contains(':') && !addr.contains('/') {
        format!("{addr}/128")
    } else if addr.contains('.') && !addr.contains('/') {
        format!("{addr}/32")
    } else {
        addr.to_string()
    }
}

pub fn apply_mode(mut p: VmNetworkPolicy, mode: EnforcementMode) -> VmNetworkPolicy {
    match mode {
        EnforcementMode::Open => {
            p.default_allow = true;
            p.audit_mode = false;
        }
        EnforcementMode::Audit => {
            p.audit_mode = true;
            if p.sample_rate == 0 {
                p.sample_rate = 1;
            }
        }
        EnforcementMode::Guard => {
            p.default_allow = false;
            p.audit_mode = false;
            if p.sample_rate == 0 {
                p.sample_rate = 1;
            }
        }
    }
    p
}

pub fn invert_policy(mut p: VmNetworkPolicy) -> VmNetworkPolicy {
    std::mem::swap(&mut p.allow_cidrs, &mut p.deny_cidrs);
    p.default_allow = !p.default_allow;
    p
}

pub fn block_cidr(mut p: VmNetworkPolicy, cidr: &str) -> VmNetworkPolicy {
    let cidr = host_cidr(cidr);
    p.deny_cidrs.retain(|c| c != &cidr);
    push_unique(&mut p.deny_cidrs, cidr);
    p
}

pub fn allow_cidr(mut p: VmNetworkPolicy, cidr: &str) -> VmNetworkPolicy {
    let cidr = host_cidr(cidr);
    p.deny_cidrs.retain(|c| c != &cidr);
    push_unique(&mut p.allow_cidrs, cidr);
    p
}

pub fn allow_port(mut p: VmNetworkPolicy, port: &str) -> VmNetworkPolicy {
    push_unique(&mut p.allow_ports, port.trim().to_ascii_lowercase());
    p
}

pub fn allow_entity(mut p: VmNetworkPolicy, entity: &str) -> VmNetworkPolicy {
    push_unique(&mut p.entities, entity.trim().to_string());
    p
}

pub fn apply_control(
    policy: VmNetworkPolicy,
    req: &ControlRequest,
) -> Result<VmNetworkPolicy, String> {
    match req.action {
        ControlAction::Open => Ok(apply_mode(policy, EnforcementMode::Open)),
        ControlAction::Audit => Ok(apply_mode(policy, EnforcementMode::Audit)),
        ControlAction::Guard => Ok(apply_mode(policy, EnforcementMode::Guard)),
        ControlAction::Invert => Ok(invert_policy(policy)),
        ControlAction::Block => {
            let cidr = req
                .cidr
                .as_deref()
                .ok_or_else(|| "block requires cidr".to_string())?;
            let mut p = block_cidr(policy, cidr);
            if let Some(port) = req.port.as_deref() {
                p = allow_port(p, port);
            }
            Ok(p)
        }
        ControlAction::Allow => {
            let mut p = policy;
            if let Some(cidr) = req.cidr.as_deref() {
                p = allow_cidr(p, cidr);
            }
            if let Some(port) = req.port.as_deref() {
                p = allow_port(p, port);
            }
            if let Some(entity) = req.entity.as_deref() {
                p = allow_entity(p, entity);
            }
            if req.cidr.is_none() && req.port.is_none() && req.entity.is_none() {
                return Err("allow requires cidr, port, or entity".into());
            }
            Ok(p)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> VmNetworkPolicy {
        VmNetworkPolicy {
            default_allow: true,
            allow_cidrs: vec!["10.0.0.0/8".into()],
            deny_cidrs: vec!["1.1.1.1/32".into()],
            ..VmNetworkPolicy::default()
        }
    }

    #[test]
    fn guard_is_default_deny_enforced() {
        let p = apply_mode(base(), EnforcementMode::Guard);
        assert!(!p.default_allow);
        assert!(!p.audit_mode);
        assert!(p.sample_rate >= 1);
        assert_eq!(EnforcementMode::from_policy(&p), EnforcementMode::Guard);
    }

    #[test]
    fn audit_keeps_lists_and_sets_flag() {
        let p = apply_mode(base(), EnforcementMode::Audit);
        assert!(p.audit_mode);
        assert_eq!(p.allow_cidrs, vec!["10.0.0.0/8"]);
    }

    #[test]
    fn invert_swaps_cidrs_and_default() {
        let p = invert_policy(base());
        assert!(!p.default_allow);
        assert_eq!(p.allow_cidrs, vec!["1.1.1.1/32"]);
        assert_eq!(p.deny_cidrs, vec!["10.0.0.0/8"]);
    }

    #[test]
    fn block_promotes_host_to_slash32() {
        let p = block_cidr(base(), "8.8.8.8");
        assert!(p.deny_cidrs.contains(&"8.8.8.8/32".into()));
    }

    #[test]
    fn apply_control_block_requires_cidr() {
        let err = apply_control(
            base(),
            &ControlRequest {
                action: ControlAction::Block,
                cidr: None,
                port: None,
                entity: None,
            },
        )
        .unwrap_err();
        assert!(err.contains("cidr"));
    }
}
