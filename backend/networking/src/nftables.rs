// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use anyhow::{Context, Result};
use std::process::Command;

use crate::models::{PortForwardConfig, Protocol};

/// Manages nftables rules for VM port forwarding (DNAT/masquerade).
///
/// All rules live in `table ip vmspawnd` with `prerouting` and `postrouting`
/// chains so they are isolated from other firewall rules.
pub struct NftManager;

const TABLE_NAME: &str = "vmspawnd";
const TABLE_FAMILY: &str = "ip";
const TABLE_NAME_V6: &str = "vmspawnd6";
const TABLE_FAMILY_V6: &str = "ip6";

impl NftManager {
    pub fn new() -> Self {
        Self
    }

    /// Create `table ip vmspawnd` and `table ip6 vmspawnd6` if they do not already exist.
    pub fn ensure_table(&self) -> Result<()> {
        // `add table` is idempotent in nftables — it won't fail if the table
        // already exists.
        run_nft(&["add", "table", TABLE_FAMILY, TABLE_NAME])
            .context("Failed to create nftables IPv4 table")?;
        run_nft(&["add", "table", TABLE_FAMILY_V6, TABLE_NAME_V6])
            .context("Failed to create nftables IPv6 table")?;
        tracing::debug!("Ensured nftables tables {TABLE_FAMILY} {TABLE_NAME} + {TABLE_FAMILY_V6} {TABLE_NAME_V6}");
        Ok(())
    }

    /// Create the prerouting (DNAT) and postrouting (masquerade) chains for IPv4 and IPv6.
    pub fn ensure_chains(&self) -> Result<()> {
        // IPv4 chains
        run_nft(&[
            "add", "chain", TABLE_FAMILY, TABLE_NAME, "prerouting",
            "{ type nat hook prerouting priority dstnat; }",
        ])
        .context("Failed to create IPv4 prerouting chain")?;

        run_nft(&[
            "add", "chain", TABLE_FAMILY, TABLE_NAME, "postrouting",
            "{ type nat hook postrouting priority srcnat; }",
        ])
        .context("Failed to create IPv4 postrouting chain")?;

        // IPv6 chains
        run_nft(&[
            "add", "chain", TABLE_FAMILY_V6, TABLE_NAME_V6, "prerouting",
            "{ type nat hook prerouting priority dstnat; }",
        ])
        .context("Failed to create IPv6 prerouting chain")?;

        run_nft(&[
            "add", "chain", TABLE_FAMILY_V6, TABLE_NAME_V6, "postrouting",
            "{ type nat hook postrouting priority srcnat; }",
        ])
        .context("Failed to create IPv6 postrouting chain")?;

        tracing::debug!("Ensured nftables chains prerouting + postrouting (IPv4 + IPv6)");
        Ok(())
    }

    /// Add a DNAT rule for the given port forward config.
    ///
    /// For `Protocol::Both` two rules are added (tcp + udp).
    pub fn add_dnat_rule(&self, cfg: &PortForwardConfig) -> Result<()> {
        let protos = protocol_list(cfg.protocol);
        for proto in protos {
            let args = build_dnat_args(proto, cfg)?;
            let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            run_nft(&refs).with_context(|| {
                format!(
                    "Failed to add DNAT rule {} dport {} -> {}:{}",
                    proto, cfg.host_port, cfg.guest_ip, cfg.guest_port
                )
            })?;
        }
        tracing::info!(
            "Added DNAT rule '{}': {} port {} -> {}:{}",
            cfg.name,
            cfg.protocol.as_str(),
            cfg.host_port,
            cfg.guest_ip,
            cfg.guest_port,
        );
        Ok(())
    }

    /// Add masquerade rule for return traffic to a guest subnet.
    ///
    /// We derive a /24 from the guest IP so that all VMs on the same subnet
    /// share one masquerade rule.  Duplicate adds are harmless in nftables.
    pub fn add_masquerade_rule(&self, cfg: &PortForwardConfig) -> Result<()> {
        validate_nft_ip(&cfg.guest_ip)
            .context("Invalid guest IP for masquerade rule")?;
        validate_nft_identifier(&cfg.name, "Port forward name")
            .context("Invalid name for masquerade rule")?;

        let subnet = subnet_from_ip(&cfg.guest_ip);
        let comment = format!("vm-nat-{}", cfg.name);
        run_nft(&[
            "add", "rule", TABLE_FAMILY, TABLE_NAME, "postrouting",
            "ip", "daddr", &subnet, "masquerade",
            "comment", &format!("\"{}\"", comment),
        ])
            .with_context(|| format!("Failed to add masquerade rule for {subnet}"))?;
        tracing::info!("Added masquerade rule for subnet {subnet}");
        Ok(())
    }

    /// Remove all rules in our table whose comment contains the given config name.
    pub fn remove_rule(&self, cfg: &PortForwardConfig) -> Result<()> {
        let rules = self.list_rules()?;
        let comment_needle = &cfg.name;

        for chain in &["prerouting", "postrouting"] {
            let handles = find_rule_handles(&rules, chain, comment_needle);
            for handle in handles {
                run_nft(&[
                    "delete", "rule", TABLE_FAMILY, TABLE_NAME, chain,
                    "handle", &handle.to_string(),
                ])
                .with_context(|| format!("Failed to delete rule handle {handle} in {chain}"))?;
                tracing::debug!("Deleted rule handle {handle} from chain {chain}");
            }
        }

        tracing::info!("Removed nftables rules for '{}'", cfg.name);
        Ok(())
    }

    /// Return the JSON output of `nft -j list table ip vmspawnd`.
    pub fn list_rules(&self) -> Result<serde_json::Value> {
        let output = Command::new("nft")
            .args(["-j", "list", "table", TABLE_FAMILY, TABLE_NAME])
            .output()
            .context("Failed to execute nft list table")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Table might not exist yet — return empty object.
            if stderr.contains("No such file or directory") || stderr.contains("does not exist") {
                return Ok(serde_json::json!({"nftables": []}));
            }
            return Err(anyhow::anyhow!("nft list table failed: {stderr}"));
        }

        let json: serde_json::Value = serde_json::from_slice(&output.stdout)
            .context("Failed to parse nft JSON output")?;
        Ok(json)
    }

    /// Flush (delete all rules from) our table.
    pub fn flush_table(&self) -> Result<()> {
        // Flush is a no-op if the table doesn't exist; we ensure_table first.
        self.ensure_table()?;
        run_nft(&["flush", "table", TABLE_FAMILY, TABLE_NAME])
            .context("Failed to flush nftables table")?;
        tracing::info!("Flushed all rules from table {TABLE_FAMILY} {TABLE_NAME}");
        Ok(())
    }

    /// High-level: ensure table + chains, then add DNAT + masquerade rules.
    pub fn apply(&self, cfg: &PortForwardConfig) -> Result<()> {
        self.ensure_table()?;
        self.ensure_chains()?;
        self.add_dnat_rule(cfg)?;
        self.add_masquerade_rule(cfg)?;
        Ok(())
    }

    /// High-level: remove rules for one port forward config.
    pub fn remove(&self, cfg: &PortForwardConfig) -> Result<()> {
        self.remove_rule(cfg)
    }

    /// Flush all rules then re-apply every enabled config.
    /// Called on daemon start to bring nftables in sync with persisted state.
    pub fn sync_all(&self, configs: &[PortForwardConfig]) -> Result<()> {
        self.flush_table()?;
        self.ensure_chains()?;
        for cfg in configs {
            if cfg.enabled {
                self.add_dnat_rule(cfg)?;
                self.add_masquerade_rule(cfg)?;
            }
        }
        tracing::info!("Synced {} port forward rules to nftables", configs.len());
        Ok(())
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn protocol_list(proto: Protocol) -> Vec<&'static str> {
    match proto {
        Protocol::Tcp => vec!["tcp"],
        Protocol::Udp => vec!["udp"],
        Protocol::Both => vec!["tcp", "udp"],
    }
}

/// Validate a name/interface for safe use in nftables rules.
/// Only allows alphanumeric, hyphens, underscores, and dots.
fn validate_nft_identifier(s: &str, label: &str) -> Result<()> {
    if s.is_empty() || s.len() > 64 {
        return Err(anyhow::anyhow!("{} must be 1-64 characters", label));
    }
    if !s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.') {
        return Err(anyhow::anyhow!(
            "{} '{}' contains invalid characters (only alphanumeric, hyphens, underscores, dots allowed)",
            label, s
        ));
    }
    Ok(())
}

/// Validate an IP address string for safe use in nftables rules.
fn validate_nft_ip(ip: &str) -> Result<()> {
    ip.parse::<std::net::IpAddr>()
        .map(|_| ())
        .map_err(|_| anyhow::anyhow!("Invalid IP address: '{}'", ip))
}

fn build_dnat_args(proto: &str, cfg: &PortForwardConfig) -> Result<Vec<String>> {
    // Validate inputs before building the rule
    validate_nft_identifier(&cfg.name, "Port forward name")?;
    validate_nft_ip(&cfg.guest_ip)?;

    let mut args: Vec<String> = vec![
        "add".into(),
        "rule".into(),
        TABLE_FAMILY.into(),
        TABLE_NAME.into(),
        "prerouting".into(),
    ];

    if let Some(ref iface) = cfg.interface {
        validate_nft_identifier(iface, "Interface name")?;
        args.extend_from_slice(&[
            "iifname".into(),
            format!("\"{}\"", iface),
        ]);
    }

    args.extend_from_slice(&[
        proto.into(),
        "dport".into(),
        cfg.host_port.to_string(),
        "dnat".into(),
        "to".into(),
        format!("{}:{}", cfg.guest_ip, cfg.guest_port),
        "comment".into(),
        format!("\"{}\"", cfg.name),
    ]);

    Ok(args)
}

/// Derive a /24 subnet from an IP address (e.g. 192.168.100.10 → 192.168.100.0/24).
fn subnet_from_ip(ip: &str) -> String {
    let parts: Vec<&str> = ip.split('.').collect();
    if parts.len() == 4 {
        format!("{}.{}.{}.0/24", parts[0], parts[1], parts[2])
    } else {
        // Fallback — just masquerade for the exact IP
        format!("{ip}/32")
    }
}

/// Parse JSON rule output and find handles whose comment matches needle.
fn find_rule_handles(json: &serde_json::Value, chain: &str, comment_needle: &str) -> Vec<u64> {
    let mut handles = Vec::new();

    let nftables = match json.get("nftables").and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return handles,
    };

    for item in nftables {
        if let Some(rule) = item.get("rule") {
            let rule_chain = rule.get("chain").and_then(|c| c.as_str()).unwrap_or("");
            if rule_chain != chain {
                continue;
            }

            let handle = rule.get("handle").and_then(|h| h.as_u64()).unwrap_or(0);
            if handle == 0 {
                continue;
            }

            // Check comment in the rule's expression list
            let has_comment = rule
                .get("expr")
                .and_then(|e| e.as_array())
                .map(|exprs| {
                    exprs.iter().any(|expr| {
                        expr.get("comment")
                            .and_then(|c| c.as_str())
                            .map(|c| c.contains(comment_needle))
                            .unwrap_or(false)
                    })
                })
                .unwrap_or(false);

            if has_comment {
                handles.push(handle);
            }
        }
    }

    handles
}

fn run_nft(args: &[&str]) -> Result<()> {
    let output = Command::new("nft")
        .args(args)
        .output()
        .with_context(|| format!("Failed to execute nft {}", args.join(" ")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!(
            "nft {} failed: {}",
            args.join(" "),
            stderr
        ));
    }
    Ok(())
}


// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Protocol;

    fn test_config() -> PortForwardConfig {
        PortForwardConfig {
            id: "test-id".into(),
            name: "web-server".into(),
            protocol: Protocol::Tcp,
            host_port: 8080,
            guest_ip: "192.168.100.10".into(),
            guest_port: 80,
            interface: None,
            enabled: true,
            description: None,
            created: String::new(),
            updated: String::new(),
        }
    }

    #[test]
    fn test_build_dnat_args_tcp() {
        let cfg = test_config();
        let args = build_dnat_args("tcp", &cfg).unwrap();

        assert_eq!(args[0], "add");
        assert_eq!(args[1], "rule");
        assert_eq!(args[2], "ip");
        assert_eq!(args[3], "vmspawnd");
        assert_eq!(args[4], "prerouting");
        assert_eq!(args[5], "tcp");
        assert_eq!(args[6], "dport");
        assert_eq!(args[7], "8080");
        assert_eq!(args[8], "dnat");
        assert_eq!(args[9], "to");
        assert_eq!(args[10], "192.168.100.10:80");
        assert_eq!(args[11], "comment");
        assert_eq!(args[12], "\"web-server\"");
    }

    #[test]
    fn test_build_dnat_args_with_interface() {
        let mut cfg = test_config();
        cfg.interface = Some("eth0".into());
        let args = build_dnat_args("tcp", &cfg).unwrap();

        assert_eq!(args[5], "iifname");
        assert_eq!(args[6], "\"eth0\"");
        assert_eq!(args[7], "tcp");
        assert_eq!(args[8], "dport");
    }

    #[test]
    fn test_protocol_list_both() {
        let protos = protocol_list(Protocol::Both);
        assert_eq!(protos, vec!["tcp", "udp"]);
    }

    #[test]
    fn test_protocol_list_tcp() {
        let protos = protocol_list(Protocol::Tcp);
        assert_eq!(protos, vec!["tcp"]);
    }

    #[test]
    fn test_protocol_list_udp() {
        let protos = protocol_list(Protocol::Udp);
        assert_eq!(protos, vec!["udp"]);
    }

    #[test]
    fn test_subnet_from_ip() {
        assert_eq!(subnet_from_ip("192.168.100.10"), "192.168.100.0/24");
        assert_eq!(subnet_from_ip("10.0.0.1"), "10.0.0.0/24");
    }

    #[test]
    fn test_subnet_from_ip_invalid() {
        assert_eq!(subnet_from_ip("invalid"), "invalid/32");
    }

    #[test]
    fn test_find_rule_handles_empty() {
        let json = serde_json::json!({"nftables": []});
        let handles = find_rule_handles(&json, "prerouting", "web-server");
        assert!(handles.is_empty());
    }

    #[test]
    fn test_find_rule_handles_match() {
        let json = serde_json::json!({
            "nftables": [
                {
                    "rule": {
                        "chain": "prerouting",
                        "handle": 5,
                        "expr": [
                            {"match": {"left": {"payload": {"protocol": "tcp"}}}},
                            {"comment": "web-server"}
                        ]
                    }
                },
                {
                    "rule": {
                        "chain": "prerouting",
                        "handle": 6,
                        "expr": [
                            {"comment": "other-rule"}
                        ]
                    }
                }
            ]
        });

        let handles = find_rule_handles(&json, "prerouting", "web-server");
        assert_eq!(handles, vec![5]);
    }

    #[test]
    fn test_find_rule_handles_wrong_chain() {
        let json = serde_json::json!({
            "nftables": [
                {
                    "rule": {
                        "chain": "postrouting",
                        "handle": 5,
                        "expr": [{"comment": "web-server"}]
                    }
                }
            ]
        });

        let handles = find_rule_handles(&json, "prerouting", "web-server");
        assert!(handles.is_empty());
    }
}
