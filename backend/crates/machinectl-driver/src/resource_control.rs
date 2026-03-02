use anyhow::Result;
use vmspawnd_driver_core::ResourceControlDriver;
use vmspawnd_machined_dbus::SystemdManagerProxy;
use zbus::zvariant::Value;

use crate::MachinectlDriver;

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
}
