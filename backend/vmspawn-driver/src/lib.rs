// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

pub mod machinectl;
pub mod qemu;

use anyhow::{anyhow, Result};
use std::fs;
use std::process::Command;
use vm_model::{CreateVMRequest, ManagerScope, VMMetrics, VMStartOptions, VMState, VM};

pub fn create_vm(req: &CreateVMRequest) -> Result<VM> {
    let vm = VM::from_request(req);
    Ok(vm)
}

/// Start a VM using systemd-vmspawn with proper flags.
///
/// Supports the full systemd-vmspawn(1) interface as documented in
/// systemd v260. See the man page for details on each option.
///
/// This is a blocking function. When calling from async context, wrap
/// the call in `tokio::task::spawn_blocking`.
pub fn start_vm_with_options(vm: &VM, opts: &VMStartOptions) -> Result<()> {
    // Validate all options before building the command
    opts.validate()
        .map_err(|errors| anyhow!("Invalid start options: {}", errors.join("; ")))?;

    let mut cmd = Command::new("systemd-vmspawn");

    // -- Manager Scope --
    match opts.scope {
        Some(ManagerScope::System) => {
            cmd.arg("--system");
        }
        Some(ManagerScope::User) => {
            cmd.arg("--user");
        }
        None => {}
    }

    // -- Input/Output Options --
    if opts.quiet {
        cmd.arg("--quiet");
    }

    // -- Image Options --
    if let Some(ref dir) = opts.directory {
        cmd.arg(format!("--directory={}", dir));
    } else {
        let image_path = resolve_image_path(&vm.image, &vm.name);
        cmd.arg(format!("--image={}", image_path));
    }

    // -- Host Configuration --
    cmd.arg(format!("--cpus={}", vm.cpus));

    let mem_str = if vm.memory >= 1024 && vm.memory % 1024 == 0 {
        format!("{}G", vm.memory / 1024)
    } else {
        format!("{}M", vm.memory)
    };
    cmd.arg(format!("--ram={}", mem_str));

    if let Some(kvm) = opts.kvm {
        cmd.arg(format!("--kvm={}", if kvm { "yes" } else { "no" }));
    }

    if let Some(vsock) = opts.vsock {
        cmd.arg(format!("--vsock={}", if vsock { "yes" } else { "no" }));
    }
    if let Some(cid) = opts.vsock_cid {
        cmd.arg(format!("--vsock-cid={}", cid));
    }

    if let Some(tpm) = opts.tpm {
        cmd.arg(format!("--tpm={}", if tpm { "yes" } else { "no" }));
    }
    if let Some(ref tpm_state) = opts.tpm_state {
        cmd.arg(format!("--tpm-state={}", tpm_state));
    }

    if let Some(ref linux) = opts.linux {
        cmd.arg(format!("--linux={}", linux));
    }
    for initrd in &opts.initrd {
        cmd.arg(format!("--initrd={}", initrd));
    }

    if opts.network_tap {
        cmd.arg("--network-tap");
    }
    if opts.network_user_mode {
        cmd.arg("--network-user-mode");
    }

    if let Some(ref firmware) = opts.firmware {
        cmd.arg(format!("--firmware={}", firmware));
    }

    if let Some(sb) = opts.secure_boot {
        cmd.arg(format!("--secure-boot={}", if sb { "yes" } else { "no" }));
    }

    if let Some(discard) = opts.discard_disk {
        cmd.arg(format!(
            "--discard-disk={}",
            if discard { "yes" } else { "no" }
        ));
    }

    if let Some(ref grow) = opts.grow_image {
        cmd.arg(format!("--grow-image={}", grow));
    }

    for s in &opts.smbios11 {
        cmd.arg(format!("--smbios11={}", s));
    }

    if let Some(ready) = opts.notify_ready {
        cmd.arg(format!(
            "--notify-ready={}",
            if ready { "yes" } else { "no" }
        ));
    }

    // -- System Identity Options --
    cmd.arg(format!("--machine={}", vm.name));

    if let Some(ref uuid) = opts.uuid {
        cmd.arg(format!("--uuid={}", uuid));
    }

    // -- Property Options --
    if let Some(ref slice) = opts.slice {
        cmd.arg(format!("--slice={}", slice));
    }
    for prop in &opts.properties {
        cmd.arg(format!("--property={}", prop));
    }
    if let Some(register) = opts.register {
        cmd.arg(format!(
            "--register={}",
            if register { "yes" } else { "no" }
        ));
    }

    // -- User Namespacing Options --
    if let Some(ref pu) = opts.private_users {
        cmd.arg(format!("--private-users={}", pu));
    }

    // -- Mount Options --
    for bm in &opts.bind_mounts {
        let flag = if bm.read_only { "--bind-ro" } else { "--bind" };
        let arg = if let Some(ref dest) = bm.destination {
            format!("{}={}:{}", flag, bm.source, dest)
        } else {
            format!("{}={}", flag, bm.source)
        };
        cmd.arg(arg);
    }

    for drive in &opts.extra_drives {
        cmd.arg(format!("--extra-drive={}", drive));
    }

    for user in &opts.bind_users {
        cmd.arg(format!("--bind-user={}", user));
    }
    if let Some(ref shell) = opts.bind_user_shell {
        cmd.arg(format!("--bind-user-shell={}", shell));
    }
    for group in &opts.bind_user_groups {
        cmd.arg(format!("--bind-user-group={}", group));
    }

    // -- Integration Options --
    if let Some(ref fj) = opts.forward_journal {
        cmd.arg(format!("--forward-journal={}", fj));
    }
    if let Some(pass_key) = opts.pass_ssh_key {
        cmd.arg(format!(
            "--pass-ssh-key={}",
            if pass_key { "yes" } else { "no" }
        ));
    }
    if let Some(ref key_type) = opts.ssh_key_type {
        cmd.arg(format!("--ssh-key-type={}", key_type));
    }

    // -- Console / Background --
    if let Some(ref mode) = opts.console {
        cmd.arg(format!("--console={}", mode));
    }
    if let Some(ref bg) = opts.background {
        cmd.arg(format!("--background={}", bg));
    }

    // -- Credentials --
    for cred in &opts.credentials {
        cmd.arg(format!("--set-credential={}:{}", cred.id, cred.value));
    }
    for cred in &opts.load_credentials {
        cmd.arg(format!("--load-credential={}:{}", cred.id, cred.path));
    }

    // -- Display Options (SPICE/VNC via QEMU extra args) --
    if let Some(ref display) = opts.display {
        match display.display_type {
            vm_model::DisplayType::Spice => {
                let port = display.port.unwrap_or(5930);
                // Pass SPICE config as QEMU extra args via smbios11 string
                cmd.arg(format!(
                    "--smbios11=io.systemd.stub.qemu-extra-args=-spice port={},disable-ticketing=on",
                    port
                ));
            }
            vm_model::DisplayType::Vnc => {
                // VNC is handled natively by vmspawn via console=gui
                if opts.console.is_none() {
                    cmd.arg("--console=gui");
                }
            }
            vm_model::DisplayType::None => {}
        }
    }

    // -- Extra kernel command line arguments (passed via SMBIOS) --
    // Use -- to separate vmspawn flags from kernel cmdline arguments
    if !opts.extra_args.is_empty() {
        cmd.arg("--");
        for arg in &opts.extra_args {
            cmd.arg(arg);
        }
    }

    tracing::info!("Starting VM '{}'", vm.name);

    match cmd.spawn() {
        Ok(mut child) => {
            // Wait briefly to catch immediate failures (bad config, missing image, etc.)
            std::thread::sleep(std::time::Duration::from_millis(300));
            match child.try_wait() {
                Ok(Some(status)) if !status.success() => {
                    return Err(anyhow!(
                        "systemd-vmspawn exited immediately with {}",
                        status
                    ));
                }
                Ok(Some(_)) => {
                    // Exited with success immediately (unusual but valid)
                    return Ok(());
                }
                Ok(None) => {
                    // Still running — spawn reaper to avoid zombies and log later exits
                    let vm_name = vm.name.clone();
                    std::thread::spawn(move || match child.wait() {
                        Ok(status) if !status.success() => {
                            tracing::error!(
                                "VM '{}': systemd-vmspawn exited with {}",
                                vm_name,
                                status
                            );
                        }
                        Err(e) => {
                            tracing::error!(
                                "VM '{}': failed to wait on systemd-vmspawn: {}",
                                vm_name,
                                e
                            );
                        }
                        _ => {}
                    });
                    Ok(())
                }
                Err(e) => Err(anyhow!("Failed to check vmspawn process status: {}", e)),
            }
        }
        Err(e) => {
            // Fallback: try machinectl if systemd-vmspawn is not available
            tracing::warn!(
                "systemd-vmspawn not available, falling back to machinectl: {}",
                e
            );
            let fallback = Command::new("machinectl")
                .arg("start")
                .arg(&vm.name)
                .output();

            match fallback {
                Ok(out) if out.status.success() => Ok(()),
                Ok(out) => {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    Err(anyhow!("Failed to start VM: {}", stderr))
                }
                Err(_) => Err(anyhow!("Failed to start VM: {}", e)),
            }
        }
    }
}

/// Start a VM using machinectl start --runner=vmspawn.
///
/// The image must be available in /var/lib/machines/ (imported via
/// machinectl import-raw or symlinked). machinectl handles the full
/// lifecycle through machined, including registration, VSock, SSH keys,
/// and proper process supervision.
pub fn start_vm(name: &str) -> Result<()> {
    // First ensure the image is available in /var/lib/machines/
    ensure_image_in_machines(name)?;

    let output = Command::new("machinectl")
        .args(["start", "--runner=vmspawn", name])
        .output()
        .map_err(|e| anyhow!("Failed to run machinectl: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(anyhow!("Failed to start VM '{}': {}", name, stderr.trim()))
    }
}

/// Ensure an image is available in /var/lib/machines/ for machinectl.
/// If the image exists elsewhere, create a symlink.
fn ensure_image_in_machines(name: &str) -> Result<()> {
    let machines_dir = "/var/lib/machines";
    if let Err(e) = std::fs::create_dir_all(machines_dir) {
        tracing::warn!("Failed to create {}: {}", machines_dir, e);
    }

    // Check if already exists in /var/lib/machines/
    let candidates_in_machines = [
        format!("{}/{}.raw", machines_dir, name),
        format!("{}/{}.qcow2", machines_dir, name),
        format!("{}/{}", machines_dir, name),
    ];

    for path in &candidates_in_machines {
        if std::path::Path::new(path).exists() {
            return Ok(());
        }
    }

    // Look for the image in other locations
    let external_candidates = [
        format!("/var/lib/vmspawnd/images/{}.raw", name),
        format!("/var/lib/vmspawnd/images/{}_1.raw", name),
        format!("/var/lib/vmspawnd/images/{}.qcow2", name),
    ];

    for src in &external_candidates {
        if std::path::Path::new(src).exists() {
            let ext = std::path::Path::new(src)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("raw");
            let dest = format!("{}/{}.{}", machines_dir, name, ext);
            tracing::info!("Symlinking {} -> {}", src, dest);
            // Use symlink so we don't duplicate disk space
            std::os::unix::fs::symlink(src, &dest)
                .map_err(|e| anyhow!("Failed to symlink image: {}", e))?;
            return Ok(());
        }
    }

    // Image might already be registered by name in machined
    Ok(())
}

/// Resolve an image path, checking common locations.
/// Only allows paths under /var/lib/machines and /var/lib/vmspawnd.
fn resolve_image_path(image: &str, name: &str) -> String {
    // Reject path traversal in image name
    if std::path::Path::new(image)
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        tracing::warn!("Image path contains '..' traversal, using default path");
        return format!("/var/lib/machines/{}.raw", name);
    }

    let candidates = [
        format!("/var/lib/machines/{}", image),
        format!("/var/lib/machines/{}.raw", name),
        format!("/var/lib/machines/{}.qcow2", name),
        format!("/var/lib/vmspawnd/images/{}", image),
        format!("/var/lib/vmspawnd/images/{}.raw", name),
        format!("/var/lib/vmspawnd/images/{}.qcow2", name),
    ];

    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return path.clone();
        }
    }

    // Return a safe default path
    format!("/var/lib/machines/{}", image)
}

pub fn stop_vm(name: &str) -> Result<()> {
    let output = Command::new("machinectl").arg("stop").arg(name).output()?;

    if output.status.success() {
        Ok(())
    } else {
        Err(anyhow!("Failed to stop VM"))
    }
}

/// Restart a VM by stopping and starting it.
///
/// This is a blocking function that sleeps between stop and start.
/// When calling from async context, wrap in `tokio::task::spawn_blocking`.
pub fn restart_vm(name: &str) -> Result<()> {
    stop_vm(name)?;
    // Brief pause to allow the VM to fully stop before restarting
    std::thread::sleep(std::time::Duration::from_secs(2));
    start_vm(name)?;
    Ok(())
}

/// Get the leader PID for a VM via machinectl
pub fn get_vm_pid(name: &str) -> Result<u32> {
    let output = Command::new("machinectl")
        .arg("show")
        .arg(name)
        .arg("--property=Leader")
        .output()?;

    if !output.status.success() {
        return Err(anyhow!("Failed to query VM leader PID"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(pid_str) = line.strip_prefix("Leader=") {
            let pid: u32 = pid_str
                .trim()
                .parse()
                .map_err(|_| anyhow!("Invalid PID: {}", pid_str))?;
            return Ok(pid);
        }
    }

    Err(anyhow!("Leader PID not found for VM '{}'", name))
}

/// Pause a VM using the cgroup v2 freezer.
///
/// Falls back to SIGSTOP on the leader process if the cgroup is unavailable.
pub fn pause_vm(name: &str) -> Result<()> {
    let cgroup = vmspawnd_cgroup::CgroupPath::for_machine(name);
    if cgroup.exists() {
        let freezer = vmspawnd_cgroup::FreezerController::new(cgroup.path().to_path_buf());
        freezer
            .freeze()
            .map_err(|e| anyhow!("Failed to freeze VM '{}': {}", name, e))?;
        tracing::info!("Froze VM '{}' via cgroup freezer", name);
        return Ok(());
    }

    // Fallback: SIGSTOP on leader process
    let pid = get_vm_pid(name)?;
    let output = Command::new("kill")
        .arg("-STOP")
        .arg(pid.to_string())
        .output()?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(anyhow!("Failed to pause VM '{}': {}", name, stderr))
    }
}

/// Resume a paused VM using the cgroup v2 freezer.
///
/// Falls back to SIGCONT on the leader process if the cgroup is unavailable.
pub fn resume_vm(name: &str) -> Result<()> {
    let cgroup = vmspawnd_cgroup::CgroupPath::for_machine(name);
    if cgroup.exists() {
        let freezer = vmspawnd_cgroup::FreezerController::new(cgroup.path().to_path_buf());
        freezer
            .thaw()
            .map_err(|e| anyhow!("Failed to thaw VM '{}': {}", name, e))?;
        tracing::info!("Thawed VM '{}' via cgroup freezer", name);
        return Ok(());
    }

    // Fallback: SIGCONT on leader process
    let pid = get_vm_pid(name)?;
    let output = Command::new("kill")
        .arg("-CONT")
        .arg(pid.to_string())
        .output()?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(anyhow!("Failed to resume VM '{}': {}", name, stderr))
    }
}

/// Collect real metrics from cgroup v2 for a VM
pub fn get_metrics(name: &str) -> Result<VMMetrics> {
    let cgroup = vmspawnd_cgroup::CgroupPath::for_machine(name);

    let cpu_usage = read_cpu_usage(&cgroup).unwrap_or(0.0);
    let memory_usage = read_memory_usage(&cgroup).unwrap_or(0);
    let (disk_read, disk_write) = read_disk_io(&cgroup).unwrap_or((0, 0));
    let (network_rx, network_tx) = read_network_stats(name).unwrap_or((0, 0));

    Ok(VMMetrics {
        cpu_usage,
        memory_usage,
        disk_usage: disk_read + disk_write,
        network_rx,
        network_tx,
    })
}

/// Read CPU usage percentage from cgroup v2 cpu.stat
fn read_cpu_usage(cgroup: &vmspawnd_cgroup::CgroupPath) -> Result<f64> {
    let cpu = vmspawnd_cgroup::CpuController::new(cgroup.path().to_path_buf());
    let stat = cpu.get_stat().map_err(|e| anyhow!("{}", e))?;

    let cpuset = vmspawnd_cgroup::CpusetController::new(cgroup.path().to_path_buf());
    let num_cpus = cpuset
        .get_cpus_effective()
        .map(|cpus| (cpus.len() as u32).max(1))
        .unwrap_or_else(|_| {
            fs::read_to_string("/proc/cpuinfo")
                .map(|c| c.lines().filter(|l| l.starts_with("processor")).count() as u32)
                .unwrap_or(1)
                .max(1)
        });

    let uptime_content = fs::read_to_string("/proc/uptime")
        .map_err(|e| anyhow!("Failed to read /proc/uptime: {}", e))?;
    let uptime_secs: f64 = uptime_content
        .split_whitespace()
        .next()
        .unwrap_or("1")
        .parse()
        .unwrap_or(1.0);

    let total_usec = (uptime_secs * 1_000_000.0) as u64 * num_cpus as u64;
    if total_usec == 0 {
        return Ok(0.0);
    }

    let percentage = (stat.usage_usec as f64 / total_usec as f64) * 100.0;
    Ok(percentage.clamp(0.0, 100.0))
}

fn read_memory_usage(cgroup: &vmspawnd_cgroup::CgroupPath) -> Result<u64> {
    let mem = vmspawnd_cgroup::MemoryController::new(cgroup.path().to_path_buf());
    mem.get_current().map_err(|e| anyhow!("{}", e))
}

fn read_disk_io(cgroup: &vmspawnd_cgroup::CgroupPath) -> Result<(u64, u64)> {
    let io = vmspawnd_cgroup::IoController::new(cgroup.path().to_path_buf());
    let stats = match io.get_stat() {
        Ok(s) => s,
        Err(_) => return Ok((0, 0)),
    };

    let mut total_read: u64 = 0;
    let mut total_write: u64 = 0;
    for stat in &stats {
        total_read += stat.rbytes;
        total_write += stat.wbytes;
    }

    Ok((total_read, total_write))
}

fn read_network_stats(vm_name: &str) -> Result<(u64, u64)> {
    let mut total_rx: u64 = 0;
    let mut total_tx: u64 = 0;

    let net_dir = "/sys/class/net";
    if let Ok(entries) = fs::read_dir(net_dir) {
        for entry in entries.flatten() {
            let iface_name = entry.file_name().to_string_lossy().to_string();
            if iface_name.starts_with(&format!("ve-{}", vm_name))
                || iface_name.starts_with(&format!("veth-{}", vm_name))
                || iface_name.starts_with(&format!("tap-{}", vm_name))
                || iface_name.starts_with(&format!("vb-{}", vm_name))
            {
                let rx_path = format!("{}/{}/statistics/rx_bytes", net_dir, iface_name);
                let tx_path = format!("{}/{}/statistics/tx_bytes", net_dir, iface_name);

                if let Ok(rx) = fs::read_to_string(&rx_path) {
                    total_rx += rx.trim().parse::<u64>().unwrap_or(0);
                }
                if let Ok(tx) = fs::read_to_string(&tx_path) {
                    total_tx += tx.trim().parse::<u64>().unwrap_or(0);
                }
            }
        }
    }

    Ok((total_rx, total_tx))
}

pub fn get_vm_state(name: &str) -> Result<VMState> {
    let output = Command::new("machinectl").arg("show").arg(name).output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            if stdout.contains("State=running") {
                Ok(VMState::Running)
            } else {
                Ok(VMState::Stopped)
            }
        }
        Err(_) => Ok(VMState::Unknown),
    }
}

/// Build a VM image using mkosi
///
/// mkosi builds OS images from a configuration. Usage:
///   mkosi -d <distribution> -p <packages> --autologin -o <output> build
pub fn build_image_mkosi(config: &MkosiConfig) -> Result<String> {
    let output_path = format!("/var/lib/vmspawnd/images/{}.raw", config.name);

    let mut cmd = Command::new("mkosi");

    // Distribution
    cmd.arg("-d").arg(&config.distribution);

    // Packages
    for pkg in &config.packages {
        cmd.arg("-p").arg(pkg);
    }

    // Output
    cmd.arg("-o").arg(&output_path);

    // Force rebuild
    cmd.arg("-f");

    // Auto-login for convenience
    if config.autologin {
        cmd.arg("--autologin");
    }

    // Build command
    cmd.arg("build");

    tracing::info!("Building image '{}' with mkosi: {:?}", config.name, cmd);

    let output = cmd
        .output()
        .map_err(|e| anyhow!("Failed to run mkosi: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("mkosi build failed: {}", stderr));
    }

    tracing::info!(
        "Image '{}' built successfully at {}",
        config.name,
        output_path
    );
    Ok(output_path)
}

/// Configuration for mkosi image builds
#[derive(Debug, Clone)]
pub struct MkosiConfig {
    pub name: String,
    pub distribution: String,
    pub packages: Vec<String>,
    pub autologin: bool,
}
