// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Native migration orchestration over FluxVM's node-local runtime contract.
//! ZYVOR_RUNTIME_BOUNDARY_V1
//!
//! This module intentionally does **not** choose a destination node, copy a
//! disk, reserve capacity, fence a host, or prepare the target QEMU receiver.
//! Those are Fabric control-plane operations. It starts and observes the VMM
//! transport only after the target is prepared and storage safety is known.

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use zyvor_fabric_fluxvm_client::{
    BackendKind, FluxVmClient, MigrationMode, MigrationPhase, MigrationStartRequest,
    MigrationStatus, RuntimeCapabilities, VmStatus,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeMigrationOptions {
    #[serde(default)]
    pub mode: MigrationMode,
    #[serde(default)]
    pub bandwidth_mbps: Option<u64>,
    #[serde(default)]
    pub max_downtime_ms: Option<u64>,
    #[serde(default)]
    pub multifd_channels: Option<u8>,
    /// Fabric must set this only after checking the VM's storage policy and
    /// confirming the destination can see the exact same disk state.
    #[serde(default)]
    pub shared_storage_confirmed: bool,
}

impl Default for NativeMigrationOptions {
    fn default() -> Self {
        Self {
            mode: MigrationMode::PreCopy,
            bandwidth_mbps: None,
            max_downtime_ms: Some(300),
            multifd_channels: Some(4),
            shared_storage_confirmed: false,
        }
    }
}

#[derive(Clone)]
pub struct RuntimeMigrationManager {
    source: FluxVmClient,
}

impl RuntimeMigrationManager {
    pub fn new(source_fluxvm_url: impl AsRef<str>, token: Option<&str>) -> Result<Self> {
        let client = FluxVmClient::new(source_fluxvm_url)?;
        let source = match token {
            Some(token) if !token.is_empty() => client.with_token(token.to_owned()),
            _ => client,
        };
        Ok(Self { source })
    }

    pub async fn capabilities(&self) -> Result<RuntimeCapabilities> {
        self.source.runtime_capabilities().await
    }

    /// Start source-side VMM transport to an already-prepared target receiver.
    ///
    /// `target_uri` is normally `tcp:<migration-address>:<port>`. This method
    /// refuses to proceed when FluxVM says shared storage is required and the
    /// Fabric caller has not explicitly confirmed it.
    pub async fn start_prepared_target(
        &self,
        vm_name: &str,
        target_uri: &str,
        options: &NativeMigrationOptions,
    ) -> Result<MigrationStatus> {
        let caps = self.capabilities().await?;
        if caps.api_version != "runtime.fluxvm.zyvor.io/v1" {
            bail!("unsupported FluxVM runtime contract {}", caps.api_version);
        }

        let vm = self
            .source
            .find_by_name(vm_name)
            .await?
            .with_context(|| format!("FluxVM source has no VM named '{vm_name}'"))?;
        if vm.backend != BackendKind::Qemu {
            bail!(
                "native migration contract v1 supports qemu only (VM backend={:?})",
                vm.backend
            );
        }
        if vm.status != VmStatus::Running {
            bail!("VM '{vm_name}' must be running before live migration");
        }

        let capability = caps
            .migration
            .iter()
            .find(|c| c.backend == vm.backend && c.live)
            .context("source FluxVM does not advertise live migration for this backend")?;
        if capability.requires_shared_storage && !options.shared_storage_confirmed {
            bail!(
                "source runtime requires shared storage for migration contract v1; Fabric must confirm storage reachability before cutover"
            );
        }
        let transport = target_uri.split(':').next().unwrap_or_default();
        if !capability.transports.iter().any(|t| t == transport) {
            bail!(
                "target migration transport '{transport}' not advertised by source FluxVM ({:?})",
                capability.transports
            );
        }
        if options.mode == MigrationMode::PostCopy && !capability.post_copy {
            bail!("source FluxVM does not advertise post-copy migration");
        }
        if options.multifd_channels.unwrap_or(1) > 1 && !capability.multifd {
            bail!("source FluxVM does not advertise multifd migration");
        }

        self.source
            .start_migration(
                vm.id,
                &MigrationStartRequest {
                    destination: target_uri.to_string(),
                    mode: options.mode,
                    bandwidth_mbps: options.bandwidth_mbps,
                    max_downtime_ms: options.max_downtime_ms,
                    multifd_channels: options.multifd_channels,
                },
            )
            .await
    }

    pub async fn status(&self, vm_name: &str) -> Result<MigrationStatus> {
        let vm = self
            .source
            .find_by_name(vm_name)
            .await?
            .with_context(|| format!("FluxVM source has no VM named '{vm_name}'"))?;
        self.source.migration_status(vm.id).await
    }

    pub async fn cancel(&self, vm_name: &str) -> Result<MigrationStatus> {
        let vm = self
            .source
            .find_by_name(vm_name)
            .await?
            .with_context(|| format!("FluxVM source has no VM named '{vm_name}'"))?;
        self.source.cancel_migration(vm.id).await
    }
}

/// Deterministic UI/API progress estimate from QEMU's RAM counters.
pub fn progress_percent(status: &MigrationStatus) -> u8 {
    match status.phase {
        MigrationPhase::Completed => return 100,
        MigrationPhase::Failed | MigrationPhase::Cancelled => return 0,
        _ => {}
    }
    let transferred = status.ram_transferred.unwrap_or(0);
    let total = status
        .ram_total
        .or_else(|| status.ram_remaining.map(|r| transferred.saturating_add(r)))
        .unwrap_or(0);
    if total == 0 {
        return match status.phase {
            MigrationPhase::Setup => 1,
            MigrationPhase::Active | MigrationPhase::PostcopyActive => 50,
            _ => 0,
        };
    }
    ((transferred.saturating_mul(100) / total).min(99)) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    fn status(phase: MigrationPhase, transferred: u64, remaining: u64) -> MigrationStatus {
        MigrationStatus {
            phase,
            status: format!("{phase:?}"),
            ram_transferred: Some(transferred),
            ram_remaining: Some(remaining),
            ram_total: None,
            total_time_ms: None,
            downtime_ms: None,
            error: None,
        }
    }

    #[test]
    fn progress_uses_ram_counters_but_reserves_100_for_completed() {
        assert_eq!(
            progress_percent(&status(MigrationPhase::Active, 75, 25)),
            75
        );
        assert_eq!(
            progress_percent(&status(MigrationPhase::Active, 100, 0)),
            99
        );
        assert_eq!(
            progress_percent(&status(MigrationPhase::Completed, 100, 0)),
            100
        );
    }

    #[test]
    fn default_requires_explicit_shared_storage_confirmation() {
        assert!(!NativeMigrationOptions::default().shared_storage_confirmed);
    }
}
