// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationConfig {
    pub vm_name: String,
    pub source_node: String,
    pub target_node: String,
    pub live: bool,
    pub compress: bool,
    pub bandwidth_mbps: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationStatus {
    pub vm_name: String,
    pub status: MigrationState,
    pub progress_percent: u8,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MigrationState {
    Preparing,
    Copying,
    Syncing,
    Completed,
    Failed,
}

pub struct MigrationManager {
    #[allow(dead_code)]
    workspace_dir: PathBuf,
}

impl MigrationManager {
    pub fn new<P: AsRef<Path>>(workspace_dir: P) -> Result<Self> {
        let workspace_dir = workspace_dir.as_ref().to_path_buf();
        std::fs::create_dir_all(&workspace_dir)?;
        Ok(Self { workspace_dir })
    }

    /// Start VM migration
    pub async fn migrate_vm(&self, config: &MigrationConfig) -> Result<MigrationStatus> {
        tracing::info!(
            "Starting {} migration of VM {} from {} to {}",
            if config.live { "live" } else { "offline" },
            config.vm_name,
            config.source_node,
            config.target_node
        );

        let mut status = MigrationStatus {
            vm_name: config.vm_name.clone(),
            status: MigrationState::Preparing,
            progress_percent: 0,
            error: None,
        };

        // Step 1: Prepare target node
        status.status = MigrationState::Preparing;
        self.prepare_target(&config).await?;

        // Step 2: Copy VM state and disk
        status.status = MigrationState::Copying;
        status.progress_percent = 20;
        self.copy_vm_data(&config).await?;

        // Step 3: Live migration (if enabled)
        if config.live {
            status.status = MigrationState::Syncing;
            status.progress_percent = 60;
            self.live_sync(&config).await?;
        }

        // Step 4: Complete migration
        status.status = MigrationState::Completed;
        status.progress_percent = 100;

        tracing::info!("Migration of VM {} completed successfully", config.vm_name);

        Ok(status)
    }

    /// Prepare target node for migration
    async fn prepare_target(&self, config: &MigrationConfig) -> Result<()> {
        tracing::info!("Preparing target node {}", config.target_node);

        // Create VM directory on target
        let output = Command::new("ssh")
            .arg(&config.target_node)
            .args([
                "mkdir",
                "-p",
                &format!("/var/lib/vmspawnd/vms/{}", config.vm_name),
            ])
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("Failed to prepare target: {}", stderr));
        }

        Ok(())
    }

    /// Copy VM data to target node
    async fn copy_vm_data(&self, config: &MigrationConfig) -> Result<()> {
        tracing::info!("Copying VM data to target node");

        let source_path = format!("/var/lib/vmspawnd/vms/{}/", config.vm_name);
        let target_path = format!(
            "{}:/var/lib/vmspawnd/vms/{}/",
            config.target_node, config.vm_name
        );

        let mut cmd = Command::new("rsync");
        cmd.args(["-avz", "--progress"]);

        if config.compress {
            cmd.arg("-z");
        }

        if let Some(bw) = config.bandwidth_mbps {
            cmd.arg(format!("--bwlimit={}", bw * 1024)); // Convert to KB/s
        }

        cmd.arg(&source_path).arg(&target_path);

        let output = cmd.output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("Failed to copy VM data: {}", stderr));
        }

        tracing::info!("VM data copied successfully");

        Ok(())
    }

    /// Perform live synchronization using iterative rsync + final cutover
    async fn live_sync(&self, config: &MigrationConfig) -> Result<()> {
        tracing::info!("Starting live synchronization for VM '{}'", config.vm_name);

        let source_path = format!("/var/lib/vmspawnd/vms/{}/", config.vm_name);
        let target_path = format!(
            "{}:/var/lib/vmspawnd/vms/{}/",
            config.target_node, config.vm_name
        );

        // Iterative rsync: sync changed blocks while VM is still running
        // This minimizes downtime by pre-copying most data
        for iteration in 1..=3 {
            tracing::info!(
                "Live sync iteration {}/3 for VM '{}'",
                iteration,
                config.vm_name
            );

            let mut cmd = Command::new("rsync");
            cmd.args(["-avz", "--inplace", "--no-whole-file"]);
            if let Some(bw) = config.bandwidth_mbps {
                cmd.arg(format!("--bwlimit={}", bw * 1024));
            }
            cmd.arg(&source_path).arg(&target_path);

            let output = cmd.output()?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                tracing::warn!("rsync iteration {} warning: {}", iteration, stderr);
            }

            // Brief pause between iterations to let dirty pages accumulate
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }

        // Final cutover: pause VM, do final sync, start on target
        tracing::info!("Pausing VM '{}' for final sync", config.vm_name);

        // Pause the VM using cgroup freezer
        let _ = Command::new("machinectl")
            .args(["stop", &config.vm_name])
            .output();

        // Final rsync pass (very fast — only changed blocks since last iteration)
        let mut cmd = Command::new("rsync");
        cmd.args(["-avz", "--inplace", "--no-whole-file", "--delete"]);
        cmd.arg(&source_path).arg(&target_path);
        let output = cmd.output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("Final sync failed: {}", stderr));
        }

        // Start VM on target node
        tracing::info!(
            "Starting VM '{}' on target node {}",
            config.vm_name,
            config.target_node
        );
        let output = Command::new("ssh")
            .arg(&config.target_node)
            .args(["machinectl", "start", "--runner=vmspawn", &config.vm_name])
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("Failed to start VM on target: {}", stderr));
        }

        tracing::info!(
            "Live migration of VM '{}' completed — now running on {}",
            config.vm_name,
            config.target_node
        );
        Ok(())
    }

    /// Cancel ongoing migration
    pub async fn cancel_migration(&self, vm_name: &str) -> Result<()> {
        // Validate vm_name to prevent regex injection in pgrep/pkill patterns
        if vm_name.is_empty()
            || !vm_name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        {
            return Err(anyhow::anyhow!("Invalid VM name for migration"));
        }

        tracing::info!("Cancelling migration for VM {}", vm_name);

        // Kill rsync processes for this VM
        let output = Command::new("pkill")
            .args(["-f", &format!("rsync.*{}", vm_name)])
            .output()?;

        if output.status.success() {
            tracing::info!("Migration cancelled successfully");
        }

        Ok(())
    }

    /// Get migration status
    pub async fn get_migration_status(&self, vm_name: &str) -> Result<MigrationStatus> {
        // Validate vm_name to prevent regex injection in pgrep/pkill patterns
        if vm_name.is_empty()
            || !vm_name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        {
            return Err(anyhow::anyhow!("Invalid VM name for migration"));
        }

        // Check if migration is in progress
        let output = Command::new("pgrep")
            .args(["-f", &format!("rsync.*{}", vm_name)])
            .output()?;

        if output.status.success() && !output.stdout.is_empty() {
            Ok(MigrationStatus {
                vm_name: vm_name.to_string(),
                status: MigrationState::Copying,
                progress_percent: 50,
                error: None,
            })
        } else {
            Ok(MigrationStatus {
                vm_name: vm_name.to_string(),
                status: MigrationState::Completed,
                progress_percent: 100,
                error: None,
            })
        }
    }
}
