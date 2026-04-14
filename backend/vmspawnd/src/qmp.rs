use anyhow::{Context, Result};
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::time::Duration;

/// Minimal QMP (QEMU Machine Protocol) client for communicating with QEMU
/// monitor sockets exposed by systemd-vmspawn.
pub struct QmpClient {
    socket_path: String,
}

impl QmpClient {
    /// Create a new QMP client for a given VM name.
    /// The socket is expected at /run/systemd/vmspawn/{name}/qemu.sock
    pub fn new(vm_name: &str) -> Self {
        Self {
            socket_path: format!("/run/systemd/vmspawn/{}/qemu.sock", vm_name),
        }
    }

    /// Check if the QMP socket exists and is accessible
    pub fn is_available(&self) -> bool {
        std::path::Path::new(&self.socket_path).exists()
    }

    /// Execute a QMP command and return the response
    pub fn execute(&self, command: &str, args: Value) -> Result<Value> {
        const ALLOWED_QMP_COMMANDS: &[&str] = &[
            "query-status", "query-block", "query-blockstats", "query-cpus-fast",
            "query-hotpluggable-cpus",
            "query-memory-size-summary", "query-vnc", "query-spice",
            "system_powerdown", "system_reset", "stop", "cont",
            "balloon", "block_resize", "blockdev-snapshot-sync",
            "device_add", "device_del", "netdev_add", "netdev_del",
            "object-add", "object-del", "chardev-add", "chardev-remove",
            "human-monitor-command", "savevm", "loadvm", "delvm",
            "cpu-add", "drive-backup",
        ];
        if !ALLOWED_QMP_COMMANDS.contains(&command) {
            return Err(anyhow::anyhow!("QMP command '{}' is not in the allowed list", command));
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
                error.get("desc").and_then(|d| d.as_str()).unwrap_or("unknown")
            ));
        }

        Ok(response.get("return").cloned().unwrap_or(Value::Null))
    }
}
