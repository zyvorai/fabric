pub mod machinectl;
pub mod qemu;

use anyhow::{anyhow, Result};
use std::fs;
use std::process::Command;
use vm_model::{CreateVMRequest, VM, VMMetrics, VMStartOptions, VMState};

pub fn create_vm(req: &CreateVMRequest) -> Result<VM> {
    let vm = VM::from_request(req);
    Ok(vm)
}

/// Start a VM using systemd-vmspawn with proper flags.
///
/// Uses the systemd-vmspawn(1) interface:
///   --image=      Root filesystem image
///   --directory=  Root filesystem directory
///   --machine=    Machine name
///   --qemu-smp=   Number of CPUs
///   --qemu-mem=   Memory size
///   --qemu-kvm=   KVM acceleration
///   --qemu-vsock= VSock networking
///   --secure-boot= Secure Boot firmware
///   --qemu-gui    Graphical mode
///   --set-credential= Pass credentials
pub fn start_vm_with_options(vm: &VM, opts: &VMStartOptions) -> Result<()> {
    let mut cmd = Command::new("systemd-vmspawn");

    // Machine name
    cmd.arg(format!("--machine={}", vm.name));

    // Image or directory
    if let Some(ref dir) = opts.directory {
        cmd.arg(format!("--directory={}", dir));
    } else {
        // Resolve image path
        let image_path = resolve_image_path(&vm.image, &vm.name);
        cmd.arg(format!("--image={}", image_path));
    }

    // CPU count
    cmd.arg(format!("--qemu-smp={}", vm.cpus));

    // Memory (systemd-vmspawn expects e.g. "2G" or "512M")
    let mem_str = if vm.memory >= 1024 && vm.memory % 1024 == 0 {
        format!("{}G", vm.memory / 1024)
    } else {
        format!("{}M", vm.memory)
    };
    cmd.arg(format!("--qemu-mem={}", mem_str));

    // KVM acceleration
    if let Some(kvm) = opts.kvm {
        cmd.arg(format!("--qemu-kvm={}", if kvm { "yes" } else { "no" }));
    }

    // Secure Boot
    if let Some(sb) = opts.secure_boot {
        cmd.arg(format!("--secure-boot={}", if sb { "yes" } else { "no" }));
    }

    // VSock
    if let Some(vsock) = opts.vsock {
        cmd.arg(format!("--qemu-vsock={}", if vsock { "yes" } else { "no" }));
    }
    if let Some(cid) = opts.vsock_cid {
        cmd.arg(format!("--vsock-cid={}", cid));
    }

    // GUI mode
    if opts.gui {
        cmd.arg("--qemu-gui");
    }

    // Credentials
    for cred in &opts.credentials {
        cmd.arg(format!("--set-credential={}:{}", cred.id, cred.value));
    }

    tracing::info!("Starting VM '{}': {:?}", vm.name, cmd);

    let output = cmd.spawn();

    match output {
        Ok(_) => Ok(()),
        Err(e) => {
            // Fallback: try machinectl if systemd-vmspawn is not available
            tracing::warn!("systemd-vmspawn failed, falling back to machinectl: {}", e);
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
    let _ = std::fs::create_dir_all(machines_dir);

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

/// Resolve an image path, checking common locations
fn resolve_image_path(image: &str, name: &str) -> String {
    let candidates = [
        image.to_string(),
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

    // Return the original image path if nothing found
    image.to_string()
}

pub fn stop_vm(name: &str) -> Result<()> {
    let output = Command::new("machinectl")
        .arg("stop")
        .arg(name)
        .output()?;

    if output.status.success() {
        Ok(())
    } else {
        Err(anyhow!("Failed to stop VM"))
    }
}

pub fn restart_vm(name: &str) -> Result<()> {
    stop_vm(name)?;
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
            let pid: u32 = pid_str.trim().parse()
                .map_err(|_| anyhow!("Invalid PID: {}", pid_str))?;
            return Ok(pid);
        }
    }

    Err(anyhow!("Leader PID not found for VM '{}'", name))
}

/// Pause a VM by sending SIGSTOP to the leader process
pub fn pause_vm(name: &str) -> Result<()> {
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

/// Resume a paused VM by sending SIGCONT to the leader process
pub fn resume_vm(name: &str) -> Result<()> {
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
    let cgroup_base = format!("/sys/fs/cgroup/machine.slice/machine-{}.scope", name);

    let cpu_usage = read_cpu_usage(&cgroup_base).unwrap_or(0.0);
    let memory_usage = read_memory_usage(&cgroup_base).unwrap_or(0);
    let (disk_read, disk_write) = read_disk_io(&cgroup_base).unwrap_or((0, 0));
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
fn read_cpu_usage(cgroup_path: &str) -> Result<f64> {
    let cpu_stat_path = format!("{}/cpu.stat", cgroup_path);
    let content = fs::read_to_string(&cpu_stat_path)
        .map_err(|e| anyhow!("Failed to read {}: {}", cpu_stat_path, e))?;

    let mut usage_usec: u64 = 0;
    for line in content.lines() {
        if let Some(val) = line.strip_prefix("usage_usec ") {
            usage_usec = val.trim().parse().unwrap_or(0);
            break;
        }
    }

    let cpuset_path = format!("{}/cpuset.cpus.effective", cgroup_path);
    let num_cpus = if let Ok(cpuset) = fs::read_to_string(&cpuset_path) {
        count_cpus_in_cpuset(cpuset.trim())
    } else {
        fs::read_to_string("/proc/cpuinfo")
            .map(|c| c.lines().filter(|l| l.starts_with("processor")).count() as u32)
            .unwrap_or(1)
            .max(1)
    };

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

    let percentage = (usage_usec as f64 / total_usec as f64) * 100.0;
    Ok(percentage.min(100.0).max(0.0))
}

fn count_cpus_in_cpuset(cpuset: &str) -> u32 {
    if cpuset.is_empty() {
        return 1;
    }
    let mut count = 0u32;
    for part in cpuset.split(',') {
        if let Some((start, end)) = part.split_once('-') {
            let s: u32 = start.trim().parse().unwrap_or(0);
            let e: u32 = end.trim().parse().unwrap_or(0);
            count += e - s + 1;
        } else {
            count += 1;
        }
    }
    count.max(1)
}

fn read_memory_usage(cgroup_path: &str) -> Result<u64> {
    let memory_current_path = format!("{}/memory.current", cgroup_path);
    let content = fs::read_to_string(&memory_current_path)
        .map_err(|e| anyhow!("Failed to read {}: {}", memory_current_path, e))?;
    let bytes: u64 = content.trim().parse().unwrap_or(0);
    Ok(bytes)
}

fn read_disk_io(cgroup_path: &str) -> Result<(u64, u64)> {
    let io_stat_path = format!("{}/io.stat", cgroup_path);
    let content = match fs::read_to_string(&io_stat_path) {
        Ok(c) => c,
        Err(_) => return Ok((0, 0)),
    };

    let mut total_read: u64 = 0;
    let mut total_write: u64 = 0;

    for line in content.lines() {
        for field in line.split_whitespace() {
            if let Some(val) = field.strip_prefix("rbytes=") {
                total_read += val.parse::<u64>().unwrap_or(0);
            } else if let Some(val) = field.strip_prefix("wbytes=") {
                total_write += val.parse::<u64>().unwrap_or(0);
            }
        }
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
            if iface_name.contains(vm_name)
                || iface_name.starts_with(&format!("ve-{}", vm_name))
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
    let output = Command::new("machinectl")
        .arg("show")
        .arg(name)
        .output();

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
    let output_path = format!(
        "/var/lib/vmspawnd/images/{}.raw",
        config.name
    );

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

    let output = cmd.output()
        .map_err(|e| anyhow!("Failed to run mkosi: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("mkosi build failed: {}", stderr));
    }

    tracing::info!("Image '{}' built successfully at {}", config.name, output_path);
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
