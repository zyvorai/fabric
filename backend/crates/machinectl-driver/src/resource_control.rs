// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use vmspawnd_cgroup::CgroupPath;
use vmspawnd_driver_core::ResourceControlDriver;
use vmspawnd_machined_dbus::SystemdManagerProxy;
use zbus::zvariant::Value;

use crate::MachinectlDriver;

#[async_trait]
impl ResourceControlDriver for MachinectlDriver {
    async fn set_cpu_quota(&self, name: &str, percent: u32) -> Result<()> {
        let scope = format!("machine-{}.scope", name);
        let systemd = SystemdManagerProxy::new(&self.conn).await?;

        // CPUQuotaPerSecUSec is in microseconds per second.
        // 100% = 1_000_000 usec, so percent * 10_000.
        let usec = (percent as u64) * 10_000;
        systemd
            .set_unit_properties(&scope, true, &[("CPUQuotaPerSecUSec", Value::U64(usec))])
            .await?;

        tracing::info!("Set CPU quota for '{}' to {}%", name, percent);
        Ok(())
    }

    async fn set_memory_max(&self, name: &str, bytes: u64) -> Result<()> {
        let scope = format!("machine-{}.scope", name);
        let systemd = SystemdManagerProxy::new(&self.conn).await?;

        systemd
            .set_unit_properties(&scope, true, &[("MemoryMax", Value::U64(bytes))])
            .await?;

        tracing::info!("Set memory max for '{}' to {} bytes", name, bytes);
        Ok(())
    }

    async fn set_io_weight(&self, name: &str, weight: u32) -> Result<()> {
        let scope = format!("machine-{}.scope", name);
        let systemd = SystemdManagerProxy::new(&self.conn).await?;

        systemd
            .set_unit_properties(&scope, true, &[("IOWeight", Value::U64(weight as u64))])
            .await?;

        tracing::info!("Set IO weight for '{}' to {}", name, weight);
        Ok(())
    }

    async fn freeze(&self, name: &str) -> Result<()> {
        let cgroup = CgroupPath::for_machine(name);
        let freezer = vmspawnd_cgroup::FreezerController::new(cgroup.path().to_path_buf());
        freezer
            .freeze()
            .map_err(|e| anyhow!("Failed to freeze '{}': {}", name, e))?;
        tracing::info!("Froze VM '{}'", name);
        Ok(())
    }

    async fn thaw(&self, name: &str) -> Result<()> {
        let cgroup = CgroupPath::for_machine(name);
        let freezer = vmspawnd_cgroup::FreezerController::new(cgroup.path().to_path_buf());
        freezer
            .thaw()
            .map_err(|e| anyhow!("Failed to thaw '{}': {}", name, e))?;
        tracing::info!("Thawed VM '{}'", name);
        Ok(())
    }

    async fn is_frozen(&self, name: &str) -> Result<bool> {
        let cgroup = CgroupPath::for_machine(name);
        let freezer = vmspawnd_cgroup::FreezerController::new(cgroup.path().to_path_buf());
        freezer
            .is_frozen()
            .map_err(|e| anyhow!("Failed to check frozen state for '{}': {}", name, e))
    }

    async fn set_pids_max(&self, name: &str, max: u64) -> Result<()> {
        let cgroup = CgroupPath::for_machine(name);
        let pids = vmspawnd_cgroup::PidsController::new(cgroup.path().to_path_buf());
        pids.set_max(max)
            .map_err(|e| anyhow!("Failed to set pids.max for '{}': {}", name, e))?;
        tracing::info!("Set pids.max for '{}' to {}", name, max);
        Ok(())
    }

    async fn set_cpuset(&self, name: &str, cpus: &[u32]) -> Result<()> {
        let cgroup = CgroupPath::for_machine(name);
        let cpuset = vmspawnd_cgroup::CpusetController::new(cgroup.path().to_path_buf());
        cpuset
            .set_cpus(cpus)
            .map_err(|e| anyhow!("Failed to set cpuset for '{}': {}", name, e))?;
        tracing::info!(
            "Set cpuset for '{}' to {}",
            name,
            vmspawnd_cgroup::format_set(cpus)
        );
        Ok(())
    }
}
