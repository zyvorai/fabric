// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

//! machinectl/machined integration for VM and image management.
//!
//! Wraps the machinectl(1) CLI which talks to systemd-machined via D-Bus.
//! Provides machine lifecycle, image management, file transfer, and SSH operations.

use anyhow::{anyhow, Result};
use std::process::Command;

/// Characters that are dangerous in shell commands and must be rejected.
const SHELL_METACHARACTERS: &[char] = &[
    ';', '|', '&', '$', '`', '>', '<', '(', ')', '{', '}', '\n', '\r', '\0', '!',
];

/// Validate that a shell command does not contain dangerous metacharacters.
/// Returns an error if any shell injection characters are found.
fn validate_shell_command(command: &str) -> Result<()> {
    if command.is_empty() {
        return Err(anyhow!("Shell command must not be empty"));
    }
    for ch in SHELL_METACHARACTERS {
        if command.contains(*ch) {
            return Err(anyhow!(
                "Shell command contains forbidden character '{}'",
                ch.escape_default()
            ));
        }
    }
    Ok(())
}

// ============================================================================
// Machine lifecycle
// ============================================================================

/// List all running machines. Returns (name, class, service) tuples.
pub fn list_machines() -> Result<Vec<MachineInfo>> {
    let output = Command::new("machinectl")
        .args(["list", "--no-legend", "--no-pager"])
        .output()?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut machines = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 {
            machines.push(MachineInfo {
                name: parts[0].to_string(),
                class: parts[1].to_string(),
                service: parts[2].to_string(),
            });
        }
    }

    Ok(machines)
}

/// Show machine properties as key=value pairs.
pub fn show_machine(name: &str) -> Result<std::collections::HashMap<String, String>> {
    let output = Command::new("machinectl")
        .args(["show", name, "--no-pager"])
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("machinectl show failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut props = std::collections::HashMap::new();

    for line in stdout.lines() {
        if let Some((key, value)) = line.split_once('=') {
            props.insert(key.to_string(), value.to_string());
        }
    }

    Ok(props)
}

/// Poweroff a machine gracefully (sends signal to init).
pub fn poweroff(name: &str) -> Result<()> {
    run_machinectl(&["poweroff", name])
}

/// Reboot a machine.
pub fn reboot(name: &str) -> Result<()> {
    run_machinectl(&["reboot", name])
}

/// Terminate a machine immediately (no graceful shutdown).
pub fn terminate(name: &str) -> Result<()> {
    run_machinectl(&["terminate", name])
}

/// Send a signal to processes in a machine.
pub fn kill(name: &str, signal: &str, whom: Option<&str>) -> Result<()> {
    let mut args = vec!["kill"];
    if let Some(w) = whom {
        args.push("--kill-whom");
        args.push(w);
    }
    args.extend_from_slice(&["--signal", signal, name]);
    run_machinectl(&args)
}

/// Enable a machine to start at boot.
pub fn enable(name: &str) -> Result<()> {
    run_machinectl(&["enable", name])
}

/// Disable auto-start at boot.
pub fn disable(name: &str) -> Result<()> {
    run_machinectl(&["disable", name])
}

// ============================================================================
// Shell & SSH
// ============================================================================

/// Run a command inside a machine via machinectl shell.
/// Returns (stdout, stderr, exit_code).
///
/// The command is validated to reject shell metacharacters that could allow
/// command injection (e.g., `;`, `|`, `&`, `$`, backticks, etc.).
pub fn shell(name: &str, command: &str) -> Result<ShellOutput> {
    validate_shell_command(command)?;

    let output = Command::new("machinectl")
        .args(["shell", name, "/bin/sh", "-c", command])
        .output()?;

    Ok(ShellOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

/// Get the SSH address for a machine (VSock-based).
pub fn ssh_address(name: &str) -> Result<Option<String>> {
    let props = show_machine(name)?;
    Ok(props.get("SSHAddress").cloned())
}

/// Get the SSH private key path for a machine.
pub fn ssh_key_path(name: &str) -> Result<Option<String>> {
    let props = show_machine(name)?;
    Ok(props.get("SSHPrivateKeyPath").cloned())
}

// ============================================================================
// File transfer
// ============================================================================

/// Copy a file from host to machine.
pub fn copy_to(name: &str, host_path: &str, machine_path: &str) -> Result<()> {
    run_machinectl(&["copy-to", name, host_path, machine_path])
}

/// Copy a file from machine to host.
pub fn copy_from(name: &str, machine_path: &str, host_path: &str) -> Result<()> {
    run_machinectl(&["copy-from", name, machine_path, host_path])
}

/// Bind mount a host path into a running machine.
pub fn bind(name: &str, host_path: &str, machine_path: &str, read_only: bool) -> Result<()> {
    let mut args = vec!["bind"];
    if read_only {
        args.push("--read-only");
    }
    args.push("--mkdir");
    args.extend_from_slice(&[name, host_path, machine_path]);
    run_machinectl(&args)
}

// ============================================================================
// Image management
// ============================================================================

/// List available images in /var/lib/machines.
pub fn list_images() -> Result<Vec<ImageInfo>> {
    let output = Command::new("machinectl")
        .args(["list-images", "--no-legend", "--no-pager"])
        .output()?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut images = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 4 {
            images.push(ImageInfo {
                name: parts[0].to_string(),
                image_type: parts[1].to_string(),
                read_only: parts[2] == "ro",
                size: parts.get(3).unwrap_or(&"0").to_string(),
            });
        }
    }

    Ok(images)
}

/// Clone an image.
pub fn clone_image(source: &str, target: &str) -> Result<()> {
    run_machinectl(&["clone", source, target])
}

/// Rename an image.
pub fn rename_image(old_name: &str, new_name: &str) -> Result<()> {
    run_machinectl(&["rename", old_name, new_name])
}

/// Remove an image.
pub fn remove_image(name: &str) -> Result<()> {
    run_machinectl(&["remove", name])
}

/// Set image read-only flag.
pub fn set_read_only(name: &str, read_only: bool) -> Result<()> {
    let ro_str = if read_only { "yes" } else { "no" };
    run_machinectl(&["read-only", name, ro_str])
}

/// Pull a raw image from URL.
pub fn pull_raw(url: &str, name: &str, verify: bool) -> Result<()> {
    let verify_arg = if verify { "signature" } else { "no" };
    run_machinectl(&["pull-raw", "--verify", verify_arg, url, name])
}

/// Pull a tar image from URL.
pub fn pull_tar(url: &str, name: &str, verify: bool) -> Result<()> {
    let verify_arg = if verify { "signature" } else { "no" };
    run_machinectl(&["pull-tar", "--verify", verify_arg, url, name])
}

/// Import a raw image file into /var/lib/machines.
pub fn import_raw(path: &str, name: &str) -> Result<()> {
    run_machinectl(&["import-raw", path, name])
}

/// Import a tar image file into /var/lib/machines.
pub fn import_tar(path: &str, name: &str) -> Result<()> {
    run_machinectl(&["import-tar", path, name])
}

/// Export a machine image to a raw file.
pub fn export_raw(name: &str, path: &str) -> Result<()> {
    run_machinectl(&["export-raw", name, path])
}

/// Export a machine image to a tar file.
pub fn export_tar(name: &str, path: &str) -> Result<()> {
    run_machinectl(&["export-tar", name, path])
}

/// Clean hidden/cached images.
pub fn clean(all: bool) -> Result<()> {
    if all {
        run_machinectl(&["clean", "--all"])
    } else {
        run_machinectl(&["clean"])
    }
}

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, serde::Serialize)]
pub struct MachineInfo {
    pub name: String,
    pub class: String,
    pub service: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ImageInfo {
    pub name: String,
    pub image_type: String,
    pub read_only: bool,
    pub size: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ShellOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

// ============================================================================
// Helpers
// ============================================================================

fn run_machinectl(args: &[&str]) -> Result<()> {
    let output = Command::new("machinectl")
        .args(args)
        .output()
        .map_err(|e| anyhow!("Failed to run machinectl: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(anyhow!("machinectl {} failed: {}", args.join(" "), stderr.trim()))
    }
}
