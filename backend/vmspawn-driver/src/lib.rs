use anyhow::{anyhow, Result};
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

pub fn get_metrics(name: &str) -> Result<VMMetrics> {
    // Query systemd/cgroup metrics
    let output = Command::new("machinectl")
        .arg("status")
        .arg(name)
        .output();

    match output {
        Ok(_) => Ok(VMMetrics {
            cpu_usage: 0.0,
            memory_usage: 0,
            disk_usage: 0,
            network_rx: 0,
            network_tx: 0,
        }),
        Err(e) => Err(anyhow!("Failed to get metrics: {}", e)),
    }
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
