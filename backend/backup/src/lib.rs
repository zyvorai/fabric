// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use anyhow::Result;
use flate2::write::GzEncoder;
use flate2::Compression;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::path::{Path, PathBuf};
use tar::Builder;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Backup {
    pub id: String,
    pub vm_name: String,
    pub path: PathBuf,
    pub size_bytes: u64,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub metadata: BackupMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupMetadata {
    pub vm_config: serde_json::Value,
    pub disk_images: Vec<String>,
    pub snapshots: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupConfig {
    pub compress: bool,
    pub include_snapshots: bool,
    pub incremental: bool,
}

impl Default for BackupConfig {
    fn default() -> Self {
        Self {
            compress: true,
            include_snapshots: true,
            incremental: false,
        }
    }
}

pub struct BackupManager {
    backup_dir: PathBuf,
}

impl BackupManager {
    pub fn new<P: AsRef<Path>>(backup_dir: P) -> Result<Self> {
        let backup_dir = backup_dir.as_ref().to_path_buf();
        std::fs::create_dir_all(&backup_dir)?;
        Ok(Self { backup_dir })
    }

    /// Create a backup of a VM
    pub fn create_backup(
        &self,
        vm_name: &str,
        vm_path: &Path,
        config: &BackupConfig,
    ) -> Result<Backup> {
        tracing::info!("Creating backup for VM: {}", vm_name);

        let backup_id = uuid::Uuid::new_v4().to_string();
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let backup_filename = if config.compress {
            format!("{}_{}.tar.gz", vm_name, timestamp)
        } else {
            format!("{}_{}.tar", vm_name, timestamp)
        };

        let backup_path = self.backup_dir.join(&backup_filename);

        // Create tar archive
        if config.compress {
            let tar_gz = File::create(&backup_path)?;
            let enc = GzEncoder::new(tar_gz, Compression::default());
            let mut tar = Builder::new(enc);
            tar.append_dir_all(vm_name, vm_path)?;
            tar.finish()?;
        } else {
            let tar_file = File::create(&backup_path)?;
            let mut tar = Builder::new(tar_file);
            tar.append_dir_all(vm_name, vm_path)?;
            tar.finish()?;
        }

        let size_bytes = std::fs::metadata(&backup_path)?.len();

        let metadata = BackupMetadata {
            vm_config: serde_json::json!({
                "name": vm_name,
                "backup_time": chrono::Utc::now(),
            }),
            disk_images: vec![],
            snapshots: vec![],
        };

        let backup = Backup {
            id: backup_id,
            vm_name: vm_name.to_string(),
            path: backup_path,
            size_bytes,
            created_at: chrono::Utc::now(),
            metadata,
        };

        // Save backup metadata
        self.save_backup_metadata(&backup)?;

        tracing::info!(
            "Backup created successfully: {} ({} bytes)",
            backup_filename,
            size_bytes
        );

        Ok(backup)
    }

    /// Restore a VM from backup
    pub fn restore_backup(&self, backup: &Backup, target_path: &Path) -> Result<()> {
        tracing::info!("Restoring VM from backup: {}", backup.vm_name);

        std::fs::create_dir_all(target_path)?;

        // Extract tar archive
        let backup_file = File::open(&backup.path)?;

        if backup.path.extension().and_then(|s| s.to_str()) == Some("gz") {
            let tar = flate2::read::GzDecoder::new(backup_file);
            let mut archive = tar::Archive::new(tar);
            archive.unpack(target_path)?;
        } else {
            let mut archive = tar::Archive::new(backup_file);
            archive.unpack(target_path)?;
        }

        tracing::info!("VM restored successfully from backup");

        Ok(())
    }

    /// List all backups
    pub fn list_backups(&self) -> Result<Vec<Backup>> {
        let mut backups = Vec::new();

        for entry in std::fs::read_dir(&self.backup_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                let content = std::fs::read_to_string(&path)?;
                if let Ok(backup) = serde_json::from_str::<Backup>(&content) {
                    backups.push(backup);
                }
            }
        }

        backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        Ok(backups)
    }

    /// Delete a backup
    pub fn delete_backup(&self, backup_id: &str) -> Result<()> {
        let backups = self.list_backups()?;

        if let Some(backup) = backups.iter().find(|b| b.id == backup_id) {
            std::fs::remove_file(&backup.path)?;
            let metadata_path = self.backup_dir.join(format!("{}.json", backup_id));
            if metadata_path.exists() {
                std::fs::remove_file(metadata_path)?;
            }
            tracing::info!("Backup deleted: {}", backup_id);
        }

        Ok(())
    }

    /// Save backup metadata
    fn save_backup_metadata(&self, backup: &Backup) -> Result<()> {
        let metadata_path = self.backup_dir.join(format!("{}.json", backup.id));
        let json = serde_json::to_string_pretty(backup)?;
        std::fs::write(metadata_path, json)?;
        Ok(())
    }

    /// Get backup by ID
    pub fn get_backup(&self, backup_id: &str) -> Result<Option<Backup>> {
        let metadata_path = self.backup_dir.join(format!("{}.json", backup_id));

        if metadata_path.exists() {
            let content = std::fs::read_to_string(metadata_path)?;
            let backup = serde_json::from_str(&content)?;
            Ok(Some(backup))
        } else {
            Ok(None)
        }
    }
}
