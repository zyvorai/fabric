// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Network confinement: make the egress broker and CONNECT proxy the only way
//! out of a sandbox.
//!
//! Every other egress control (allowlist, approvals, Sentinel, the journal) is
//! bypassed by a guest that simply connects to the internet itself. FluxVM
//! enforces a per-VM L4 policy in eBPF on the sandbox's interface; once either
//! allowlist is non-empty, everything unmatched is dropped, and a packet must
//! match both the CIDR and the port lists. The policy built here allows one
//! address (the host gateway, where the broker and proxy listen) on exactly the
//! broker and proxy ports.

use anyhow::{bail, Result};
use serde_json::{json, Value};
use std::net::IpAddr;

/// The FluxVM `VmNetworkPolicy` body for a confined sandbox.
pub fn strict_policy(gateway: IpAddr, broker_port: u16, proxy_port: Option<u16>) -> Value {
    let prefix = if gateway.is_ipv4() { 32 } else { 128 };
    let mut ports = vec![format!("tcp/{broker_port}")];
    if let Some(port) = proxy_port {
        ports.push(format!("tcp/{port}"));
    }
    json!({
        "default_allow": false,
        "allow_cidrs": [format!("{gateway}/{prefix}")],
        "allow_ports": ports,
        "sample_rate": 0,
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
        let policy = strict_policy("10.0.2.1".parse().unwrap(), 18082, Some(18083));
        assert_eq!(policy["default_allow"], false);
        assert_eq!(policy["allow_cidrs"], json!(["10.0.2.1/32"]));
        assert_eq!(policy["allow_ports"], json!(["tcp/18082", "tcp/18083"]));
    }

    #[test]
    fn proxy_port_is_left_out_when_the_proxy_is_off() {
        let policy = strict_policy("10.0.2.1".parse().unwrap(), 18082, None);
        assert_eq!(policy["allow_ports"], json!(["tcp/18082"]));
    }

    #[test]
    fn ipv6_gateways_use_a_host_prefix() {
        let policy = strict_policy("fd00::1".parse().unwrap(), 18082, None);
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
