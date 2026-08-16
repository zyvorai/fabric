// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

mod images;
mod lifecycle;
mod logs;
mod resource_control;
mod stats;

use anyhow::Result;
use zbus::Connection;

pub use zyvor_fabric_driver_core::{
    CapabilityProvider, ImageDriver, ImageInfo, LogDriver, LogEntry, MachineInfo,
    ResourceControlDriver, ResourceStatsDriver, VMDriver,
};

/// Main driver that implements all driver-core traits using native D-Bus calls.
///
/// Holds a single `zbus::Connection` to the system bus. The connection is
/// internally ref-counted and thread-safe.
#[derive(Clone)]
pub struct MachinectlDriver {
    conn: Connection,
}

impl MachinectlDriver {
    /// Create a new driver by connecting to the system D-Bus.
    pub async fn new() -> Result<Self> {
        let conn = vmspawnd_machined_dbus::system_bus().await?;
        Ok(Self { conn })
    }

    /// Create a driver from an existing connection (useful for testing).
    pub fn from_connection(conn: Connection) -> Self {
        Self { conn }
    }
}

impl CapabilityProvider for MachinectlDriver {
    fn backend_name(&self) -> &'static str {
        "machinectl"
    }

    fn has_resource_control(&self) -> bool {
        std::path::Path::new("/sys/fs/cgroup/machine.slice").exists()
    }
}
