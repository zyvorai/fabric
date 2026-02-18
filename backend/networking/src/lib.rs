use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInterface {
    pub name: String,
    pub mac_address: String,
    pub bridge: Option<String>,
    pub vlan_id: Option<u16>,
    pub mtu: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortForward {
    pub protocol: Protocol,
    pub host_port: u16,
    pub guest_port: u16,
    pub guest_ip: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Tcp,
    Udp,
}

impl Protocol {
    pub fn as_str(&self) -> &str {
        match self {
            Protocol::Tcp => "tcp",
            Protocol::Udp => "udp",
        }
    }
}

pub struct NetworkManager;

impl NetworkManager {
    pub fn create_bridge(name: &str) -> Result<()> {
        // Create bridge
        let output = Command::new("ip")
            .args(["link", "add", "name", name, "type", "bridge"])
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("Failed to create bridge: {}", stderr));
        }

        // Bring bridge up
        Command::new("ip")
            .args(["link", "set", name, "up"])
            .output()?;

        tracing::info!("Created bridge: {}", name);

        Ok(())
    }

    pub fn delete_bridge(name: &str) -> Result<()> {
        let output = Command::new("ip")
            .args(["link", "delete", name])
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("Failed to delete bridge: {}", stderr));
        }

        tracing::info!("Deleted bridge: {}", name);

        Ok(())
    }

    pub fn create_vlan(bridge: &str, vlan_id: u16) -> Result<String> {
        let vlan_name = format!("{}.{}", bridge, vlan_id);

        let output = Command::new("ip")
            .args([
                "link",
                "add",
                "link",
                bridge,
                "name",
                &vlan_name,
                "type",
                "vlan",
                "id",
                &vlan_id.to_string(),
            ])
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("Failed to create VLAN: {}", stderr));
        }

        Command::new("ip")
            .args(["link", "set", &vlan_name, "up"])
            .output()?;

        tracing::info!("Created VLAN: {} on bridge {}", vlan_id, bridge);

        Ok(vlan_name)
    }

    pub fn add_port_forward(forward: &PortForward) -> Result<()> {
        // Use iptables for port forwarding
        let output = Command::new("iptables")
            .args([
                "-t",
                "nat",
                "-A",
                "PREROUTING",
                "-p",
                forward.protocol.as_str(),
                "--dport",
                &forward.host_port.to_string(),
                "-j",
                "DNAT",
                "--to-destination",
                &format!("{}:{}", forward.guest_ip, forward.guest_port),
            ])
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("Failed to add port forward: {}", stderr));
        }

        tracing::info!(
            "Added port forward: {} {}:{} -> {}:{}",
            forward.protocol.as_str(),
            "0.0.0.0",
            forward.host_port,
            forward.guest_ip,
            forward.guest_port
        );

        Ok(())
    }

    pub fn remove_port_forward(forward: &PortForward) -> Result<()> {
        let output = Command::new("iptables")
            .args([
                "-t",
                "nat",
                "-D",
                "PREROUTING",
                "-p",
                forward.protocol.as_str(),
                "--dport",
                &forward.host_port.to_string(),
                "-j",
                "DNAT",
                "--to-destination",
                &format!("{}:{}", forward.guest_ip, forward.guest_port),
            ])
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("Failed to remove port forward: {}", stderr));
        }

        tracing::info!("Removed port forward: {}:{}", forward.guest_ip, forward.guest_port);

        Ok(())
    }

    pub fn generate_mac_address() -> String {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        format!(
            "52:54:00:{:02x}:{:02x}:{:02x}",
            rng.gen::<u8>(),
            rng.gen::<u8>(),
            rng.gen::<u8>()
        )
    }
}
