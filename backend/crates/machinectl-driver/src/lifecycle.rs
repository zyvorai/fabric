// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use std::collections::HashMap;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use vm_model::VMState;
use zyvor_fabric_driver_core::{MachineInfo, VMDriver};
use vmspawnd_machined_dbus::{MachineManagerProxy, MachineProxy, SystemdManagerProxy};

use crate::MachinectlDriver;

#[async_trait]
impl VMDriver for MachinectlDriver {
    async fn start(&self, name: &str) -> Result<()> {
        // Try D-Bus first: start the vmspawn template unit
        let unit_name = format!("systemd-vmspawn@{}.service", name);
        let systemd = SystemdManagerProxy::new(&self.conn).await?;

        match systemd.start_unit(&unit_name, "replace").await {
            Ok(_) => {
                tracing::info!("Started {} via D-Bus", unit_name);
                return Ok(());
            }
            Err(e) => {
                tracing::warn!(
                    "D-Bus StartUnit failed for {}, falling back to CLI: {}",
                    unit_name,
                    e
                );
            }
        }

        // Fallback: shell out to machinectl
        let output = tokio::process::Command::new("machinectl")
            .args(["start", "--runner=vmspawn", name])
            .output()
            .await?;

        if output.status.success() {
            tracing::info!("Started '{}' via machinectl CLI", name);
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(anyhow!("Failed to start '{}': {}", name, stderr))
        }
    }

    async fn poweroff(&self, name: &str) -> Result<()> {
        let manager = MachineManagerProxy::new(&self.conn).await?;
        manager.power_off_machine(name).await?;
        tracing::info!("Powered off '{}'", name);
        Ok(())
    }

    async fn terminate(&self, name: &str) -> Result<()> {
        let manager = MachineManagerProxy::new(&self.conn).await?;
        manager.terminate_machine(name).await?;
        tracing::info!("Terminated '{}'", name);
        Ok(())
    }

    async fn reboot(&self, name: &str) -> Result<()> {
        // machined doesn't have a direct reboot call — send SIGINT to the leader
        // which systemd-vmspawn interprets as a reboot request, or fall back to CLI
        let output = tokio::process::Command::new("machinectl")
            .args(["reboot", name])
            .output()
            .await?;

        if output.status.success() {
            tracing::info!("Rebooted '{}'", name);
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(anyhow!("Failed to reboot '{}': {}", name, stderr))
        }
    }

    async fn get_state(&self, name: &str) -> Result<VMState> {
        let manager = MachineManagerProxy::new(&self.conn).await?;

        let obj_path = match manager.get_machine(name).await {
            Ok(path) => path,
            Err(_) => return Ok(VMState::Stopped),
        };

        let machine = MachineProxy::builder(&self.conn)
            .path(obj_path)?
            .build()
            .await?;

        let state_str = machine.state().await?;
        Ok(map_machine_state(&state_str))
    }

    async fn list_machines(&self) -> Result<Vec<MachineInfo>> {
        let manager = MachineManagerProxy::new(&self.conn).await?;
        let machines = manager.list_machines().await?;

        let mut result = Vec::with_capacity(machines.len());
        for (name, class, service, obj_path) in machines {
            // Read the machine's state and leader PID from its object
            let (state, leader_pid) = match MachineProxy::builder(&self.conn)
                .path(obj_path)?
                .build()
                .await
            {
                Ok(proxy) => {
                    let st = proxy.state().await.unwrap_or_default();
                    let pid = proxy.leader().await.ok();
                    (map_machine_state(&st), pid)
                }
                Err(_) => (VMState::Unknown, None),
            };

            result.push(MachineInfo {
                name,
                class,
                service,
                state,
                leader_pid,
            });
        }

        Ok(result)
    }

    async fn get_properties(&self, name: &str) -> Result<HashMap<String, String>> {
        let manager = MachineManagerProxy::new(&self.conn).await?;
        let obj_path = manager.get_machine(name).await?;

        let machine = MachineProxy::builder(&self.conn)
            .path(obj_path)?
            .build()
            .await?;

        let mut props = HashMap::new();
        props.insert("Name".to_string(), machine.name().await.unwrap_or_default());
        props.insert(
            "Class".to_string(),
            machine.class().await.unwrap_or_default(),
        );
        props.insert(
            "Service".to_string(),
            machine.service().await.unwrap_or_default(),
        );
        props.insert(
            "State".to_string(),
            machine.state().await.unwrap_or_default(),
        );
        props.insert(
            "Leader".to_string(),
            machine
                .leader()
                .await
                .map_or_else(|_| String::new(), |p| p.to_string()),
        );

        // Also try to get OS release info
        if let Ok(os_release) = manager.get_machine_os_release(name).await {
            for (k, v) in os_release {
                props.insert(format!("OSRelease.{}", k), v);
            }
        }

        Ok(props)
    }

    async fn get_leader_pid(&self, name: &str) -> Result<u32> {
        let manager = MachineManagerProxy::new(&self.conn).await?;
        let obj_path = manager.get_machine(name).await?;

        let machine = MachineProxy::builder(&self.conn)
            .path(obj_path)?
            .build()
            .await?;

        let pid = machine.leader().await?;
        Ok(pid)
    }

    async fn enable(&self, name: &str) -> Result<()> {
        let output = tokio::process::Command::new("machinectl")
            .args(["enable", name])
            .output()
            .await?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(anyhow!("Failed to enable '{}': {}", name, stderr))
        }
    }

    async fn disable(&self, name: &str) -> Result<()> {
        let output = tokio::process::Command::new("machinectl")
            .args(["disable", name])
            .output()
            .await?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(anyhow!("Failed to disable '{}': {}", name, stderr))
        }
    }
}

/// Map machined state strings to our VMState enum.
fn map_machine_state(state: &str) -> VMState {
    match state {
        "running" => VMState::Running,
        "opening" => VMState::Starting,
        "closing" => VMState::Stopping,
        "failed" => VMState::Failed,
        _ => VMState::Unknown,
    }
}
