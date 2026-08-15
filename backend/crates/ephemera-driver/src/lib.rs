// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

//! `driver-core` implementation backed by [Ephemera](https://github.com/hypersdk/ephemera)
//! instead of systemd-machined/systemd-vmspawn — see the systemd-removal
//! migration plan. This is the Phase 3 (VM lifecycle cutover) slice:
//! `VMDriver`'s create/stop/pause/resume/list/state/properties/leader-pid
//! map directly onto Ephemera's REST API. `ResourceControlDriver`,
//! `ResourceStatsDriver`, and `LogDriver` are implemented but every method
//! returns an "unsupported" error for now — Ephemera has no cgroup
//! delegation or log-streaming endpoint yet (Phase 5 of the plan). Callers
//! (`api/system.rs` CPU pinning, `api/logs.rs`, hotplug) stay on the
//! `MachinectlDriver` path until that lands, selected by vmspawnd's
//! `driver = "machinectl" | "ephemera"` config flag.

mod lifecycle;
mod unsupported;

use anyhow::{Context, Result};
use vmspawnd_ephemera_client::EphemeraClient;

pub use vmspawnd_driver_core::{
    CapabilityProvider, LogDriver, LogEntry, MachineInfo, ResourceControlDriver,
    ResourceStatsDriver, VMDriver, VmDriver,
};

/// Driver backed by one `ephemera serve` instance's REST API.
#[derive(Clone)]
pub struct EphemeraDriver {
    client: EphemeraClient,
}

impl EphemeraDriver {
    /// `base_url` is Ephemera's listen address, e.g. `http://127.0.0.1:7788`.
    pub fn new(base_url: impl AsRef<str>) -> Result<Self> {
        Ok(Self { client: EphemeraClient::new(base_url)? })
    }

    pub fn with_token(mut self, token: impl Into<String>) -> Self {
        self.client = self.client.with_token(token);
        self
    }

    /// Resolve a `driver-core` name to Ephemera's `Uuid`, since `VmRecord`
    /// is keyed by id while `VMDriver` is keyed by name (systemd-machined's
    /// model). Fails loudly rather than silently no-op'ing on an unknown
    /// name, matching machinectl-driver's behavior for the same case.
    async fn resolve(&self, name: &str) -> Result<vmspawnd_ephemera_client::VmRecord> {
        self.client
            .find_by_name(name)
            .await?
            .with_context(|| format!("no VM named '{name}' known to Ephemera"))
    }
}

impl CapabilityProvider for EphemeraDriver {
    fn backend_name(&self) -> &'static str {
        "ephemera"
    }

    fn has_resource_control(&self) -> bool {
        // Ephemera has no cgroup delegation yet (see `unsupported.rs`).
        false
    }
}
