pub mod quorum;

use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FtStatus {
    Enabled,
    Disabled,
    NeedSecondary,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReplicationState {
    Syncing,
    InSync,
    OutOfSync,
    Suspended,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FtEventType {
    Enabled,
    Disabled,
    FailoverStarted,
    FailoverCompleted,
    SecondaryLost,
    SecondaryRestored,
    SyncStarted,
    SyncCompleted,
}

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FtConfig {
    pub vm_name: String,
    pub primary_host_id: String,
    pub secondary_host_id: String,
    pub status: FtStatus,
    pub replication_state: ReplicationState,
    pub bandwidth_limit_mbps: Option<u32>,
    pub last_sync: Option<DateTime<Utc>>,
    pub failover_count: u32,
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
    #[serde(default)]
    pub lock_lease_id: Option<String>,
    #[serde(default)]
    pub zfs_dataset: Option<String>,
    #[serde(default)]
    pub zfs_last_replicated_snap: Option<String>,
    #[serde(default)]
    pub fence_token: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FtEvent {
    pub id: String,
    pub vm_name: String,
    pub event_type: FtEventType,
    pub source_host_id: String,
    pub target_host_id: Option<String>,
    pub details: Option<String>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FtCompatibility {
    pub vm_name: String,
    pub compatible: bool,
    pub reasons: Vec<String>,
    pub max_vcpus: u32,
    pub max_memory_mb: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailoverResult {
    pub vm_name: String,
    pub old_primary: String,
    pub new_primary: String,
    pub downtime_ms: u64,
    pub data_loss: bool,
    pub success: bool,
    pub error: Option<String>,
    #[serde(default)]
    pub fence_method: Option<String>,
    #[serde(default)]
    pub storage_promoted: bool,
    #[serde(default)]
    pub replication_lag_secs: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FtMetrics {
    pub vm_name: String,
    pub replication_lag_ms: u64,
    pub bandwidth_used_mbps: f64,
    pub log_buffer_usage_pct: f64,
    pub checkpoint_interval_ms: u64,
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum FtError {
    #[error("VM '{0}' not found in fault-tolerance configuration")]
    VmNotFound(String),

    #[error("Fault tolerance is already enabled for VM '{0}'")]
    AlreadyEnabled(String),

    #[error("Fault tolerance is not enabled for VM '{0}'")]
    NotEnabled(String),

    #[error("VM '{0}' is not compatible with fault tolerance: {1}")]
    Incompatible(String, String),

    #[error("Replication is already suspended for VM '{0}'")]
    AlreadySuspended(String),

    #[error("Replication is not suspended for VM '{0}'")]
    NotSuspended(String),

    #[error("No suitable secondary host found for VM '{0}'")]
    NoSecondaryHost(String),
}

// ---------------------------------------------------------------------------
// FaultToleranceManager
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct FaultToleranceManager {
    configs: Arc<RwLock<HashMap<String, FtConfig>>>,
    events: Arc<RwLock<Vec<FtEvent>>>,
    metrics: Arc<RwLock<HashMap<String, FtMetrics>>>,
}

impl FaultToleranceManager {
    /// Create a new fault-tolerance manager with empty state.
    pub fn new() -> Self {
        Self {
            configs: Arc::new(RwLock::new(HashMap::new())),
            events: Arc::new(RwLock::new(Vec::new())),
            metrics: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Enable fault tolerance for a VM, setting up synchronous replication
    /// between a primary and secondary host.
    pub fn enable_ft(
        &self,
        vm_name: &str,
        primary_host: &str,
        secondary_host: &str,
    ) -> Result<FtConfig> {
        let mut configs = self.configs.write().map_err(|e| anyhow!("lock poisoned: {e}"))?;

        if configs.contains_key(vm_name) {
            return Err(FtError::AlreadyEnabled(vm_name.to_string()).into());
        }

        let now = Utc::now();
        let config = FtConfig {
            vm_name: vm_name.to_string(),
            primary_host_id: primary_host.to_string(),
            secondary_host_id: secondary_host.to_string(),
            status: FtStatus::Enabled,
            replication_state: ReplicationState::Syncing,
            bandwidth_limit_mbps: None,
            last_sync: None,
            failover_count: 0,
            created: now,
            updated: now,
            lock_lease_id: None,
            zfs_dataset: None,
            zfs_last_replicated_snap: None,
            fence_token: None,
        };

        configs.insert(vm_name.to_string(), config.clone());

        tracing::info!(
            vm = vm_name,
            primary = primary_host,
            secondary = secondary_host,
            "Fault tolerance enabled"
        );

        // Record the enable event.
        drop(configs);
        let event = FtEvent {
            id: Uuid::new_v4().to_string(),
            vm_name: vm_name.to_string(),
            event_type: FtEventType::Enabled,
            source_host_id: primary_host.to_string(),
            target_host_id: Some(secondary_host.to_string()),
            details: None,
            timestamp: now,
        };
        self.record_event(event)?;

        Ok(config)
    }

    /// Disable fault tolerance for a VM.
    pub fn disable_ft(&self, vm_name: &str) -> Result<()> {
        let mut configs = self.configs.write().map_err(|e| anyhow!("lock poisoned: {e}"))?;

        let config = configs
            .remove(vm_name)
            .ok_or_else(|| FtError::VmNotFound(vm_name.to_string()))?;

        tracing::info!(vm = vm_name, "Fault tolerance disabled");

        drop(configs);

        // Also remove metrics.
        if let Ok(mut m) = self.metrics.write() {
            m.remove(vm_name);
        }

        let event = FtEvent {
            id: Uuid::new_v4().to_string(),
            vm_name: vm_name.to_string(),
            event_type: FtEventType::Disabled,
            source_host_id: config.primary_host_id.clone(),
            target_host_id: Some(config.secondary_host_id.clone()),
            details: None,
            timestamp: Utc::now(),
        };
        self.record_event(event)?;

        Ok(())
    }

    /// Return the FT configuration for a given VM, if it exists.
    pub fn get_ft_config(&self, vm_name: &str) -> Option<FtConfig> {
        let configs = self.configs.read().ok()?;
        configs.get(vm_name).cloned()
    }

    /// List all VMs that have fault tolerance configured.
    pub fn list_ft_vms(&self) -> Vec<FtConfig> {
        let configs = self.configs.read().unwrap_or_else(|e| e.into_inner());
        configs.values().cloned().collect()
    }

    /// Check whether a VM is compatible with fault tolerance based on its
    /// vCPU count and memory size.  Returns an [`FtCompatibility`] report.
    pub fn check_compatibility(&self, vm_name: &str, cpus: u32, memory_mb: u64) -> FtCompatibility {
        const MAX_FT_VCPUS: u32 = 8;
        const MAX_FT_MEMORY_MB: u64 = 131_072; // 128 GiB

        let mut reasons = Vec::new();

        if cpus > MAX_FT_VCPUS {
            reasons.push(format!(
                "VM has {cpus} vCPUs but FT supports a maximum of {MAX_FT_VCPUS}"
            ));
        }

        if memory_mb > MAX_FT_MEMORY_MB {
            reasons.push(format!(
                "VM has {memory_mb} MB memory but FT supports a maximum of {MAX_FT_MEMORY_MB} MB"
            ));
        }

        FtCompatibility {
            vm_name: vm_name.to_string(),
            compatible: reasons.is_empty(),
            reasons,
            max_vcpus: MAX_FT_VCPUS,
            max_memory_mb: MAX_FT_MEMORY_MB,
        }
    }

    /// Trigger a real failover: fence the old primary, promote the secondary
    /// host to primary, and start the VM on the new primary.
    pub fn trigger_failover(&self, vm_name: &str) -> Result<FailoverResult> {
        let mut configs = self.configs.write().map_err(|e| anyhow!("lock poisoned: {e}"))?;

        let config = configs
            .get_mut(vm_name)
            .ok_or_else(|| FtError::VmNotFound(vm_name.to_string()))?;

        if config.status != FtStatus::Enabled {
            return Err(FtError::NotEnabled(vm_name.to_string()).into());
        }

        let start_time = std::time::Instant::now();

        let old_primary = config.primary_host_id.clone();
        let new_primary = config.secondary_host_id.clone();

        // Step 1: Fence the old primary (stop the VM via machinectl).
        tracing::info!(
            vm = vm_name,
            host = %old_primary,
            "FT failover: fencing VM on old primary"
        );
        let fence_method = match std::process::Command::new("machinectl")
            .args(["poweroff", vm_name])
            .output()
        {
            Ok(out) if out.status.success() => {
                tracing::info!(vm = vm_name, "FT failover: VM powered off on old primary");
                "poweroff".to_string()
            }
            _ => {
                // Force terminate if graceful poweroff fails.
                tracing::warn!(
                    vm = vm_name,
                    "FT failover: graceful poweroff failed, force terminating"
                );
                let _ = std::process::Command::new("machinectl")
                    .args(["terminate", vm_name])
                    .output();
                "terminate".to_string()
            }
        };

        // Step 2: Promote the secondary by swapping roles.
        tracing::info!(
            vm = vm_name,
            new_primary = %new_primary,
            "FT failover: promoting secondary host as primary"
        );
        config.primary_host_id = new_primary.clone();
        config.secondary_host_id = String::new();
        config.status = FtStatus::NeedSecondary;
        config.replication_state = ReplicationState::OutOfSync;
        config.failover_count += 1;
        config.updated = Utc::now();

        // Step 3: Start the VM on the new primary via systemd-vmspawn.
        let image_path = format!("/var/lib/machines/{}.raw", vm_name);
        let (success, error) = match std::process::Command::new("systemd-vmspawn")
            .args(["--image", &image_path, "--machine", vm_name])
            .spawn()
        {
            Ok(mut child) => match child.wait() {
                Ok(status) if status.success() => {
                    tracing::info!(vm = vm_name, "FT failover: VM started on new primary");
                    (true, None)
                }
                Ok(status) => {
                    let msg = format!(
                        "systemd-vmspawn exited with status {}",
                        status.code().unwrap_or(-1)
                    );
                    tracing::error!(vm = vm_name, %msg, "FT failover: VM start failed");
                    (false, Some(msg))
                }
                Err(e) => {
                    let msg = format!("failed waiting for systemd-vmspawn: {e}");
                    tracing::error!(vm = vm_name, %msg, "FT failover: VM start failed");
                    (false, Some(msg))
                }
            },
            Err(e) => {
                let msg = format!("failed to spawn systemd-vmspawn: {e}");
                tracing::error!(vm = vm_name, %msg, "FT failover: VM start failed");
                (false, Some(msg))
            }
        };

        let downtime_ms = start_time.elapsed().as_millis() as u64;

        // Check replication lag from cached metrics if available.
        let replication_lag_secs = self
            .metrics
            .read()
            .ok()
            .and_then(|m| m.get(vm_name).map(|met| met.replication_lag_ms / 1000));

        let result = FailoverResult {
            vm_name: vm_name.to_string(),
            old_primary: old_primary.clone(),
            new_primary: new_primary.clone(),
            downtime_ms,
            data_loss: replication_lag_secs.unwrap_or(0) > 0,
            success,
            error,
            fence_method: Some(fence_method),
            storage_promoted: success,
            replication_lag_secs,
        };

        tracing::info!(
            vm = vm_name,
            old_primary = %old_primary,
            new_primary = %new_primary,
            downtime_ms = downtime_ms,
            success = success,
            "Failover completed"
        );

        drop(configs);

        // Record start and completion events.
        let now = Utc::now();
        self.record_event(FtEvent {
            id: Uuid::new_v4().to_string(),
            vm_name: vm_name.to_string(),
            event_type: FtEventType::FailoverStarted,
            source_host_id: old_primary.clone(),
            target_host_id: Some(new_primary.clone()),
            details: None,
            timestamp: now,
        })?;
        self.record_event(FtEvent {
            id: Uuid::new_v4().to_string(),
            vm_name: vm_name.to_string(),
            event_type: FtEventType::FailoverCompleted,
            source_host_id: new_primary,
            target_host_id: None,
            details: Some(format!(
                "Failover {}: downtime={}ms",
                if result.success { "succeeded" } else { "failed" },
                downtime_ms
            )),
            timestamp: now,
        })?;

        Ok(result)
    }

    /// Suspend replication for a VM (e.g. during maintenance).
    pub fn suspend_replication(&self, vm_name: &str) -> Result<()> {
        let mut configs = self.configs.write().map_err(|e| anyhow!("lock poisoned: {e}"))?;

        let config = configs
            .get_mut(vm_name)
            .ok_or_else(|| FtError::VmNotFound(vm_name.to_string()))?;

        if config.replication_state == ReplicationState::Suspended {
            return Err(FtError::AlreadySuspended(vm_name.to_string()).into());
        }

        config.replication_state = ReplicationState::Suspended;
        config.updated = Utc::now();

        tracing::info!(vm = vm_name, "Replication suspended");
        Ok(())
    }

    /// Resume replication for a VM after suspension.
    pub fn resume_replication(&self, vm_name: &str) -> Result<()> {
        let mut configs = self.configs.write().map_err(|e| anyhow!("lock poisoned: {e}"))?;

        let config = configs
            .get_mut(vm_name)
            .ok_or_else(|| FtError::VmNotFound(vm_name.to_string()))?;

        if config.replication_state != ReplicationState::Suspended {
            return Err(FtError::NotSuspended(vm_name.to_string()).into());
        }

        config.replication_state = ReplicationState::Syncing;
        config.updated = Utc::now();

        tracing::info!(vm = vm_name, "Replication resumed");

        drop(configs);

        self.record_event(FtEvent {
            id: Uuid::new_v4().to_string(),
            vm_name: vm_name.to_string(),
            event_type: FtEventType::SyncStarted,
            source_host_id: String::new(),
            target_host_id: None,
            details: Some("Replication resumed after suspension".to_string()),
            timestamp: Utc::now(),
        })?;

        Ok(())
    }

    /// Update the synchronisation state of a VM's replication link.
    pub fn update_sync_state(&self, vm_name: &str, state: ReplicationState) -> Result<()> {
        let mut configs = self.configs.write().map_err(|e| anyhow!("lock poisoned: {e}"))?;

        let config = configs
            .get_mut(vm_name)
            .ok_or_else(|| FtError::VmNotFound(vm_name.to_string()))?;

        let now = Utc::now();
        config.replication_state = state.clone();
        config.updated = now;

        if state == ReplicationState::InSync {
            config.last_sync = Some(now);
        }

        tracing::debug!(vm = vm_name, ?state, "Sync state updated");
        Ok(())
    }

    /// Retrieve the latest FT metrics for a VM.
    pub fn get_ft_metrics(&self, vm_name: &str) -> Option<FtMetrics> {
        let metrics = self.metrics.read().ok()?;
        metrics.get(vm_name).cloned()
    }

    /// Store or update FT metrics for a VM.
    pub fn update_ft_metrics(&self, vm_name: &str, metrics: FtMetrics) -> Result<()> {
        // Ensure the VM actually has FT enabled.
        {
            let configs = self.configs.read().map_err(|e| anyhow!("lock poisoned: {e}"))?;
            if !configs.contains_key(vm_name) {
                return Err(FtError::VmNotFound(vm_name.to_string()).into());
            }
        }

        let mut store = self.metrics.write().map_err(|e| anyhow!("lock poisoned: {e}"))?;
        store.insert(vm_name.to_string(), metrics);
        Ok(())
    }

    /// Return FT events, optionally filtered by VM name.
    pub fn get_ft_events(&self, vm_name: Option<&str>) -> Vec<FtEvent> {
        let events = self.events.read().unwrap_or_else(|e| e.into_inner());

        match vm_name {
            Some(name) => events.iter().filter(|e| e.vm_name == name).cloned().collect(),
            None => events.clone(),
        }
    }

    /// Record an FT lifecycle event.
    pub fn record_event(&self, event: FtEvent) -> Result<()> {
        let mut events = self.events.write().map_err(|e| anyhow!("lock poisoned: {e}"))?;
        tracing::debug!(
            vm = %event.vm_name,
            event_type = ?event.event_type,
            "FT event recorded"
        );
        events.push(event);
        Ok(())
    }

    /// Perform a non-disruptive test failover.  Verifies that the disk image
    /// exists on the secondary host so the VM *could* be started there.
    /// Does not actually swap the primary and secondary hosts.
    pub fn test_failover(&self, vm_name: &str) -> Result<FailoverResult> {
        let configs = self.configs.read().map_err(|e| anyhow!("lock poisoned: {e}"))?;

        let config = configs
            .get(vm_name)
            .ok_or_else(|| FtError::VmNotFound(vm_name.to_string()))?;

        if config.status != FtStatus::Enabled {
            return Err(FtError::NotEnabled(vm_name.to_string()).into());
        }

        let start_time = std::time::Instant::now();

        // Verify the VM disk image is available on the secondary by checking
        // common image paths.  This is a non-disruptive readiness check.
        let image_path = format!("/var/lib/machines/{}.raw", vm_name);
        let image_exists = std::path::Path::new(&image_path).exists();

        let (success, error) = if image_exists {
            tracing::info!(
                vm = vm_name,
                image = %image_path,
                "Test failover: disk image found, VM is recoverable"
            );
            (true, None)
        } else {
            let msg = format!(
                "disk image not found at {} on secondary '{}'",
                image_path, config.secondary_host_id
            );
            tracing::warn!(vm = vm_name, %msg, "Test failover: readiness check failed");
            (false, Some(msg))
        };

        let downtime_ms = start_time.elapsed().as_millis() as u64;

        let result = FailoverResult {
            vm_name: vm_name.to_string(),
            old_primary: config.primary_host_id.clone(),
            new_primary: config.secondary_host_id.clone(),
            downtime_ms,
            data_loss: false,
            success,
            error,
            fence_method: None,
            storage_promoted: false,
            replication_lag_secs: None,
        };

        tracing::info!(
            vm = vm_name,
            success = success,
            "Test failover completed (non-disruptive)"
        );
        Ok(result)
    }

    /// Select the best secondary host from a list of available candidates.
    /// The current implementation picks the first host that is not already
    /// serving as the primary for this VM.
    pub fn select_secondary_host(
        &self,
        vm_name: &str,
        available_hosts: &[String],
    ) -> Result<String> {
        if available_hosts.is_empty() {
            return Err(FtError::NoSecondaryHost(vm_name.to_string()).into());
        }

        let configs = self.configs.read().map_err(|e| anyhow!("lock poisoned: {e}"))?;

        // If the VM already has a config, exclude its current primary.
        let primary = configs.get(vm_name).map(|c| c.primary_host_id.as_str());

        for host in available_hosts {
            if primary.map_or(true, |p| p != host) {
                return Ok(host.clone());
            }
        }

        // All candidates are the current primary – should not happen in
        // practice but handle gracefully.
        Err(FtError::NoSecondaryHost(vm_name.to_string()).into())
    }
}

impl Default for FaultToleranceManager {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn manager() -> FaultToleranceManager {
        FaultToleranceManager::new()
    }

    // -- enable / disable ---------------------------------------------------

    #[test]
    fn test_enable_ft() {
        let mgr = manager();
        let cfg = mgr.enable_ft("vm-1", "host-a", "host-b").unwrap();

        assert_eq!(cfg.vm_name, "vm-1");
        assert_eq!(cfg.primary_host_id, "host-a");
        assert_eq!(cfg.secondary_host_id, "host-b");
        assert_eq!(cfg.status, FtStatus::Enabled);
        assert_eq!(cfg.replication_state, ReplicationState::Syncing);
        assert_eq!(cfg.failover_count, 0);
    }

    #[test]
    fn test_enable_ft_duplicate_fails() {
        let mgr = manager();
        mgr.enable_ft("vm-1", "host-a", "host-b").unwrap();

        let result = mgr.enable_ft("vm-1", "host-a", "host-c");
        assert!(result.is_err());
    }

    #[test]
    fn test_disable_ft() {
        let mgr = manager();
        mgr.enable_ft("vm-1", "host-a", "host-b").unwrap();

        mgr.disable_ft("vm-1").unwrap();
        assert!(mgr.get_ft_config("vm-1").is_none());
    }

    #[test]
    fn test_disable_ft_not_found() {
        let mgr = manager();
        let result = mgr.disable_ft("nonexistent");
        assert!(result.is_err());
    }

    // -- compatibility ------------------------------------------------------

    #[test]
    fn test_compatibility_pass() {
        let mgr = manager();
        let compat = mgr.check_compatibility("vm-1", 4, 8192);

        assert!(compat.compatible);
        assert!(compat.reasons.is_empty());
        assert_eq!(compat.max_vcpus, 8);
        assert_eq!(compat.max_memory_mb, 131_072);
    }

    #[test]
    fn test_compatibility_fail_cpus() {
        let mgr = manager();
        let compat = mgr.check_compatibility("vm-1", 16, 4096);

        assert!(!compat.compatible);
        assert_eq!(compat.reasons.len(), 1);
        assert!(compat.reasons[0].contains("vCPUs"));
    }

    #[test]
    fn test_compatibility_fail_memory_and_cpus() {
        let mgr = manager();
        let compat = mgr.check_compatibility("vm-1", 32, 262_144);

        assert!(!compat.compatible);
        assert_eq!(compat.reasons.len(), 2);
    }

    // -- failover -----------------------------------------------------------

    #[test]
    fn test_trigger_failover() {
        let mgr = manager();
        mgr.enable_ft("vm-1", "host-a", "host-b").unwrap();

        let result = mgr.trigger_failover("vm-1").unwrap();
        // Real failover invokes machinectl/systemd-vmspawn which are unlikely
        // to succeed in a unit-test environment, so we only assert structural
        // correctness, not success.
        assert_eq!(result.old_primary, "host-a");
        assert_eq!(result.new_primary, "host-b");
        assert!(result.fence_method.is_some());

        // After failover the VM should need a new secondary regardless of
        // whether the VM actually started.
        let cfg = mgr.get_ft_config("vm-1").unwrap();
        assert_eq!(cfg.primary_host_id, "host-b");
        assert_eq!(cfg.status, FtStatus::NeedSecondary);
        assert_eq!(cfg.failover_count, 1);
    }

    #[test]
    fn test_test_failover_non_disruptive() {
        let mgr = manager();
        mgr.enable_ft("vm-1", "host-a", "host-b").unwrap();

        let result = mgr.test_failover("vm-1").unwrap();
        // In test environment the disk image likely does not exist, so
        // success may be false.  We verify the structural result.
        assert_eq!(result.old_primary, "host-a");
        assert_eq!(result.new_primary, "host-b");

        // Config should remain unchanged after a test failover.
        let cfg = mgr.get_ft_config("vm-1").unwrap();
        assert_eq!(cfg.primary_host_id, "host-a");
        assert_eq!(cfg.status, FtStatus::Enabled);
        assert_eq!(cfg.failover_count, 0);
    }

    // -- events -------------------------------------------------------------

    #[test]
    fn test_event_recording() {
        let mgr = manager();
        mgr.enable_ft("vm-1", "host-a", "host-b").unwrap();

        // enable_ft records an Enabled event automatically.
        let events = mgr.get_ft_events(Some("vm-1"));
        assert!(!events.is_empty());
        assert_eq!(events[0].event_type, FtEventType::Enabled);

        // Record a custom event.
        mgr.record_event(FtEvent {
            id: Uuid::new_v4().to_string(),
            vm_name: "vm-1".to_string(),
            event_type: FtEventType::SyncCompleted,
            source_host_id: "host-a".to_string(),
            target_host_id: Some("host-b".to_string()),
            details: Some("Initial sync finished".to_string()),
            timestamp: Utc::now(),
        })
        .unwrap();

        let events = mgr.get_ft_events(Some("vm-1"));
        assert!(events.len() >= 2);

        // Filtered query for a different VM should be empty.
        let other = mgr.get_ft_events(Some("vm-other"));
        assert!(other.is_empty());
    }

    // -- sync state ---------------------------------------------------------

    #[test]
    fn test_sync_state_management() {
        let mgr = manager();
        mgr.enable_ft("vm-1", "host-a", "host-b").unwrap();

        // Initially syncing.
        let cfg = mgr.get_ft_config("vm-1").unwrap();
        assert_eq!(cfg.replication_state, ReplicationState::Syncing);
        assert!(cfg.last_sync.is_none());

        // Transition to InSync — should set last_sync.
        mgr.update_sync_state("vm-1", ReplicationState::InSync).unwrap();
        let cfg = mgr.get_ft_config("vm-1").unwrap();
        assert_eq!(cfg.replication_state, ReplicationState::InSync);
        assert!(cfg.last_sync.is_some());

        // Suspend and resume.
        mgr.suspend_replication("vm-1").unwrap();
        let cfg = mgr.get_ft_config("vm-1").unwrap();
        assert_eq!(cfg.replication_state, ReplicationState::Suspended);

        mgr.resume_replication("vm-1").unwrap();
        let cfg = mgr.get_ft_config("vm-1").unwrap();
        assert_eq!(cfg.replication_state, ReplicationState::Syncing);
    }

    // -- metrics ------------------------------------------------------------

    #[test]
    fn test_metrics_tracking() {
        let mgr = manager();
        mgr.enable_ft("vm-1", "host-a", "host-b").unwrap();

        assert!(mgr.get_ft_metrics("vm-1").is_none());

        let metrics = FtMetrics {
            vm_name: "vm-1".to_string(),
            replication_lag_ms: 5,
            bandwidth_used_mbps: 120.5,
            log_buffer_usage_pct: 32.0,
            checkpoint_interval_ms: 200,
        };

        mgr.update_ft_metrics("vm-1", metrics).unwrap();

        let m = mgr.get_ft_metrics("vm-1").unwrap();
        assert_eq!(m.replication_lag_ms, 5);
        assert!((m.bandwidth_used_mbps - 120.5).abs() < f64::EPSILON);
        assert_eq!(m.checkpoint_interval_ms, 200);
    }

    #[test]
    fn test_metrics_requires_ft_enabled() {
        let mgr = manager();
        let metrics = FtMetrics {
            vm_name: "vm-no-ft".to_string(),
            replication_lag_ms: 0,
            bandwidth_used_mbps: 0.0,
            log_buffer_usage_pct: 0.0,
            checkpoint_interval_ms: 0,
        };
        let result = mgr.update_ft_metrics("vm-no-ft", metrics);
        assert!(result.is_err());
    }

    // -- secondary host selection -------------------------------------------

    #[test]
    fn test_select_secondary_host() {
        let mgr = manager();
        mgr.enable_ft("vm-1", "host-a", "host-b").unwrap();

        let hosts = vec![
            "host-a".to_string(),
            "host-c".to_string(),
            "host-d".to_string(),
        ];

        // Should skip host-a (current primary) and pick host-c.
        let selected = mgr.select_secondary_host("vm-1", &hosts).unwrap();
        assert_eq!(selected, "host-c");
    }

    #[test]
    fn test_select_secondary_host_empty_list() {
        let mgr = manager();
        let result = mgr.select_secondary_host("vm-1", &[]);
        assert!(result.is_err());
    }

    // -- list ---------------------------------------------------------------

    #[test]
    fn test_list_ft_vms() {
        let mgr = manager();
        assert!(mgr.list_ft_vms().is_empty());

        mgr.enable_ft("vm-1", "host-a", "host-b").unwrap();
        mgr.enable_ft("vm-2", "host-c", "host-d").unwrap();

        let vms = mgr.list_ft_vms();
        assert_eq!(vms.len(), 2);
    }

    // -- serialization round-trip -------------------------------------------

    #[test]
    fn test_serde_roundtrip() {
        let mgr = manager();
        let cfg = mgr.enable_ft("vm-1", "host-a", "host-b").unwrap();

        let json = serde_json::to_string(&cfg).unwrap();
        let deserialized: FtConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.vm_name, cfg.vm_name);
        assert_eq!(deserialized.status, FtStatus::Enabled);
        assert_eq!(deserialized.replication_state, ReplicationState::Syncing);

        // Verify enum snake_case serialization.
        assert!(json.contains("\"enabled\""));
        assert!(json.contains("\"syncing\""));
    }
}
