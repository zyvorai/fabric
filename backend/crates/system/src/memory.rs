use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum MemoryError {
    #[error("Failed to set memory limit: {0}")]
    SetLimitFailed(String),

    #[error("Failed to read memory stats: {0}")]
    ReadStatsFailed(String),

    #[error("cgroup not found: {0}")]
    CgroupNotFound(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Parse error: {0}")]
    ParseError(String),

    #[error("Hugepage allocation failed: {0}")]
    HugepageAllocationFailed(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum HugepageSize {
    Size2MB,
    Size1GB,
}

impl HugepageSize {
    pub fn as_kb(&self) -> u64 {
        match self {
            HugepageSize::Size2MB => 2048,
            HugepageSize::Size1GB => 1048576,
        }
    }

    pub fn as_str(&self) -> &str {
        match self {
            HugepageSize::Size2MB => "hugepages-2048kB",
            HugepageSize::Size1GB => "hugepages-1048576kB",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OvercommitPolicy {
    None,           // No overcommit, 1:1 allocation
    Conservative,   // 1.5x overcommit
    Aggressive,     // 2x overcommit
}

impl OvercommitPolicy {
    pub fn multiplier(&self) -> f64 {
        match self {
            OvercommitPolicy::None => 1.0,
            OvercommitPolicy::Conservative => 1.5,
            OvercommitPolicy::Aggressive => 2.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryStats {
    pub current_bytes: u64,
    pub max_bytes: u64,
    pub swap_current_bytes: u64,
    pub swap_max_bytes: u64,
    pub limit_bytes: u64,
    pub usage_percent: f64,
}

pub struct MemoryController {
    cgroup_path: PathBuf,
    vm_name: String,
}

impl MemoryController {
    pub fn new(vm_name: &str) -> Self {
        Self {
            cgroup_path: PathBuf::from(format!(
                "/sys/fs/cgroup/machine.slice/vmspawn-{}.scope",
                vm_name
            )),
            vm_name: vm_name.to_string(),
        }
    }

    /// Check if cgroup exists
    pub fn exists(&self) -> bool {
        self.cgroup_path.exists()
    }

    /// Set memory limit in bytes
    pub fn set_limit(&self, limit_bytes: u64) -> Result<(), MemoryError> {
        if !self.exists() {
            return Err(MemoryError::CgroupNotFound(self.vm_name.clone()));
        }

        let limit_path = self.cgroup_path.join("memory.max");
        fs::write(&limit_path, limit_bytes.to_string())
            .map_err(|e| MemoryError::SetLimitFailed(e.to_string()))?;

        Ok(())
    }

    /// Set swap limit in bytes
    pub fn set_swap_limit(&self, limit_bytes: u64) -> Result<(), MemoryError> {
        if !self.exists() {
            return Err(MemoryError::CgroupNotFound(self.vm_name.clone()));
        }

        let swap_path = self.cgroup_path.join("memory.swap.max");
        fs::write(&swap_path, limit_bytes.to_string())
            .map_err(|e| MemoryError::SetLimitFailed(e.to_string()))?;

        Ok(())
    }

    /// Disable swap for this VM
    pub fn disable_swap(&self) -> Result<(), MemoryError> {
        self.set_swap_limit(0)
    }

    /// Get current memory usage
    pub fn get_current_usage(&self) -> Result<u64, MemoryError> {
        if !self.exists() {
            return Err(MemoryError::CgroupNotFound(self.vm_name.clone()));
        }

        let usage_path = self.cgroup_path.join("memory.current");
        let usage = fs::read_to_string(&usage_path)
            .map_err(|e| MemoryError::ReadStatsFailed(e.to_string()))?;

        usage.trim()
            .parse()
            .map_err(|e| MemoryError::ParseError(format!("Failed to parse memory.current: {}", e)))
    }

    /// Get memory limit
    pub fn get_limit(&self) -> Result<u64, MemoryError> {
        if !self.exists() {
            return Err(MemoryError::CgroupNotFound(self.vm_name.clone()));
        }

        let limit_path = self.cgroup_path.join("memory.max");
        let limit = fs::read_to_string(&limit_path)
            .map_err(|e| MemoryError::ReadStatsFailed(e.to_string()))?;

        let limit_str = limit.trim();

        // "max" means no limit
        if limit_str == "max" {
            return Ok(u64::MAX);
        }

        limit_str
            .parse()
            .map_err(|e| MemoryError::ParseError(format!("Failed to parse memory.max: {}", e)))
    }

    /// Get swap usage
    pub fn get_swap_usage(&self) -> Result<u64, MemoryError> {
        if !self.exists() {
            return Err(MemoryError::CgroupNotFound(self.vm_name.clone()));
        }

        let swap_path = self.cgroup_path.join("memory.swap.current");

        if !swap_path.exists() {
            return Ok(0);
        }

        let swap = fs::read_to_string(&swap_path)
            .map_err(|e| MemoryError::ReadStatsFailed(e.to_string()))?;

        swap.trim()
            .parse()
            .map_err(|e| MemoryError::ParseError(format!("Failed to parse swap.current: {}", e)))
    }

    /// Get comprehensive memory statistics
    pub fn get_stats(&self) -> Result<MemoryStats, MemoryError> {
        let current_bytes = self.get_current_usage()?;
        let limit_bytes = self.get_limit()?;
        let swap_current_bytes = self.get_swap_usage()?;

        let usage_percent = if limit_bytes == u64::MAX {
            0.0
        } else {
            (current_bytes as f64 / limit_bytes as f64) * 100.0
        };

        // Read swap max from memory.swap.max
        let swap_max_bytes = {
            let swap_max_path = self.cgroup_path.join("memory.swap.max");
            if swap_max_path.exists() {
                match fs::read_to_string(&swap_max_path) {
                    Ok(content) => {
                        let value = content.trim();
                        if value == "max" {
                            // "max" means unlimited
                            u64::MAX
                        } else {
                            value.parse::<u64>().unwrap_or(0)
                        }
                    }
                    Err(_) => 0,
                }
            } else {
                0
            }
        };

        Ok(MemoryStats {
            current_bytes,
            max_bytes: limit_bytes,
            swap_current_bytes,
            swap_max_bytes,
            limit_bytes,
            usage_percent,
        })
    }

    /// Enable OOM killer for this cgroup
    pub fn enable_oom_killer(&self, enable: bool) -> Result<(), MemoryError> {
        if !self.exists() {
            return Err(MemoryError::CgroupNotFound(self.vm_name.clone()));
        }

        let oom_path = self.cgroup_path.join("memory.oom.group");

        if !oom_path.exists() {
            // Not all kernels support this
            return Ok(());
        }

        fs::write(&oom_path, if enable { "1" } else { "0" })
            .map_err(|e| MemoryError::SetLimitFailed(e.to_string()))?;

        Ok(())
    }
}

/// Hugepage management
pub struct HugepageManager;

impl HugepageManager {
    /// Allocate hugepages
    pub fn allocate(size: HugepageSize, count: u32) -> Result<(), MemoryError> {
        let path = PathBuf::from(format!(
            "/sys/kernel/mm/hugepages/{}",
            size.as_str()
        ));

        if !path.exists() {
            return Err(MemoryError::HugepageAllocationFailed(
                format!("Hugepage size {} not supported", size.as_str())
            ));
        }

        let nr_path = path.join("nr_hugepages");
        let current: u32 = fs::read_to_string(&nr_path)?
            .trim()
            .parse()
            .map_err(|e| MemoryError::ParseError(format!("Failed to parse nr_hugepages: {}", e)))?;

        let needed = current + count;

        fs::write(&nr_path, needed.to_string())
            .map_err(|e| MemoryError::HugepageAllocationFailed(e.to_string()))?;

        Ok(())
    }

    /// Get hugepage statistics
    pub fn get_stats(size: HugepageSize) -> Result<HugepageStats, MemoryError> {
        let path = PathBuf::from(format!(
            "/sys/kernel/mm/hugepages/{}",
            size.as_str()
        ));

        if !path.exists() {
            return Ok(HugepageStats {
                size,
                total: 0,
                free: 0,
                reserved: 0,
                surplus: 0,
            });
        }

        let total = Self::read_u32(&path.join("nr_hugepages"))?;
        let free = Self::read_u32(&path.join("free_hugepages"))?;
        let reserved = Self::read_u32(&path.join("resv_hugepages"))?;
        let surplus = Self::read_u32(&path.join("surplus_hugepages"))?;

        Ok(HugepageStats {
            size,
            total,
            free,
            reserved,
            surplus,
        })
    }

    fn read_u32(path: &PathBuf) -> Result<u32, MemoryError> {
        if !path.exists() {
            return Ok(0);
        }

        let content = fs::read_to_string(path)?;
        content.trim()
            .parse()
            .map_err(|e| MemoryError::ParseError(format!("Failed to parse {}: {}", path.display(), e)))
    }

    /// Get total system memory info
    pub fn get_system_memory() -> Result<SystemMemory, MemoryError> {
        let meminfo = fs::read_to_string("/proc/meminfo")?;

        let mut total_kb = 0u64;
        let mut free_kb = 0u64;
        let mut available_kb = 0u64;
        let mut buffers_kb = 0u64;
        let mut cached_kb = 0u64;

        for line in meminfo.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 2 {
                continue;
            }

            let value: u64 = parts[1].parse().unwrap_or(0);

            match parts[0] {
                "MemTotal:" => total_kb = value,
                "MemFree:" => free_kb = value,
                "MemAvailable:" => available_kb = value,
                "Buffers:" => buffers_kb = value,
                "Cached:" => cached_kb = value,
                _ => {}
            }
        }

        Ok(SystemMemory {
            total_kb,
            free_kb,
            available_kb,
            buffers_kb,
            cached_kb,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HugepageStats {
    pub size: HugepageSize,
    pub total: u32,
    pub free: u32,
    pub reserved: u32,
    pub surplus: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMemory {
    pub total_kb: u64,
    pub free_kb: u64,
    pub available_kb: u64,
    pub buffers_kb: u64,
    pub cached_kb: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hugepage_size() {
        assert_eq!(HugepageSize::Size2MB.as_kb(), 2048);
        assert_eq!(HugepageSize::Size1GB.as_kb(), 1048576);
    }

    #[test]
    fn test_overcommit_multiplier() {
        assert_eq!(OvercommitPolicy::None.multiplier(), 1.0);
        assert_eq!(OvercommitPolicy::Conservative.multiplier(), 1.5);
        assert_eq!(OvercommitPolicy::Aggressive.multiplier(), 2.0);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn test_system_memory() {
        let result = HugepageManager::get_system_memory();
        if result.is_ok() {
            let mem = result.unwrap();
            assert!(mem.total_kb > 0);
            println!("Total memory: {} MB", mem.total_kb / 1024);
        }
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn test_hugepage_stats() {
        let result = HugepageManager::get_stats(HugepageSize::Size2MB);
        if result.is_ok() {
            let stats = result.unwrap();
            println!("2MB hugepages: total={}, free={}", stats.total, stats.free);
        }
    }
}
