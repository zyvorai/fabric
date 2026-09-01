// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

//! `driver-core` implementation backed by [Ephemera](https://github.com/hypersdk/ephemera)
//! — the only `VmDriver` implementation left as of the systemd-removal
//! migration's final phase; the systemd-machined/systemd-vmspawn backend
//! this replaced (`machinectl-driver`/`machined-dbus`) is gone. `VMDriver`'s
//! create/stop/pause/resume/list/state/properties/leader-pid map directly
//! onto Ephemera's REST API. `ResourceControlDriver`/`ResourceStatsDriver`
//! are backed by Ephemera's cgroup-delegation extension (see
//! `resource_control.rs`). `LogDriver` streams real captured console output
//! over Ephemera's `GET /v1/vms/{id}/logs` (see `resource_control.rs`'s
//! `stream_logs` impl); the one fidelity reduction versus the old
//! journald-backed driver is that raw serial console output has no
//! per-line priority/unit metadata, so every entry is stamped uniformly.
//! `ConsoleDriver` (see `console.rs`) gives an interactive shell over
//! Ephemera's console WebSocket, itself backed by the vsock guest agent's
//! `OpenShell` op.
//!
//! **Known gap as of Ephemera v0.1.0**: `ephemera-client`'s wire types are a
//! hand-synced mirror of `ephemera-core::model` (see that crate's own doc
//! comment for why), and haven't yet picked up several fields/capabilities
//! Ephemera has since grown — `CreateVmRequest.storage` (LVM thin/NBD/Ceph
//! RBD backends), `NetworkSpec::Tap.netns` (per-VM network namespaces), and
//! `VmRecord`'s `jail_path`/`vsock_socket`/`lvm_lv`/`nbd_pid` fields. Every
//! VM created through this driver still gets Ephemera's default qcow2/raw
//! storage and shared-bridge networking — those newer per-VM choices simply
//! aren't reachable through `driver-core` yet. Also orthogonal to this
//! driver entirely: Ephemera's `ephemera-kube` Kubernetes CRD/operator and
//! `ephemera-agent` distributed fleet registry are separate ways to run
//! Ephemera, not something this REST-client-based driver consumes.

mod console;
mod images;
mod lifecycle;
mod pools;
mod resource_control;
mod shell;

use anyhow::{Context, Result};
use zyvor_fabric_ephemera_client::EphemeraClient;

pub use zyvor_fabric_driver_core::{
    CapabilityProvider, ConsoleDriver, ImageDriver, ImageInfo, LogDriver, LogEntry, MachineInfo,
    PoolDriver, PoolInfo, ResourceControlDriver, ResourceStatsDriver, ShellDriver, ShellOutput,
    VMDriver, VmDriver,
};

/// Driver backed by one `ephemera serve` instance's REST API.
#[derive(Clone)]
pub struct EphemeraDriver {
    client: EphemeraClient,
}

impl EphemeraDriver {
    /// `base_url` is Ephemera's listen address, e.g. `http://127.0.0.1:7788`.
    pub fn new(base_url: impl AsRef<str>) -> Result<Self> {
        Ok(Self {
            client: EphemeraClient::new(base_url)?,
        })
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
