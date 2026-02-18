use anyhow::Result;
use std::process::Command;

pub fn start_machine(name: &str) -> Result<()> {
    Command::new("machinectl")
        .arg("start")
        .arg(name)
        .output()?;
    Ok(())
}

pub fn stop_machine(name: &str) -> Result<()> {
    Command::new("machinectl")
        .arg("stop")
        .arg(name)
        .output()?;
    Ok(())
}

pub fn list_machines() -> Result<Vec<String>> {
    let output = Command::new("machinectl")
        .arg("list")
        .arg("--no-legend")
        .output()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let machines: Vec<String> = stdout
        .lines()
        .filter_map(|line| line.split_whitespace().next())
        .map(String::from)
        .collect();

    Ok(machines)
}
