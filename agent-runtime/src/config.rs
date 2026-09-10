// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

use anyhow::{Context, Result};
use std::{net::SocketAddr, path::PathBuf};

#[derive(Clone, Debug)]
pub struct Config {
    pub listen: SocketAddr,
    pub egress_listen: SocketAddr,
    pub state_dir: PathBuf,
    pub snapshot_dir: PathBuf,
    pub fluxvm_url: String,
    pub fluxvm_token: Option<String>,
    pub api_token: Option<String>,
    pub credentials_file: Option<PathBuf>,
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
            warm_pool_claim_stale_secs: env_parse(
                "ZYVOR_AGENT_WARM_POOL_CLAIM_STALE_SECS",
                "300",
            )?,
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
