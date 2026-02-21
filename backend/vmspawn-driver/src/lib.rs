use anyhow::{anyhow, Result};
use std::fs;
use std::process::Command;
use vm_model::{CreateVMRequest, VM, VMMetrics, VMState};

pub fn create_vm(req: &CreateVMRequest) -> Result<VM> {
    let vm = VM::from_request(req);
    Ok(vm)
}

pub fn start_vm(name: &str) -> Result<()> {
    let output = Command::new("systemd-vmspawn")
        .arg(format!("--machine={}", name))
        .arg("--boot")
        .spawn();

    match output {
        Ok(_) => Ok(()),
        Err(e) => {
            // Fallback: try machinectl if systemd-vmspawn is not available
            let fallback = Command::new("machinectl")
                .arg("start")
                .arg(name)
                .output();

            match fallback {
                Ok(_) => Ok(()),
                Err(_) => Err(anyhow!("Failed to start VM: {}", e)),
            }
        }
    }
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

    // Read number of CPUs available to this cgroup
    let cpuset_path = format!("{}/cpuset.cpus.effective", cgroup_path);
    let num_cpus = if let Ok(cpuset) = fs::read_to_string(&cpuset_path) {
        count_cpus_in_cpuset(cpuset.trim())
    } else {
        // Fallback: count processors from /proc/cpuinfo
        fs::read_to_string("/proc/cpuinfo")
            .map(|c| c.lines().filter(|l| l.starts_with("processor")).count() as u32)
            .unwrap_or(1)
            .max(1)
    };

    // Read system uptime to calculate percentage
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

/// Count CPUs in a cpuset string like "0-3,5,7-9"
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

/// Read memory usage from cgroup v2
fn read_memory_usage(cgroup_path: &str) -> Result<u64> {
    let memory_current_path = format!("{}/memory.current", cgroup_path);
    let content = fs::read_to_string(&memory_current_path)
        .map_err(|e| anyhow!("Failed to read {}: {}", memory_current_path, e))?;
    let bytes: u64 = content.trim().parse().unwrap_or(0);
    Ok(bytes)
}

/// Read disk I/O stats from cgroup v2 io.stat
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

/// Read network statistics for VM interfaces from /sys/class/net
fn read_network_stats(vm_name: &str) -> Result<(u64, u64)> {
    let mut total_rx: u64 = 0;
    let mut total_tx: u64 = 0;

    // Look for VM-associated interfaces (ve-*, veth-*, tap-* prefixed with VM name)
    let net_dir = "/sys/class/net";
    if let Ok(entries) = fs::read_dir(net_dir) {
        for entry in entries.flatten() {
            let iface_name = entry.file_name().to_string_lossy().to_string();
            // Match interfaces associated with this VM
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
