// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use anyhow::Result;
use vm_model::{PressureRecord, VMMetrics, VMPressure};
use vmspawnd_cgroup::CgroupPath;
use vmspawnd_driver_core::ResourceStatsDriver;

use crate::MachinectlDriver;

impl ResourceStatsDriver for MachinectlDriver {
    async fn get_metrics(&self, name: &str) -> Result<VMMetrics> {
        let cgroup = CgroupPath::for_machine(name);

        let cpu_usage = read_cpu_usage(&cgroup).await.unwrap_or(0.0);
        let memory_usage = read_memory_usage(&cgroup).unwrap_or(0);
        let (disk_read, disk_write) = read_disk_io(&cgroup).unwrap_or((0, 0));
        let (network_rx, network_tx) = read_network_stats(name).await.unwrap_or((0, 0));

        Ok(VMMetrics {
            cpu_usage,
            memory_usage,
            disk_usage: disk_read + disk_write,
            network_rx,
            network_tx,
        })
    }

    async fn get_pressure(&self, name: &str) -> Result<VMPressure> {
        let cgroup = CgroupPath::for_machine(name);
        let path = cgroup.path().to_path_buf();

        let cpu = vmspawnd_cgroup::CpuController::new(path.clone());
        let mem = vmspawnd_cgroup::MemoryController::new(path.clone());
        let io = vmspawnd_cgroup::IoController::new(path);

        let cpu_pressure = cpu.get_pressure().ok();
        let mem_pressure = mem.get_pressure().ok();
        let io_pressure = io.get_pressure().ok();

        Ok(VMPressure {
            cpu_some: cpu_pressure.map(|p| to_pressure_record(&p.some)),
            memory_some: mem_pressure.as_ref().map(|p| to_pressure_record(&p.some)),
            memory_full: mem_pressure
                .as_ref()
                .and_then(|p| p.full.as_ref().map(to_pressure_record)),
            io_some: io_pressure.as_ref().map(|p| to_pressure_record(&p.some)),
            io_full: io_pressure
                .as_ref()
                .and_then(|p| p.full.as_ref().map(to_pressure_record)),
        })
    }
}

fn to_pressure_record(p: &vmspawnd_cgroup::PressureRecord) -> PressureRecord {
    PressureRecord {
        avg10: p.avg10,
        avg60: p.avg60,
        avg300: p.avg300,
        total: p.total,
    }
}

/// Read CPU usage percentage from cgroup v2 cpu.stat.
async fn read_cpu_usage(cgroup: &CgroupPath) -> Result<f64> {
    let cpu = vmspawnd_cgroup::CpuController::new(cgroup.path().to_path_buf());
    let stat = cpu.get_stat()?;

    let cpuset = vmspawnd_cgroup::CpusetController::new(cgroup.path().to_path_buf());
    let num_cpus = cpuset
        .get_cpus_effective()
        .map(|cpus| cpus.len() as u32)
        .unwrap_or_else(|_| {
            // Fall back to /proc/cpuinfo
            std::fs::read_to_string("/proc/cpuinfo")
                .map(|c| {
                    c.lines()
                        .filter(|l| l.starts_with("processor"))
                        .count() as u32
                })
                .unwrap_or(1)
                .max(1)
        });

    let uptime_content = tokio::fs::read_to_string("/proc/uptime").await?;
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

fn read_memory_usage(cgroup: &CgroupPath) -> Result<u64> {
    let mem = vmspawnd_cgroup::MemoryController::new(cgroup.path().to_path_buf());
    Ok(mem.get_current()?)
}

fn read_disk_io(cgroup: &CgroupPath) -> Result<(u64, u64)> {
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
