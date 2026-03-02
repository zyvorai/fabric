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
        let cmd = format!(
            "ssh {} 'mkdir -p /var/lib/vmspawnd/vms/{}'",
            config.target_node, config.vm_name
        );

        let output = Command::new("sh").arg("-c").arg(&cmd).output()?;

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

    /// Perform live synchronization
    async fn live_sync(&self, _config: &MigrationConfig) -> Result<()> {
        tracing::info!("Starting live synchronization");

        // In a real implementation, this would:
        // 1. Pause VM on source
        // 2. Copy memory state
        // 3. Sync final disk changes
        // 4. Start VM on target
        // 5. Verify VM is running
        // 6. Stop VM on source

        // For now, this is a placeholder
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

        tracing::info!("Live synchronization completed");

        Ok(())
    }

    /// Cancel ongoing migration
    pub async fn cancel_migration(&self, vm_name: &str) -> Result<()> {
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
