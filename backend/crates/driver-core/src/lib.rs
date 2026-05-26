// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use std::collections::HashMap;
use std::pin::Pin;

use anyhow::Result;
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

/// Core VM lifecycle operations via machined / systemd.
pub trait VMDriver: Send + Sync {
    /// Start a machine by name.
    fn start(&self, name: &str) -> impl std::future::Future<Output = Result<()>> + Send;

    /// Graceful poweroff.
    fn poweroff(&self, name: &str) -> impl std::future::Future<Output = Result<()>> + Send;

    /// Force terminate.
    fn terminate(&self, name: &str) -> impl std::future::Future<Output = Result<()>> + Send;

    /// Reboot a machine.
    fn reboot(&self, name: &str) -> impl std::future::Future<Output = Result<()>> + Send;

    /// Query the current state of a machine.
    fn get_state(&self, name: &str) -> impl std::future::Future<Output = Result<VMState>> + Send;

    /// List all registered machines.
    fn list_machines(&self) -> impl std::future::Future<Output = Result<Vec<MachineInfo>>> + Send;

    /// Retrieve all properties of a machine as key-value pairs.
    fn get_properties(
        &self,
        name: &str,
    ) -> impl std::future::Future<Output = Result<HashMap<String, String>>> + Send;

    /// Get the PID of the machine leader process.
    fn get_leader_pid(&self, name: &str) -> impl std::future::Future<Output = Result<u32>> + Send;

    /// Enable auto-start at boot.
    fn enable(&self, name: &str) -> impl std::future::Future<Output = Result<()>> + Send;

    /// Disable auto-start at boot.
    fn disable(&self, name: &str) -> impl std::future::Future<Output = Result<()>> + Send;
}

/// Resource metrics collection from cgroup v2.
pub trait ResourceStatsDriver: Send + Sync {
    /// Collect current metrics for a machine.
    fn get_metrics(
        &self,
        name: &str,
    ) -> impl std::future::Future<Output = Result<VMMetrics>> + Send;

    /// Collect PSI pressure metrics for a machine.
    fn get_pressure(
        &self,
        name: &str,
    ) -> impl std::future::Future<Output = Result<VMPressure>> + Send;
}

/// Runtime resource control via systemd unit properties.
pub trait ResourceControlDriver: Send + Sync {
    /// Set CPU quota as a percentage (e.g. 200 = 2 full cores).
    fn set_cpu_quota(
        &self,
        name: &str,
        percent: u32,
    ) -> impl std::future::Future<Output = Result<()>> + Send;

    /// Set memory limit in bytes.
    fn set_memory_max(
        &self,
        name: &str,
        bytes: u64,
    ) -> impl std::future::Future<Output = Result<()>> + Send;

    /// Set I/O weight (1-10000, default 100).
    fn set_io_weight(
        &self,
        name: &str,
        weight: u32,
    ) -> impl std::future::Future<Output = Result<()>> + Send;

    /// Freeze (pause) all processes in the machine's cgroup.
    fn freeze(
        &self,
        name: &str,
    ) -> impl std::future::Future<Output = Result<()>> + Send;

    /// Thaw (resume) all processes in the machine's cgroup.
    fn thaw(
        &self,
        name: &str,
    ) -> impl std::future::Future<Output = Result<()>> + Send;

    /// Check if the machine's cgroup is frozen.
    fn is_frozen(
        &self,
        name: &str,
    ) -> impl std::future::Future<Output = Result<bool>> + Send;

    /// Set the maximum number of PIDs in the machine's cgroup.
    fn set_pids_max(
        &self,
        name: &str,
        max: u64,
    ) -> impl std::future::Future<Output = Result<()>> + Send;

    /// Pin the machine to specific CPU cores.
    fn set_cpuset(
        &self,
        name: &str,
        cpus: &[u32],
    ) -> impl std::future::Future<Output = Result<()>> + Send;
}

/// Structured log streaming from journal.
pub trait LogDriver: Send + Sync {
    /// Stream structured log entries for a machine scope.
    fn stream_logs(
        &self,
        name: &str,
        lines: u32,
    ) -> impl std::future::Future<Output = Result<LogStream>> + Send;
}

/// Feature detection for optional capabilities.
pub trait CapabilityProvider: Send + Sync {
    /// Whether the system bus is reachable.
    fn has_dbus(&self) -> bool;

    /// Whether machined is available.
    fn has_machined(&self) -> bool;

    /// Whether systemd resource control (cgroup v2) is available.
    fn has_resource_control(&self) -> bool;
}
