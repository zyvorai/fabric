use serde::{Deserialize, Serialize};
use std::process::Command;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ZfsError {
    #[error("ZFS pool not found: {0}")]
    PoolNotFound(String),

    #[error("Dataset not found: {0}")]
    DatasetNotFound(String),

    #[error("Dataset already exists: {0}")]
    DatasetExists(String),

    #[error("Snapshot not found: {0}")]
    SnapshotNotFound(String),

    #[error("Command failed: {0}")]
    CommandFailed(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Parse error: {0}")]
    ParseError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZfsVolume {
    pub name: String,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub refer_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZfsStats {
    pub size_bytes: u64,
    pub alloc_bytes: u64,
    pub free_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZfsSnapshot {
    pub name: String,
    pub creation: String,
    pub used_bytes: u64,
}

pub struct ZfsPool {
    zpool: String,
    dataset: Option<String>,
}

impl ZfsPool {
    /// Create a new ZFS pool handle, validating the pool exists
    pub fn new(zpool: &str, dataset: Option<String>) -> Result<Self, ZfsError> {
        let output = Command::new("zpool")
            .args(["status", zpool])
            .output()?;

        if !output.status.success() {
            return Err(ZfsError::PoolNotFound(zpool.to_string()));
        }

        Ok(Self {
            zpool: zpool.to_string(),
            dataset,
        })
    }

    pub fn zpool_name(&self) -> &str {
        &self.zpool
    }

    /// Get the base path (zpool or zpool/dataset)
    fn base_path(&self) -> String {
        match &self.dataset {
            Some(ds) => format!("{}/{}", self.zpool, ds),
            None => self.zpool.clone(),
        }
    }

    /// Create a ZFS volume (zvol)
    pub fn create_volume(&self, name: &str, size: &str) -> Result<(), ZfsError> {
        let full_path = format!("{}/{}", self.base_path(), name);
        let output = Command::new("zfs")
            .args(["create", "-V", size, &full_path])
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(ZfsError::CommandFailed(format!(
                "zfs create zvol failed: {}", stderr
            )));
        }

        tracing::info!(zpool = %self.zpool, zvol = %name, size = %size, "Created ZFS volume");
        Ok(())
    }

    /// Create a ZFS dataset (filesystem)
    pub fn create_dataset(&self, name: &str) -> Result<(), ZfsError> {
        let full_path = format!("{}/{}", self.base_path(), name);
        let output = Command::new("zfs")
            .args(["create", &full_path])
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(ZfsError::CommandFailed(format!(
                "zfs create dataset failed: {}", stderr
            )));
        }

        tracing::info!(zpool = %self.zpool, dataset = %name, "Created ZFS dataset");
        Ok(())
    }

    /// Delete a ZFS volume or dataset
    pub fn delete_volume(&self, name: &str) -> Result<(), ZfsError> {
        let full_path = format!("{}/{}", self.base_path(), name);
        let output = Command::new("zfs")
            .args(["destroy", &full_path])
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(ZfsError::CommandFailed(format!(
                "zfs destroy failed: {}", stderr
            )));
        }

        tracing::info!(zpool = %self.zpool, name = %name, "Deleted ZFS volume/dataset");
        Ok(())
    }

    /// Resize a ZFS volume
    pub fn resize_volume(&self, name: &str, new_size: &str) -> Result<(), ZfsError> {
        let full_path = format!("{}/{}", self.base_path(), name);
        let property = format!("volsize={}", new_size);
        let output = Command::new("zfs")
            .args(["set", &property, &full_path])
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(ZfsError::CommandFailed(format!(
                "zfs set volsize failed: {}", stderr
            )));
        }

        tracing::info!(zpool = %self.zpool, name = %name, new_size = %new_size, "Resized ZFS volume");
        Ok(())
    }

    /// List all volumes/datasets under this pool
    pub fn list_volumes(&self) -> Result<Vec<ZfsVolume>, ZfsError> {
        let base = self.base_path();
        let output = Command::new("zfs")
            .args(["list", "-H", "-o", "name,used,avail,refer", "-r", &base])
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(ZfsError::CommandFailed(format!(
                "zfs list failed: {}", stderr
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut volumes = Vec::new();

        for line in stdout.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 4 {
                volumes.push(ZfsVolume {
                    name: parts[0].to_string(),
                    used_bytes: parse_zfs_size(parts[1]),
                    available_bytes: parse_zfs_size(parts[2]),
                    refer_bytes: parse_zfs_size(parts[3]),
                });
            }
        }

        Ok(volumes)
    }

    /// Get pool statistics
    pub fn get_stats(&self) -> Result<ZfsStats, ZfsError> {
        let output = Command::new("zpool")
            .args(["list", "-H", "-o", "size,alloc,free", &self.zpool])
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(ZfsError::CommandFailed(format!(
                "zpool list failed: {}", stderr
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let parts: Vec<&str> = stdout.trim().split('\t').collect();

        if parts.len() < 3 {
            return Err(ZfsError::ParseError("Unexpected zpool list output".to_string()));
        }

        Ok(ZfsStats {
            size_bytes: parse_zfs_size(parts[0]),
            alloc_bytes: parse_zfs_size(parts[1]),
            free_bytes: parse_zfs_size(parts[2]),
        })
    }

    /// Create a ZFS snapshot
    pub fn snapshot(&self, dataset: &str, snap_name: &str) -> Result<(), ZfsError> {
        let snap_path = format!("{}/{}@{}", self.base_path(), dataset, snap_name);
        let output = Command::new("zfs")
            .args(["snapshot", &snap_path])
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(ZfsError::CommandFailed(format!(
                "zfs snapshot failed: {}", stderr
            )));
        }

        tracing::info!(
            zpool = %self.zpool, dataset = %dataset, snapshot = %snap_name,
            "Created ZFS snapshot"
        );
        Ok(())
    }

    /// Rollback to a ZFS snapshot
    pub fn rollback(&self, dataset: &str, snap_name: &str) -> Result<(), ZfsError> {
        let snap_path = format!("{}/{}@{}", self.base_path(), dataset, snap_name);
        let output = Command::new("zfs")
            .args(["rollback", &snap_path])
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(ZfsError::CommandFailed(format!(
                "zfs rollback failed: {}", stderr
            )));
        }

        tracing::info!(
            zpool = %self.zpool, dataset = %dataset, snapshot = %snap_name,
            "Rolled back to ZFS snapshot"
        );
        Ok(())
    }

    /// List ZFS snapshots
    pub fn list_snapshots(&self) -> Result<Vec<ZfsSnapshot>, ZfsError> {
        let base = self.base_path();
        let output = Command::new("zfs")
            .args([
                "list", "-t", "snapshot", "-H",
                "-o", "name,creation,used",
                "-r", &base,
            ])
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(ZfsError::CommandFailed(format!(
                "zfs list snapshots failed: {}", stderr
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut snapshots = Vec::new();

        for line in stdout.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 3 {
                snapshots.push(ZfsSnapshot {
                    name: parts[0].to_string(),
                    creation: parts[1].to_string(),
                    used_bytes: parse_zfs_size(parts[2]),
                });
            }
        }

        Ok(snapshots)
    }

    /// Get the device path for a ZFS volume
    pub fn device_path(&self, zvol_name: &str) -> String {
        format!("/dev/zvol/{}/{}", self.base_path(), zvol_name)
    }
}

/// Parse ZFS human-readable sizes (e.g., "1.5G", "500M", "2T") to bytes.
/// Falls back to 0 on parse failure.
fn parse_zfs_size(s: &str) -> u64 {
    let s = s.trim();
    if s == "-" || s == "0" {
        return 0;
    }

    // Try to parse as a plain number first
    if let Ok(v) = s.parse::<u64>() {
        return v;
    }

    let (num_str, multiplier) = if let Some(n) = s.strip_suffix('T') {
        (n, 1024u64 * 1024 * 1024 * 1024)
    } else if let Some(n) = s.strip_suffix('G') {
        (n, 1024u64 * 1024 * 1024)
    } else if let Some(n) = s.strip_suffix('M') {
        (n, 1024u64 * 1024)
    } else if let Some(n) = s.strip_suffix('K') {
        (n, 1024u64)
    } else if let Some(n) = s.strip_suffix('B') {
        (n, 1u64)
    } else {
        (s, 1u64)
    };

    num_str
        .parse::<f64>()
        .map(|v| (v * multiplier as f64) as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_zfs_size() {
        assert_eq!(parse_zfs_size("0"), 0);
        assert_eq!(parse_zfs_size("-"), 0);
        assert_eq!(parse_zfs_size("1024"), 1024);
        assert_eq!(parse_zfs_size("1K"), 1024);
        assert_eq!(parse_zfs_size("1M"), 1024 * 1024);
        assert_eq!(parse_zfs_size("1G"), 1024 * 1024 * 1024);
        assert_eq!(parse_zfs_size("1T"), 1024u64 * 1024 * 1024 * 1024);
        assert_eq!(parse_zfs_size("1.5G"), (1.5 * 1024.0 * 1024.0 * 1024.0) as u64);
    }
}
