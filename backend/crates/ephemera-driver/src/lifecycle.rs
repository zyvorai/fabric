// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use std::collections::HashMap;
use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use async_trait::async_trait;
use vm_model::{VMStartOptions, VMState, VM};
use zyvor_fabric_driver_core::{MachineInfo, VMDriver};
use zyvor_fabric_ephemera_client::{BackendKind, CreateVmRequest, NetworkSpec, VmRecord, VmStatus};

use crate::EphemeraDriver;

#[async_trait]
impl VMDriver for EphemeraDriver {
    async fn start(&self, name: &str) -> Result<()> {
        let vm = self.resolve(name).await?;
        self.client.start_vm(vm.id).await.map(|_| ())
    }

    async fn start_with_options(&self, vm: &VM, opts: &VMStartOptions) -> Result<()> {
        // Already known to Ephemera: options were (or should have been)
        // baked in at creation time — replay the stored request rather
        // than trying to apply a second, possibly-different option set.
        if let Some(record) = self.client.find_by_name(&vm.name).await? {
            return self.client.start_vm(record.id).await.map(|_| ());
        }
        // First launch: translate into an Ephemera CreateVmRequest.
        let req = translate_start_options(vm, opts)?;
        self.client.create_vm(&req).await.map(|_| ())
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

    async fn get_control_socket(&self, name: &str) -> Result<Option<std::path::PathBuf>> {
        Ok(self.resolve(name).await?.control_socket)
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

/// Translate a `vm-model` `VM`/`VMStartOptions` pair — systemd-vmspawn's
/// launch-option shape — into an Ephemera `CreateVmRequest`. Errors loudly
/// on any option Ephemera has no equivalent for yet (per the
/// systemd-removal migration plan's Ephemera gap list) rather than
/// silently dropping it, since a dropped option is a correctness bug a
/// caller has no way to notice.
fn translate_start_options(vm: &VM, opts: &VMStartOptions) -> Result<CreateVmRequest> {
    if opts.directory.is_some() {
        bail!("the ephemera backend does not support directory-based boot (VMStartOptions.directory)");
    }
    if opts.tpm == Some(true) {
        bail!("the ephemera backend does not yet support TPM (VMStartOptions.tpm)");
    }
    if opts.secure_boot == Some(true) {
        bail!("the ephemera backend does not yet support secure boot (VMStartOptions.secure_boot)");
    }
    if opts.vsock == Some(true) {
        bail!(
            "the ephemera backend does not support raw vsock passthrough (VMStartOptions.vsock) \
             — use CreateVmRequest.agent for the in-guest vsock agent instead"
        );
    }
    if !opts.bind_mounts.is_empty() {
        bail!("the ephemera backend does not support bind mounts (VMStartOptions.bind_mounts)");
    }
    if !opts.extra_drives.is_empty() {
        bail!("the ephemera backend does not support extra drives (VMStartOptions.extra_drives)");
    }
    if !opts.bind_users.is_empty() {
        bail!("the ephemera backend does not support bind users (VMStartOptions.bind_users)");
    }
    if !opts.credentials.is_empty() || !opts.load_credentials.is_empty() {
        bail!(
            "the ephemera backend does not support systemd credentials \
             (VMStartOptions.credentials/load_credentials) — use cloud_init instead"
        );
    }
    if !opts.smbios11.is_empty() {
        bail!("the ephemera backend does not support SMBIOS injection (VMStartOptions.smbios11)");
    }

    let vcpus: u8 = vm
        .cpus
        .try_into()
        .map_err(|_| anyhow::anyhow!("vcpu count {} exceeds the ephemera backend's limit", vm.cpus))?;

    let network = if opts.network_tap {
        NetworkSpec::Tap { tap_name: None, bridge: None, mac: vm.mac_address.clone() }
    } else {
        NetworkSpec::User { forwards: vec![] }
    };

    Ok(CreateVmRequest {
        name: vm.name.clone(),
        backend: BackendKind::Qemu,
        image: PathBuf::from(&vm.image),
        vcpus,
        memory_mib: vm.memory,
        disk_size_gib: if vm.disk > 0 { Some(vm.disk) } else { None },
        kernel: opts.linux.clone().map(PathBuf::from),
        initrd: opts.initrd.first().cloned().map(PathBuf::from),
        firmware: opts.firmware.clone().map(PathBuf::from),
        kernel_args: if opts.extra_args.is_empty() { None } else { Some(opts.extra_args.join(" ")) },
        network,
        cloud_init: None,
        ttl_seconds: None,
        extra_args: vec![],
        agent: None,
    })
}
