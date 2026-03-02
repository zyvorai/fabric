use anyhow::Result;
use tracing;

use crate::models::{CompiledWgInterface, CompiledWgPeer};

/// Manages WireGuard interfaces via `ip` and `wg` commands.
pub struct WireguardEnforcer;

impl WireguardEnforcer {
    pub fn new() -> Self {
        Self
    }

    /// Ensure a WireGuard interface exists.
    pub fn ensure_interface(&self, iface: &CompiledWgInterface) -> Result<()> {
        // Delete existing (ignore errors if not present)
        let _ = run_cmd("ip", &["link", "del", &iface.interface_name]);

        // Create WireGuard interface
        run_cmd("ip", &["link", "add", &iface.interface_name, "type", "wireguard"])?;

        tracing::debug!("Created WireGuard interface {}", iface.interface_name);
        Ok(())
    }

    /// Apply WireGuard configuration (listen port + peers).
    pub fn apply_config(&self, iface: &CompiledWgInterface) -> Result<()> {
        let args = self.build_wg_set_args(iface);
        let str_args: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        run_cmd("wg", &str_args)?;

        tracing::debug!("Applied WireGuard config to {}", iface.interface_name);
        Ok(())
    }

    /// Assign the VPN address to the interface.
    pub fn assign_address(&self, iface: &CompiledWgInterface) -> Result<()> {
        run_cmd(
            "ip",
            &["addr", "add", &iface.address, "dev", &iface.interface_name],
        )?;

        tracing::debug!(
            "Assigned address {} to {}",
            iface.address,
            iface.interface_name
        );
        Ok(())
    }

    /// Bring the interface up.
    pub fn bring_up(&self, name: &str) -> Result<()> {
        run_cmd("ip", &["link", "set", name, "up"])?;
        tracing::debug!("Brought up interface {}", name);
        Ok(())
    }

    /// Full sync: ensure interface, apply config, assign address, bring up.
    pub fn sync_all(&self, interfaces: &[CompiledWgInterface]) -> Result<()> {
        for iface in interfaces {
            self.ensure_interface(iface)?;
            self.apply_config(iface)?;
            self.assign_address(iface)?;
            self.bring_up(&iface.interface_name)?;
        }

        tracing::info!("Synced {} WireGuard interfaces", interfaces.len());
        Ok(())
    }

    /// Remove a WireGuard interface.
    pub fn remove_interface(&self, name: &str) -> Result<()> {
        run_cmd("ip", &["link", "del", name])?;
        tracing::info!("Removed WireGuard interface {}", name);
        Ok(())
    }

    /// Cleanup managed interfaces.
    pub fn cleanup(&self, managed: &[String]) -> Result<()> {
        for name in managed {
            let _ = run_cmd("ip", &["link", "del", name]);
        }
        tracing::info!("Cleaned up {} WireGuard interfaces", managed.len());
        Ok(())
    }

    /// Build the `wg set` command arguments for an interface.
    pub fn build_wg_set_args(&self, iface: &CompiledWgInterface) -> Vec<String> {
        let mut args = vec![
            "set".to_string(),
            iface.interface_name.clone(),
            "listen-port".to_string(),
            iface.listen_port.to_string(),
        ];

        for peer in &iface.peers {
            args.extend(self.build_peer_args(peer));
        }

        args
    }

    /// Build peer arguments for a `wg set` command.
    pub fn build_peer_args(&self, peer: &CompiledWgPeer) -> Vec<String> {
        let mut args = vec!["peer".to_string(), peer.public_key.clone()];

        if let Some(ref endpoint) = peer.endpoint {
            args.push("endpoint".to_string());
            args.push(endpoint.clone());
        }

        if !peer.allowed_ips.is_empty() {
            args.push("allowed-ips".to_string());
            args.push(peer.allowed_ips.join(","));
        }

        if peer.persistent_keepalive > 0 {
            args.push("persistent-keepalive".to_string());
            args.push(peer.persistent_keepalive.to_string());
        }

        args
    }
}

/// Execute a system command.
fn run_cmd(cmd: &str, args: &[&str]) -> Result<()> {
    let output = std::process::Command::new(cmd).args(args).output();

    match output {
        Ok(out) if out.status.success() => Ok(()),
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            tracing::warn!("{} command failed: {:?} — {}", cmd, args, stderr);
            Err(anyhow::anyhow!("{} failed: {}", cmd, stderr))
        }
        Err(e) => {
            tracing::warn!("Failed to execute {}: {}", cmd, e);
            Err(anyhow::anyhow!("Failed to execute {}: {}", cmd, e))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_enforcer() -> WireguardEnforcer {
        WireguardEnforcer::new()
    }

    fn make_interface(name: &str, peers: Vec<CompiledWgPeer>) -> CompiledWgInterface {
        CompiledWgInterface {
            interface_name: name.to_string(),
            listen_port: 51820,
            address: "10.0.0.1/24".to_string(),
            private_key_ref: "key-ref".to_string(),
            peers,
        }
    }

    fn make_peer(
        key: &str,
        endpoint: Option<&str>,
        allowed_ips: &[&str],
        keepalive: u16,
    ) -> CompiledWgPeer {
        CompiledWgPeer {
            public_key: key.to_string(),
            endpoint: endpoint.map(|s| s.to_string()),
            allowed_ips: allowed_ips.iter().map(|s| s.to_string()).collect(),
            persistent_keepalive: keepalive,
        }
    }

    #[test]
    fn test_build_wg_set_args() {
        let enforcer = make_enforcer();
        let peer = make_peer("pubkey-1", Some("1.2.3.4:51820"), &["10.0.0.2/32"], 25);
        let iface = make_interface("wg0", vec![peer]);

        let args = enforcer.build_wg_set_args(&iface);
        assert!(args.contains(&"set".to_string()));
        assert!(args.contains(&"wg0".to_string()));
        assert!(args.contains(&"listen-port".to_string()));
        assert!(args.contains(&"51820".to_string()));
        assert!(args.contains(&"peer".to_string()));
        assert!(args.contains(&"pubkey-1".to_string()));
    }

    #[test]
    fn test_peer_args_with_endpoint() {
        let enforcer = make_enforcer();
        let peer = make_peer("pubkey-1", Some("1.2.3.4:51820"), &["10.0.0.2/32"], 25);

        let args = enforcer.build_peer_args(&peer);
        assert!(args.contains(&"endpoint".to_string()));
        assert!(args.contains(&"1.2.3.4:51820".to_string()));
    }

    #[test]
    fn test_peer_args_without_endpoint() {
        let enforcer = make_enforcer();
        let peer = make_peer("pubkey-1", None, &["10.0.0.2/32"], 25);

        let args = enforcer.build_peer_args(&peer);
        assert!(!args.contains(&"endpoint".to_string()));
    }

    #[test]
    fn test_keepalive_in_args() {
        let enforcer = make_enforcer();
        let peer = make_peer("pubkey-1", None, &["10.0.0.0/24"], 30);

        let args = enforcer.build_peer_args(&peer);
        assert!(args.contains(&"persistent-keepalive".to_string()));
        assert!(args.contains(&"30".to_string()));
    }

    #[test]
    fn test_multiple_allowed_ips() {
        let enforcer = make_enforcer();
        let peer = make_peer(
            "pubkey-1",
            None,
            &["10.0.0.0/24", "10.0.1.0/24"],
            25,
        );

        let args = enforcer.build_peer_args(&peer);
        assert!(args.contains(&"allowed-ips".to_string()));
        assert!(args.contains(&"10.0.0.0/24,10.0.1.0/24".to_string()));
    }

    #[test]
    fn test_cleanup_safe() {
        let enforcer = make_enforcer();
        // Cleanup with no interfaces should succeed
        let result = enforcer.cleanup(&[]);
        assert!(result.is_ok());
    }
}
