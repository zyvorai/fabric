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
use vm_model::{VMMetrics, VMPressure, VMStartOptions, VMState, VM};

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
// dyn-compatible — `zyvor-fabricd`'s `AppState.driver` holds an
// `EphemeraDriver` behind `Arc<dyn VmDriver>`, and RPITIT traits cannot be
// turned into trait objects. This also matches the convention Ephemera's
// own `VmBackend` trait already uses.

/// Core VM lifecycle operations (`name`-keyed, "enable at boot" semantics)
/// — a shape kept from this trait's original systemd-machined-backed
/// design; implementations backed by a different engine (e.g. Ephemera)
/// adapt to this shape rather than the trait adapting to them, so callers
/// don't need to care which backend is active.
#[async_trait]
pub trait VMDriver: Send + Sync {
    /// Start a machine by name.
    async fn start(&self, name: &str) -> Result<()>;

    /// Start a machine with explicit low-level launch options (TPM,
    /// secure-boot, vsock, network-tap, bind mounts, credentials, ...).
    /// Unlike `start`, this bypasses whatever the backend would otherwise
    /// derive/replay for the machine — a backend that bakes launch options
    /// in at creation time rather than at start time (Ephemera) may not be
    /// able to honor every field and should error clearly rather than
    /// silently ignore what it can't apply.
    async fn start_with_options(&self, vm: &VM, opts: &VMStartOptions) -> Result<()>;

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

    /// The MAC address the machine's primary NIC was launched with, if
    /// known — `EphemeraDriver` returns the MAC it assigned at create
    /// time, which callers can resolve to an IP via a DHCP lease lookup.
    async fn get_mac_address(&self, name: &str) -> Result<Option<String>>;
}

/// Resource metrics collection from cgroup v2.
#[async_trait]
pub trait ResourceStatsDriver: Send + Sync {
    /// Collect current metrics for a machine.
    async fn get_metrics(&self, name: &str) -> Result<VMMetrics>;

    /// Collect PSI pressure metrics for a machine.
    async fn get_pressure(&self, name: &str) -> Result<VMPressure>;
}

/// Runtime resource control via cgroup v2.
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

    /// Read back the machine's currently pinned CPU cores (empty if never
    /// set — cgroup default is unrestricted).
    async fn get_cpuset(&self, name: &str) -> Result<Vec<u32>>;
}

/// Structured log streaming.
#[async_trait]
pub trait LogDriver: Send + Sync {
    /// Stream structured log entries for a machine scope.
    async fn stream_logs(&self, name: &str, lines: u32) -> Result<LogStream>;
}

/// Result of a `ShellDriver::shell` command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShellOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// Run a single non-interactive command inside a machine and collect its
/// output — Ephemera's vsock guest-agent `Exec` op (requires the VM to
/// have been created with the agent enabled; see `CreateVmRequest.agent`).
/// Not a substitute for a real interactive console/PTY.
#[async_trait]
pub trait ShellDriver: Send + Sync {
    async fn shell(&self, name: &str, command: &str, timeout_seconds: Option<u64>) -> Result<ShellOutput>;

    /// Copy a file from the host into the machine — Ephemera's vsock
    /// guest-agent `PutFile` op (same agent-enabled requirement as
    /// [`Self::shell`]). `mode` is Unix permission bits (e.g. `0o644`);
    /// `None` lets the backend pick its own default.
    async fn copy_to(&self, name: &str, host_path: &str, machine_path: &str, mode: Option<u32>) -> Result<()>;

    /// Copy a file from the machine to the host — Ephemera's vsock
    /// guest-agent `GetFile` op.
    async fn copy_from(&self, name: &str, machine_path: &str, host_path: &str) -> Result<()>;
}

/// One entry in the image registry — Ephemera's checksummed image catalog
/// (see `ImageDriver`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageInfo {
    pub name: String,
    /// Free-form backend-specific label, e.g. the on-disk format
    /// (`"qcow2"`) for Ephemera.
    pub image_type: String,
    pub read_only: bool,
    /// Free-form, backend-specific size representation rather than a
    /// parsed byte count, since not every backend can report one cheaply.
    pub size: String,
}

/// Manage named base/VM images independent of any specific machine —
/// Ephemera's checksummed image catalog. Every method must be implemented
/// by every backend; one with no real equivalent for a given operation
/// (see `EphemeraDriver`'s tar-format methods — a tar rootfs isn't a
/// bootable disk image for a real hardware VM) should return a clear "not
/// supported" error rather than silently no-op'ing — a caller has no way
/// to notice a silently-dropped image operation.
#[async_trait]
pub trait ImageDriver: Send + Sync {
    async fn list_images(&self) -> Result<Vec<ImageInfo>>;
    async fn clone_image(&self, source: &str, target: &str) -> Result<()>;
    async fn rename_image(&self, old_name: &str, new_name: &str) -> Result<()>;
    async fn remove_image(&self, name: &str) -> Result<()>;
    async fn set_image_read_only(&self, name: &str, read_only: bool) -> Result<()>;
    async fn pull_raw_image(&self, url: &str, name: &str, verify: bool) -> Result<()>;
    async fn pull_tar_image(&self, url: &str, name: &str, verify: bool) -> Result<()>;
    async fn import_raw_image(&self, path: &str, name: &str) -> Result<()>;
    async fn import_tar_image(&self, path: &str, name: &str) -> Result<()>;
    async fn export_raw_image(&self, name: &str, path: &str) -> Result<()>;
    async fn export_tar_image(&self, name: &str, path: &str) -> Result<()>;
    async fn clean_images(&self, all: bool) -> Result<()>;
}

/// Feature detection for optional capabilities.
pub trait CapabilityProvider: Send + Sync {
    /// A short, stable identifier for the active backend (`"ephemera"`)
    /// — surfaced by health/capability endpoints.
    fn backend_name(&self) -> &'static str;

    /// Whether resource control (cgroup v2 quota/freeze/etc.) is available.
    fn has_resource_control(&self) -> bool;
}

/// A live interactive console session (an already-open PTY connection) —
/// plain bytes both ways once the handshake underneath has completed, no
/// framing left on this side. Boxed/pinned so `ConsoleDriver::open_console`
/// can return one concrete type regardless of backend transport.
pub type ConsoleSession = std::pin::Pin<Box<dyn ConsoleIo>>;

/// Marker trait combining `AsyncRead`+`AsyncWrite`+`Send` into one
/// dyn-compatible bound, since `dyn AsyncRead + AsyncWrite` isn't directly
/// expressible. Blanket-`impl`'d — never implemented by hand.
pub trait ConsoleIo: tokio::io::AsyncRead + tokio::io::AsyncWrite + Send {}
impl<T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Send> ConsoleIo for T {}

/// Open an interactive shell on a machine — Ephemera's vsock `OpenShell` op,
/// relayed to the caller as a raw byte stream. No live terminal resize (the
/// size is fixed at open time — see `AgentRequest::OpenShell`'s doc comment
/// on the Ephemera side of this connection).
#[async_trait]
pub trait ConsoleDriver: Send + Sync {
    async fn open_console(&self, name: &str, cols: u16, rows: u16) -> Result<ConsoleSession>;
}

/// Umbrella trait letting `zyvor-fabricd` hold one `Arc<dyn VmDriver>` covering
/// every driver capability, instead of eight separate trait objects. Blanket
/// `impl`'d for anything implementing the eight component traits — backends
/// only need to implement those, never this trait directly.
pub trait VmDriver:
    VMDriver
    + ResourceStatsDriver
    + ResourceControlDriver
    + LogDriver
    + ImageDriver
    + ShellDriver
    + ConsoleDriver
    + CapabilityProvider
{
}
impl<T> VmDriver for T where
    T: VMDriver
        + ResourceStatsDriver
        + ResourceControlDriver
        + LogDriver
        + ImageDriver
        + ShellDriver
        + ConsoleDriver
        + CapabilityProvider
{
}
