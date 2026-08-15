// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use std::collections::HashMap;
use std::pin::Pin;

use anyhow::Result;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use futures::Stream;
use serde::{Deserialize, Serialize};
use vm_model::{VMMetrics, VMPressure, VMState};

// ============================================================================
// Shared types
// ============================================================================

/// Information about a registered machine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MachineInfo {
    pub name: String,
    pub class: String,
    pub service: String,
    pub state: VMState,
    pub leader_pid: Option<u32>,
}

/// A single structured log entry from journal output.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: DateTime<Utc>,
    pub message: String,
    pub priority: u8,
    pub unit: String,
}

/// A boxed, pinned, sendable stream of log entries.
pub type LogStream = Pin<Box<dyn Stream<Item = LogEntry> + Send>>;

// ============================================================================
// Driver traits
// ============================================================================
//
// These use `#[async_trait]` (boxed futures) rather than native RPITIT
// (`impl Future<...> + Send`) specifically so `VmDriver` below is
// dyn-compatible — `zyvor-fabricd`'s `AppState.driver` needs to hold either a
// `MachinectlDriver` or an `EphemeraDriver` behind one `Arc<dyn VmDriver>`,
// selected at startup by config, and RPITIT traits cannot be turned into
// trait objects. This also matches the convention Ephemera's own
// `VmBackend` trait already uses.

/// Core VM lifecycle operations. Historically machined/systemd-shaped
/// (`name`-keyed, "enable at boot" semantics) — implementations backed by a
/// different engine (e.g. Ephemera) adapt to this shape rather than the
/// trait adapting to them, so callers don't need to care which backend is
/// active.
#[async_trait]
pub trait VMDriver: Send + Sync {
    /// Start a machine by name.
    async fn start(&self, name: &str) -> Result<()>;

    /// Graceful poweroff.
    async fn poweroff(&self, name: &str) -> Result<()>;

    /// Force terminate.
    async fn terminate(&self, name: &str) -> Result<()>;

    /// Reboot a machine.
    async fn reboot(&self, name: &str) -> Result<()>;

    /// Query the current state of a machine.
    async fn get_state(&self, name: &str) -> Result<VMState>;

    /// List all registered machines.
    async fn list_machines(&self) -> Result<Vec<MachineInfo>>;

    /// Retrieve all properties of a machine as key-value pairs.
    async fn get_properties(&self, name: &str) -> Result<HashMap<String, String>>;

    /// Get the PID of the machine leader process.
    async fn get_leader_pid(&self, name: &str) -> Result<u32>;

    /// Enable auto-start at boot.
    async fn enable(&self, name: &str) -> Result<()>;

    /// Disable auto-start at boot.
    async fn disable(&self, name: &str) -> Result<()>;

    /// Path to the machine's QEMU control (QMP) socket, if it has one.
    /// `None` for a machine with no QMP-capable monitor socket (e.g. not
    /// currently running, or a backend/hypervisor with no QMP equivalent).
    async fn get_control_socket(&self, name: &str) -> Result<Option<std::path::PathBuf>>;
}

/// Resource metrics collection from cgroup v2.
#[async_trait]
pub trait ResourceStatsDriver: Send + Sync {
    /// Collect current metrics for a machine.
    async fn get_metrics(&self, name: &str) -> Result<VMMetrics>;

    /// Collect PSI pressure metrics for a machine.
    async fn get_pressure(&self, name: &str) -> Result<VMPressure>;
}

/// Runtime resource control via cgroup v2 (systemd unit properties for the
/// machinectl backend; a vendored equivalent, per the migration plan, for
/// any backend not itself managed by systemd).
#[async_trait]
pub trait ResourceControlDriver: Send + Sync {
    /// Set CPU quota as a percentage (e.g. 200 = 2 full cores).
    async fn set_cpu_quota(&self, name: &str, percent: u32) -> Result<()>;

    /// Set memory limit in bytes.
    async fn set_memory_max(&self, name: &str, bytes: u64) -> Result<()>;

    /// Set I/O weight (1-10000, default 100).
    async fn set_io_weight(&self, name: &str, weight: u32) -> Result<()>;

    /// Freeze (pause) all processes in the machine's cgroup.
    async fn freeze(&self, name: &str) -> Result<()>;

    /// Thaw (resume) all processes in the machine's cgroup.
    async fn thaw(&self, name: &str) -> Result<()>;

    /// Check if the machine's cgroup is frozen.
    async fn is_frozen(&self, name: &str) -> Result<bool>;

    /// Set the maximum number of PIDs in the machine's cgroup.
    async fn set_pids_max(&self, name: &str, max: u64) -> Result<()>;

    /// Pin the machine to specific CPU cores.
    async fn set_cpuset(&self, name: &str, cpus: &[u32]) -> Result<()>;
}

/// Structured log streaming.
#[async_trait]
pub trait LogDriver: Send + Sync {
    /// Stream structured log entries for a machine scope.
    async fn stream_logs(&self, name: &str, lines: u32) -> Result<LogStream>;
}

/// Feature detection for optional capabilities.
pub trait CapabilityProvider: Send + Sync {
    /// A short, stable identifier for the active backend (e.g.
    /// `"machinectl"`, `"ephemera"`) — surfaced by health/capability
    /// endpoints instead of the systemd-specific `has_dbus`/`has_machined`
    /// booleans this replaced.
    fn backend_name(&self) -> &'static str;

    /// Whether resource control (cgroup v2 quota/freeze/etc.) is available.
    fn has_resource_control(&self) -> bool;
}

/// Umbrella trait letting `zyvor-fabricd` hold one `Arc<dyn VmDriver>` covering
/// every driver capability, instead of five separate trait objects. Blanket
/// `impl`'d for anything implementing the five component traits — backends
/// only need to implement those, never this trait directly.
pub trait VmDriver:
    VMDriver + ResourceStatsDriver + ResourceControlDriver + LogDriver + CapabilityProvider
{
}
impl<T> VmDriver for T where
    T: VMDriver + ResourceStatsDriver + ResourceControlDriver + LogDriver + CapabilityProvider
{
}
