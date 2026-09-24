// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

use crate::{notify::ApprovalWebhook, sentinel::SentinelConfig};
use anyhow::{Context, Result};
use std::{net::SocketAddr, path::PathBuf, time::Duration};

#[derive(Clone, Debug)]
pub struct Config {
    pub listen: SocketAddr,
    pub egress_listen: SocketAddr,
    /// HTTPS CONNECT proxy for browsers in the sandbox. `None` turns it off.
    pub proxy_listen: Option<SocketAddr>,
    /// Ports a CONNECT tunnel may target.
    pub proxy_connect_ports: Vec<u16>,
    pub state_dir: PathBuf,
    pub snapshot_dir: PathBuf,
    pub fluxvm_url: String,
    pub fluxvm_token: Option<String>,
    pub api_token: Option<String>,
    pub credentials_file: Option<PathBuf>,
    /// JSON policy mapping an agent `skill_scope` to the skill scopes it may mount.
    pub skill_scopes_file: Option<PathBuf>,
    /// Reviewer model for `egress_mode: "sentinel"`. Absent means sentinel
    /// agents fall back to asking an operator.
    pub sentinel: Option<SentinelConfig>,
    /// Where new approvals are pushed so a person sees them. See `notify`.
    pub approval_webhook: Option<ApprovalWebhook>,
    /// Ceilings for a manifest's `resources`. Absent means FluxVM's own limits decide.
    /// Force `confinement: strict` for every agent, whatever its manifest says.
    pub confine_all: bool,
    pub max_vcpus: Option<u8>,
    pub max_memory_mib: Option<u64>,
    pub egress_advertise_host: Option<String>,
    pub sync_interval_ms: u64,
    pub guest_start_timeout_secs: u64,
    pub idle_scan_interval_ms: u64,
    pub warm_pool_reconcile_interval_ms: u64,
    pub warm_pool_max_create_per_tick: usize,
    pub warm_pool_claim_stale_secs: u64,
    pub expiry_scan_interval_ms: u64,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let api_token = env_opt("ZYVOR_AGENT_API_TOKEN");
        validate_auth(
            api_token.as_deref(),
            env_opt("ZYVOR_AGENT_ALLOW_NO_AUTH").as_deref(),
        )?;
        Ok(Self {
            listen: env_parse("ZYVOR_AGENT_LISTEN", "127.0.0.1:9096")?,
            egress_listen: env_parse("ZYVOR_AGENT_EGRESS_LISTEN", "0.0.0.0:18082")?,
            proxy_listen: proxy_listen_from_env()?,
            proxy_connect_ports: env_or("ZYVOR_AGENT_PROXY_CONNECT_PORTS", "443")
                .split(',')
                .map(|p| {
                    p.trim()
                        .parse()
                        .context("invalid ZYVOR_AGENT_PROXY_CONNECT_PORTS")
                })
                .collect::<Result<_>>()?,
            state_dir: PathBuf::from(env_or(
                "ZYVOR_AGENT_STATE_DIR",
                "/var/lib/zyvor-fabric-agent",
            )),
            snapshot_dir: PathBuf::from(env_or(
                "ZYVOR_AGENT_SNAPSHOT_DIR",
                "/var/lib/fluxvm/agent-snapshots",
            )),
            fluxvm_url: env_or("ZYVOR_AGENT_FLUXVM_URL", "http://127.0.0.1:7788"),
            fluxvm_token: env_opt("ZYVOR_AGENT_FLUXVM_TOKEN"),
            api_token,
            credentials_file: env_opt("ZYVOR_AGENT_CREDENTIALS_FILE").map(PathBuf::from),
            skill_scopes_file: env_opt("ZYVOR_AGENT_SKILL_SCOPES_FILE").map(PathBuf::from),
            sentinel: sentinel_from_env()?,
            approval_webhook: approval_webhook_from_env()?,
            confine_all: env_opt("ZYVOR_AGENT_CONFINE").is_some_and(|v| v == "1"),
            max_vcpus: env_opt("ZYVOR_AGENT_MAX_VCPUS")
                .map(|v| v.parse().context("invalid ZYVOR_AGENT_MAX_VCPUS"))
                .transpose()?,
            max_memory_mib: env_opt("ZYVOR_AGENT_MAX_MEMORY_MIB")
                .map(|v| v.parse().context("invalid ZYVOR_AGENT_MAX_MEMORY_MIB"))
                .transpose()?,
            egress_advertise_host: env_opt("ZYVOR_AGENT_EGRESS_ADVERTISE_HOST"),
            sync_interval_ms: env_parse("ZYVOR_AGENT_SYNC_INTERVAL_MS", "300")?,
            guest_start_timeout_secs: env_parse("ZYVOR_AGENT_GUEST_START_TIMEOUT_SECS", "30")?,
            idle_scan_interval_ms: env_parse("ZYVOR_AGENT_IDLE_SCAN_INTERVAL_MS", "1000")?,
            warm_pool_reconcile_interval_ms: env_parse(
                "ZYVOR_AGENT_WARM_POOL_RECONCILE_INTERVAL_MS",
                "2000",
            )?,
            warm_pool_max_create_per_tick: env_parse(
                "ZYVOR_AGENT_WARM_POOL_MAX_CREATE_PER_TICK",
                "2",
            )?,
            warm_pool_claim_stale_secs: env_parse("ZYVOR_AGENT_WARM_POOL_CLAIM_STALE_SECS", "300")?,
            expiry_scan_interval_ms: env_parse("ZYVOR_AGENT_EXPIRY_SCAN_INTERVAL_MS", "1000")?,
        })
    }
}

/// The public Agent Runtime API can deploy arbitrary agent bundles and use
/// any configured credential, so it refuses to start without a bearer token
/// unless the operator explicitly opts out (e.g. because something else in
/// front of this process, or the network it's bound to, already restricts
/// access).
fn validate_auth(api_token: Option<&str>, allow_no_auth: Option<&str>) -> Result<()> {
    if api_token.is_none() && allow_no_auth.is_none() {
        anyhow::bail!(
            "ZYVOR_AGENT_API_TOKEN is not set. Set it, or set \
             ZYVOR_AGENT_ALLOW_NO_AUTH=1 to explicitly opt into running without one."
        );
    }
    Ok(())
}

/// `ZYVOR_AGENT_PROXY_LISTEN`: an address, or `off` to disable the proxy.
fn proxy_listen_from_env() -> Result<Option<SocketAddr>> {
    let value = env_or("ZYVOR_AGENT_PROXY_LISTEN", "0.0.0.0:18083");
    if value.eq_ignore_ascii_case("off") {
        return Ok(None);
    }
    value
        .parse()
        .map(Some)
        .context("invalid ZYVOR_AGENT_PROXY_LISTEN")
}

fn approval_webhook_from_env() -> Result<Option<ApprovalWebhook>> {
    let Some(url) = env_opt("ZYVOR_AGENT_APPROVAL_WEBHOOK") else {
        return Ok(None);
    };
    let secret = env_opt("ZYVOR_AGENT_APPROVAL_WEBHOOK_SECRET").context(
        "ZYVOR_AGENT_APPROVAL_WEBHOOK_SECRET is required when ZYVOR_AGENT_APPROVAL_WEBHOOK is set",
    )?;
    Ok(Some(ApprovalWebhook { url, secret }))
}

fn sentinel_from_env() -> Result<Option<SentinelConfig>> {
    let Some(url) = env_opt("ZYVOR_AGENT_SENTINEL_URL") else {
        return Ok(None);
    };
    let model = env_opt("ZYVOR_AGENT_SENTINEL_MODEL")
        .context("ZYVOR_AGENT_SENTINEL_MODEL is required when ZYVOR_AGENT_SENTINEL_URL is set")?;
    Ok(Some(SentinelConfig {
        url,
        model,
        api_key: env_opt("ZYVOR_AGENT_SENTINEL_API_KEY"),
        timeout: Duration::from_secs(env_parse("ZYVOR_AGENT_SENTINEL_TIMEOUT_SECS", "15")?),
        can_allow: env_opt("ZYVOR_AGENT_SENTINEL_CAN_ALLOW").is_some_and(|v| v == "1"),
    }))
}

fn env_or(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_string())
}

fn env_opt(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.trim().is_empty())
}

fn env_parse<T>(name: &str, default: &str) -> Result<T>
where
    T: std::str::FromStr,
    T::Err: std::error::Error + Send + Sync + 'static,
{
    env_or(name, default)
        .parse::<T>()
        .with_context(|| format!("invalid {name}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_to_start_with_neither_token_nor_opt_out() {
        assert!(validate_auth(None, None).is_err());
    }

    #[test]
    fn accepts_an_explicit_api_token() {
        assert!(validate_auth(Some("secret"), None).is_ok());
    }

    #[test]
    fn accepts_an_explicit_no_auth_opt_out() {
        assert!(validate_auth(None, Some("1")).is_ok());
    }
}
