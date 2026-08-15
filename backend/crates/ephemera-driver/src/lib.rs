// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

//! `driver-core` implementation backed by [Ephemera](https://github.com/hypersdk/ephemera)
//! instead of systemd-machined/systemd-vmspawn — see the systemd-removal
//! migration plan. `VMDriver`'s create/stop/pause/resume/list/state/
//! properties/leader-pid map directly onto Ephemera's REST API (Phase 3).
//! `ResourceControlDriver`/`ResourceStatsDriver` are backed by Ephemera's
//! cgroup-delegation extension (Phase 5, see `resource_control.rs`).
//! `LogDriver` still errors — Ephemera has no log-streaming endpoint yet.
//! Callers needing it (`api/logs.rs`, `websocket.rs`) stay on the
//! `MachinectlDriver` path until that lands, selected by zyvor-fabricd's
//! `driver = "machinectl" | "ephemera"` config flag.

mod lifecycle;
mod resource_control;

use anyhow::{Context, Result};
use zyvor_fabric_ephemera_client::EphemeraClient;

pub use zyvor_fabric_driver_core::{
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
    async fn resolve(&self, name: &str) -> Result<zyvor_fabric_ephemera_client::VmRecord> {
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
        // Backed by Ephemera's cgroup-delegation extension — see `resource_control.rs`.
        true
    }
}
