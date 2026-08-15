// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use std::collections::HashMap;

use anyhow::{Context, Result};
use async_trait::async_trait;
use vm_model::VMState;
use zyvor_fabric_driver_core::{MachineInfo, VMDriver};
use zyvor_fabric_ephemera_client::{VmRecord, VmStatus};

use crate::EphemeraDriver;

#[async_trait]
impl VMDriver for EphemeraDriver {
    async fn start(&self, name: &str) -> Result<()> {
        let vm = self.resolve(name).await?;
        self.client.start_vm(vm.id).await.map(|_| ())
    }

    async fn poweroff(&self, name: &str) -> Result<()> {
        let vm = self.resolve(name).await?;
        self.client.stop_vm(vm.id).await.map(|_| ())
    }

    async fn terminate(&self, name: &str) -> Result<()> {
        // Ephemera's `stop` already does graceful-shutdown-then-SIGKILL
        // internally (see `VmManager::stop`) — there's no separate "force"
        // endpoint to escalate to, so terminate and poweroff are the same
        // call here.
        let vm = self.resolve(name).await?;
        self.client.stop_vm(vm.id).await.map(|_| ())
    }

    async fn reboot(&self, name: &str) -> Result<()> {
        // Ephemera has no reboot endpoint yet (would need a per-backend QMP
        // `system_reset`/`ch-remote` call — see the migration plan). Stop
        // then start is a coarser substitute: the guest sees a full
        // poweroff and cold boot rather than a soft reset, but it's a
        // functional stand-in until that lands.
        let vm = self.resolve(name).await?;
        self.client.stop_vm(vm.id).await?;
        self.client.start_vm(vm.id).await.map(|_| ())
    }

    async fn get_state(&self, name: &str) -> Result<VMState> {
        match self.client.find_by_name(name).await? {
            Some(vm) => Ok(map_status(vm.status)),
            None => Ok(VMState::Stopped),
        }
    }

    async fn list_machines(&self) -> Result<Vec<MachineInfo>> {
        Ok(self.client.list_vms().await?.into_iter().map(to_machine_info).collect())
    }

    async fn get_properties(&self, name: &str) -> Result<HashMap<String, String>> {
        let vm = self.resolve(name).await?;
        Ok(properties_of(&vm))
    }

    async fn get_leader_pid(&self, name: &str) -> Result<u32> {
        let vm = self.resolve(name).await?;
        vm.pid.with_context(|| format!("VM '{name}' has no leader pid (not running)"))
    }

    async fn enable(&self, _name: &str) -> Result<()> {
        // "Enable at boot" doesn't belong in Ephemera (a disposable-VM
        // engine, not a service manager) — per the migration plan this
        // becomes an `autostart` flag in zyvor-fabricd's own StateStore plus a
        // startup reconciliation pass, not yet wired up. No-op for now
        // rather than erroring, since nothing in zyvor-fabricd calls this yet.
        Ok(())
    }

    async fn disable(&self, _name: &str) -> Result<()> {
        Ok(())
    }
}

fn map_status(status: VmStatus) -> VMState {
    match status {
        VmStatus::Creating => VMState::Starting,
        VmStatus::Running => VMState::Running,
        VmStatus::Paused => VMState::Paused,
        VmStatus::Stopped => VMState::Stopped,
        VmStatus::Failed => VMState::Failed,
    }
}

fn to_machine_info(vm: VmRecord) -> MachineInfo {
    MachineInfo {
        name: vm.name,
        class: "vm".to_string(),
        service: "ephemera".to_string(),
        state: map_status(vm.status),
        leader_pid: vm.pid,
    }
}

fn properties_of(vm: &VmRecord) -> HashMap<String, String> {
    let mut props = HashMap::new();
    props.insert("Name".to_string(), vm.name.clone());
    props.insert("Class".to_string(), "vm".to_string());
    props.insert("Service".to_string(), "ephemera".to_string());
    props.insert("State".to_string(), format!("{:?}", vm.status).to_lowercase());
    props.insert("Leader".to_string(), vm.pid.map_or_else(String::new, |p| p.to_string()));
    props.insert("Backend".to_string(), format!("{:?}", vm.backend));
    props.insert("Id".to_string(), vm.id.to_string());
    props.insert("Disk".to_string(), vm.disk.display().to_string());
    if let Some(tap) = &vm.tap_name {
        props.insert("TapName".to_string(), tap.clone());
    }
    props
}
