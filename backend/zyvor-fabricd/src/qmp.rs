// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use anyhow::{Context, Result};
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::time::Duration;

/// Commands allowed through the QMP interface.
const ALLOWED_QMP_COMMANDS: &[&str] = &[
    "query-status",
    "query-block",
    "query-blockstats",
    "query-cpus-fast",
    "query-hotpluggable-cpus",
    "query-memory-size-summary",
    "query-vnc",
    "query-spice",
    // Read-only PCI topology inspection -- used to check which hotplug
    // root ports already have a child device before picking one for
    // device_add (see hotplug.rs::occupied_hotplug_buses).
    "query-pci",
    "system_powerdown",
    "system_reset",
    "stop",
    "cont",
    "balloon",
    "block_resize",
    "blockdev-snapshot-sync",
    "blockdev-add",
    "blockdev-del",
    "device_add",
    "device_del",
    "netdev_add",
    "netdev_del",
    "object-add",
    "object-del",
    "chardev-add",
    "chardev-remove",
    "savevm",
    "loadvm",
    "delvm",
    "cpu-add",
    "drive-backup",
    // Modern (QEMU 6.0+) job-based internal-snapshot API. `savevm` above
    // is the old HMP command name and isn't a real top-level QMP command
    // on current QEMU -- found live: "The command savevm has not been
    // found" -- `human-monitor-command` would work but is deliberately
    // never allow-listed (see test_disallowed_command_rejected below):
    // it's a raw HMP passthrough, a much bigger attack surface than any
    // single whitelisted command. snapshot-save is the supported
    // replacement for what savevm was meant to do here.
    "snapshot-save",
    "query-jobs",
    "job-dismiss",
    // Immediately terminates this one VM's QEMU process -- narrowly
    // scoped (unlike human-monitor-command's arbitrary-command
    // passthrough) and no more privileged than system_powerdown/
    // system_reset above. Needed by hibernate_vm: once a snapshot-save
    // has captured memory+disk state, the guest must not keep running
    // and mutating disk state past that point, so a graceful ACPI
    // powerdown (which the guest could ignore or delay) is the wrong
    // tool -- found live: without this, hibernate's own "quit" call
    // always failed (blocked by this same allowlist), leaving the VM
    // marked Stopped in the store while its QEMU process kept running.
    "quit",
];

/// Check whether a QMP command is in the allowed list.
fn is_command_allowed(command: &str) -> bool {
    ALLOWED_QMP_COMMANDS.contains(&command)
}

/// Minimal QMP (QEMU Machine Protocol) client for communicating with a
/// QEMU monitor socket, at a path resolved by `state.driver.get_control_socket()`
/// (backend-specific: the systemd-vmspawn convention for `MachinectlDriver`,
/// `VmRecord.control_socket` for `EphemeraDriver`).
pub struct QmpClient {
    socket_path: String,
}

impl QmpClient {
    /// Create a QMP client for an already-resolved control socket path.
    pub fn for_socket(socket_path: impl Into<String>) -> Self {
        Self { socket_path: socket_path.into() }
    }

    /// Check if the QMP socket exists and is accessible
    pub fn is_available(&self) -> bool {
        std::path::Path::new(&self.socket_path).exists()
    }

    /// Execute a QMP command and return the response
    pub fn execute(&self, command: &str, args: Value) -> Result<Value> {
        if !is_command_allowed(command) {
            return Err(anyhow::anyhow!(
                "QMP command '{}' is not in the allowed list",
                command
            ));
        }

        let mut stream = UnixStream::connect(&self.socket_path)
            .with_context(|| format!("Failed to connect to QMP socket: {}", self.socket_path))?;

        stream.set_read_timeout(Some(Duration::from_secs(10)))?;
        stream.set_write_timeout(Some(Duration::from_secs(5)))?;

        let mut reader = BufReader::new(stream.try_clone()?);

        // Read the QMP greeting
        let mut greeting = String::new();
        reader.read_line(&mut greeting)?;

        // Send qmp_capabilities to negotiate
        let caps = serde_json::json!({"execute": "qmp_capabilities"});
        writeln!(stream, "{}", caps)?;
        stream.flush()?;

        // Read capabilities response
        let mut caps_response = String::new();
        reader.read_line(&mut caps_response)?;

        // Send the actual command
        let cmd = if args.is_null() {
            serde_json::json!({"execute": command})
        } else {
            serde_json::json!({"execute": command, "arguments": args})
        };

        writeln!(stream, "{}", cmd)?;
        stream.flush()?;

        // Read the response
        let mut response_str = String::new();
        reader.read_line(&mut response_str)?;

        let response: Value = serde_json::from_str(&response_str)
            .with_context(|| format!("Failed to parse QMP response: {}", response_str))?;

        if let Some(error) = response.get("error") {
            return Err(anyhow::anyhow!(
                "QMP error: {}",
                error
                    .get("desc")
                    .and_then(|d| d.as_str())
                    .unwrap_or("unknown")
            ));
        }

        Ok(response.get("return").cloned().unwrap_or(Value::Null))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_disallowed_command_rejected() {
        assert!(!is_command_allowed("human-monitor-command"));
        assert!(!is_command_allowed(""));
        assert!(!is_command_allowed("rm -rf /"));
    }

    #[test]
    fn test_allowed_commands_pass() {
        for cmd in ALLOWED_QMP_COMMANDS {
            assert!(
                is_command_allowed(cmd),
                "Command '{}' should be allowed",
                cmd
            );
        }
        // Verify specific commands critical for hotplug
        assert!(is_command_allowed("blockdev-add"));
        assert!(is_command_allowed("blockdev-del"));
        assert!(is_command_allowed("device_add"));
        assert!(is_command_allowed("query-hotpluggable-cpus"));
    }

    #[test]
    fn test_is_available_nonexistent() {
        let client = QmpClient::for_socket("/run/systemd/vmspawn/nonexistent-vm-12345/qemu.sock");
        assert!(!client.is_available());
    }
}
