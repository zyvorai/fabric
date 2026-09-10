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
}

impl Config {
    pub fn from_env() -> Result<Self> {
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
            api_token: env_opt("ZYVOR_AGENT_API_TOKEN"),
            credentials_file: env_opt("ZYVOR_AGENT_CREDENTIALS_FILE").map(PathBuf::from),
            egress_advertise_host: env_opt("ZYVOR_AGENT_EGRESS_ADVERTISE_HOST"),
            sync_interval_ms: env_parse("ZYVOR_AGENT_SYNC_INTERVAL_MS", "300")?,
            guest_start_timeout_secs: env_parse("ZYVOR_AGENT_GUEST_START_TIMEOUT_SECS", "30")?,
            idle_scan_interval_ms: env_parse("ZYVOR_AGENT_IDLE_SCAN_INTERVAL_MS", "1000")?,
        })
    }
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
