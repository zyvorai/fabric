use anyhow::{anyhow, Result};
use vm_model::VMMetrics;
use vmspawnd_driver_core::ResourceStatsDriver;

use crate::MachinectlDriver;

impl ResourceStatsDriver for MachinectlDriver {
    async fn get_metrics(&self, name: &str) -> Result<VMMetrics> {
        let cgroup_base = format!("/sys/fs/cgroup/machine.slice/machine-{}.scope", name);

        let cpu_usage = read_cpu_usage(&cgroup_base).await.unwrap_or(0.0);
        let memory_usage = read_memory_usage(&cgroup_base).await.unwrap_or(0);
        let (disk_read, disk_write) = read_disk_io(&cgroup_base).await.unwrap_or((0, 0));
        let (network_rx, network_tx) = read_network_stats(name).await.unwrap_or((0, 0));

        Ok(VMMetrics {
            cpu_usage,
            memory_usage,
            disk_usage: disk_read + disk_write,
            network_rx,
            network_tx,
        })
    }
}

/// Read CPU usage percentage from cgroup v2 cpu.stat.
async fn read_cpu_usage(cgroup_path: &str) -> Result<f64> {
    let cpu_stat_path = format!("{}/cpu.stat", cgroup_path);
    let content = tokio::fs::read_to_string(&cpu_stat_path)
        .await
        .map_err(|e| anyhow!("Failed to read {}: {}", cpu_stat_path, e))?;

    let mut usage_usec: u64 = 0;
    for line in content.lines() {
        if let Some(val) = line.strip_prefix("usage_usec ") {
            usage_usec = val.trim().parse().unwrap_or(0);
            break;
        }
    }

    let cpuset_path = format!("{}/cpuset.cpus.effective", cgroup_path);
    let num_cpus = if let Ok(cpuset) = tokio::fs::read_to_string(&cpuset_path).await {
        count_cpus_in_cpuset(cpuset.trim())
    } else {
        tokio::fs::read_to_string("/proc/cpuinfo")
            .await
            .map(|c| {
                c.lines()
                    .filter(|l| l.starts_with("processor"))
                    .count() as u32
            })
            .unwrap_or(1)
            .max(1)
    };

    let uptime_content = tokio::fs::read_to_string("/proc/uptime")
        .await
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

async fn read_memory_usage(cgroup_path: &str) -> Result<u64> {
    let memory_current_path = format!("{}/memory.current", cgroup_path);
    let content = tokio::fs::read_to_string(&memory_current_path)
        .await
        .map_err(|e| anyhow!("Failed to read {}: {}", memory_current_path, e))?;
    let bytes: u64 = content.trim().parse().unwrap_or(0);
    Ok(bytes)
}

async fn read_disk_io(cgroup_path: &str) -> Result<(u64, u64)> {
    let io_stat_path = format!("{}/io.stat", cgroup_path);
    let content = match tokio::fs::read_to_string(&io_stat_path).await {
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

async fn read_network_stats(vm_name: &str) -> Result<(u64, u64)> {
    let mut total_rx: u64 = 0;
    let mut total_tx: u64 = 0;

    let net_dir = "/sys/class/net";
    let mut entries = match tokio::fs::read_dir(net_dir).await {
        Ok(e) => e,
        Err(_) => return Ok((0, 0)),
    };

    while let Ok(Some(entry)) = entries.next_entry().await {
        let iface_name = entry.file_name().to_string_lossy().to_string();
        if iface_name.contains(vm_name)
            || iface_name.starts_with(&format!("ve-{}", vm_name))
            || iface_name.starts_with(&format!("veth-{}", vm_name))
            || iface_name.starts_with(&format!("tap-{}", vm_name))
            || iface_name.starts_with(&format!("vb-{}", vm_name))
        {
            let rx_path = format!("{}/{}/statistics/rx_bytes", net_dir, iface_name);
            let tx_path = format!("{}/{}/statistics/tx_bytes", net_dir, iface_name);

            if let Ok(rx) = tokio::fs::read_to_string(&rx_path).await {
                total_rx += rx.trim().parse::<u64>().unwrap_or(0);
            }
            if let Ok(tx) = tokio::fs::read_to_string(&tx_path).await {
                total_tx += tx.trim().parse::<u64>().unwrap_or(0);
            }
        }
    }

    Ok((total_rx, total_tx))
}
