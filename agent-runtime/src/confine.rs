// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Network confinement: make the egress broker and CONNECT proxy the only way
//! out of a sandbox.
//!
//! FluxVM enforces this on the **host** (TC/eBPF on the sandbox veth) — never
//! in guest Chromium. With `deny_udp`, WebRTC/QUIC/STUN die at L4. Public DNS
//! and cloud metadata are deny-listed. Destination FQDNs from Keep policy are
//! passed as `allow_fqdns` for FluxVM to resolve into CIDR maps.

use anyhow::{bail, Result};
use serde_json::{json, Value};
use std::net::IpAddr;

/// Build a FluxVM `VmNetworkPolicy` for a Keep / confined cell.
pub fn strict_policy(
    gateway: IpAddr,
    broker_port: u16,
    proxy_port: Option<u16>,
    allow_fqdns: &[String],
    session_id: Option<&str>,
    agent: Option<&str>,
) -> Value {
    let prefix = if gateway.is_ipv4() { 32 } else { 128 };
    let mut ports = vec![format!("tcp/{broker_port}")];
    if let Some(port) = proxy_port {
        ports.push(format!("tcp/{port}"));
    }
    let mut labels = vec![
        "keep.zyvor.dev/role=browser".to_string(),
        "keep.zyvor.dev/proxy=strict".to_string(),
    ];
    if let Some(sid) = session_id {
        labels.push(format!("keep.zyvor.dev/session={sid}"));
    }
    if let Some(a) = agent {
        labels.push(format!("keep.zyvor.dev/agent={a}"));
    }
    let mut fqdns: Vec<String> = allow_fqdns
        .iter()
        .map(|h| h.trim().trim_start_matches("*.").to_ascii_lowercase())
        .filter(|h| !h.is_empty())
        .collect();
    fqdns.sort();
    fqdns.dedup();

    json!({
        "default_allow": false,
        "allow_cidrs": [format!("{gateway}/{prefix}")],
        "allow_ports": ports,
        // Proxy-or-die: only TCP to broker/proxy. Explicit UDP kill for QUIC/WebRTC.
        "deny_udp": true,
        "allow_icmp": false,
        "deny_cidrs": [
            // Cloud metadata
            "169.254.169.254/32",
            "169.254.0.0/16",
            // Public recursive DNS / DoH edges guests love to hit
            "8.8.8.8/32",
            "8.8.4.4/32",
            "1.1.1.1/32",
            "1.0.0.1/32",
            "9.9.9.9/32",
        ],
        "allow_fqdns": fqdns,
        "labels": labels,
        "sample_rate": 0,
        "audit_mode": false,
    })
}

/// Confinement needs an IP address to pin to; a hostname would have to be
/// resolved by a guest that is not yet confined.
pub fn parse_gateway(host: &str) -> Result<IpAddr> {
    let trimmed = host.trim().trim_start_matches('[').trim_end_matches(']');
    match trimmed.parse() {
        Ok(ip) => Ok(ip),
        Err(_) => bail!(
            "confinement needs the egress gateway as an IP address, got {host:?}; \
             set ZYVOR_AGENT_EGRESS_ADVERTISE_HOST to an IP or use tap+netns"
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_only_the_gateway_on_the_broker_and_proxy_ports() {
        let policy = strict_policy(
            "10.0.2.1".parse().unwrap(),
            18082,
            Some(18083),
            &["example.com".into()],
            Some("sess"),
            Some("pdf-brief"),
        );
        assert_eq!(policy["default_allow"], false);
        assert_eq!(policy["deny_udp"], true);
        assert_eq!(policy["allow_cidrs"], json!(["10.0.2.1/32"]));
        assert_eq!(policy["allow_ports"], json!(["tcp/18082", "tcp/18083"]));
        assert!(policy["deny_cidrs"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c == "169.254.169.254/32"));
        assert_eq!(policy["allow_fqdns"], json!(["example.com"]));
        assert!(policy["labels"]
            .as_array()
            .unwrap()
            .iter()
            .any(|l| l.as_str() == Some("keep.zyvor.dev/role=browser")));
    }

    #[test]
    fn proxy_port_is_left_out_when_the_proxy_is_off() {
        let policy = strict_policy("10.0.2.1".parse().unwrap(), 18082, None, &[], None, None);
        assert_eq!(policy["allow_ports"], json!(["tcp/18082"]));
    }

    #[test]
    fn ipv6_gateways_use_a_host_prefix() {
        let policy = strict_policy("fd00::1".parse().unwrap(), 18082, None, &[], None, None);
        assert_eq!(policy["allow_cidrs"], json!(["fd00::1/128"]));
    }

    #[test]
    fn gateway_must_be_an_ip() {
        assert_eq!(
            parse_gateway("10.0.2.1").unwrap(),
            "10.0.2.1".parse::<IpAddr>().unwrap()
        );
        assert!(parse_gateway("[fd00::1]").is_ok());
        assert!(parse_gateway("broker.internal")
            .unwrap_err()
            .to_string()
            .contains("IP address"));
    }
}
