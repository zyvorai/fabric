use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use tracing;

use crate::models::{CompiledWgInterface, CompiledWgPeer};

/// Default directory for systemd-networkd config files.
const DEFAULT_CONFIG_DIR: &str = "/etc/systemd/network";

/// File prefix for vpn-mesh managed files.
const FILE_PREFIX: &str = "50-vmspawnd-wg-";

/// Manages WireGuard interfaces via systemd-networkd .netdev/.network files.
pub struct WireguardEnforcer {
    config_dir: PathBuf,
    file_prefix: String,
}

impl WireguardEnforcer {
    pub fn new() -> Self {
        Self {
            config_dir: PathBuf::from(DEFAULT_CONFIG_DIR),
            file_prefix: FILE_PREFIX.to_string(),
        }
    }

    /// Create with a custom config directory (for testing).
    pub fn with_config_dir(config_dir: &Path) -> Self {
        Self {
            config_dir: config_dir.to_path_buf(),
            file_prefix: FILE_PREFIX.to_string(),
        }
    }

    /// Write a .netdev file for a WireGuard interface.
    pub fn write_netdev(&self, iface: &CompiledWgInterface) -> Result<()> {
        let content = self.build_netdev(iface);
        self.write_file(&iface.interface_name, "netdev", &content)
    }

    /// Write a .network file for a WireGuard interface.
    pub fn write_network(&self, iface: &CompiledWgInterface) -> Result<()> {
        let content = self.build_network(iface);
        self.write_file(&iface.interface_name, "network", &content)
    }

    /// Full sync: write .netdev + .network for all interfaces, remove stale files, reload networkd.
    pub fn sync_all(&self, interfaces: &[CompiledWgInterface]) -> Result<()> {
        // Collect names of interfaces we're about to write
        let active_names: Vec<&str> = interfaces
            .iter()
            .map(|i| i.interface_name.as_str())
            .collect();

        // Remove stale files for interfaces no longer in the list
        self.remove_stale_files(&active_names)?;

        // Write config for each interface
        for iface in interfaces {
            self.write_netdev(iface)?;
            self.write_network(iface)?;
        }

        // Reload systemd-networkd to apply
        self.reload()?;

        tracing::info!("Synced {} WireGuard interfaces via networkd", interfaces.len());
        Ok(())
    }

    /// Remove config files for a specific interface.
    pub fn remove_interface(&self, name: &str) -> Result<()> {
        let netdev_path = self.file_path(name, "netdev");
        let network_path = self.file_path(name, "network");

        if netdev_path.exists() {
            std::fs::remove_file(&netdev_path)
                .with_context(|| format!("Failed to remove {}", netdev_path.display()))?;
        }
        if network_path.exists() {
            std::fs::remove_file(&network_path)
                .with_context(|| format!("Failed to remove {}", network_path.display()))?;
        }

        tracing::info!("Removed networkd config for WireGuard interface {}", name);
        Ok(())
    }

    /// Cleanup all managed WireGuard config files.
    pub fn cleanup(&self, managed: &[String]) -> Result<()> {
        for name in managed {
            let _ = self.remove_interface(name);
        }

        if !managed.is_empty() {
            let _ = self.reload();
        }

        tracing::info!("Cleaned up {} WireGuard interfaces", managed.len());
        Ok(())
    }

    /// Reload systemd-networkd to apply configuration changes.
    pub fn reload(&self) -> Result<()> {
        let output = std::process::Command::new("networkctl")
            .arg("reload")
            .output()
            .context("Failed to execute networkctl reload")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("networkctl reload failed: {}", stderr));
        }

        tracing::debug!("Reloaded systemd-networkd");
        Ok(())
    }

    /// Build a .netdev file content for a WireGuard interface.
    ///
    /// Format:
    /// ```ini
    /// [NetDev]
    /// Name=wg0
    /// Kind=wireguard
    ///
    /// [WireGuard]
    /// ListenPort=51820
    /// PrivateKey=<key>
    ///
    /// [WireGuardPeer]
    /// PublicKey=<key>
    /// Endpoint=1.2.3.4:51820
    /// AllowedIPs=10.0.0.0/24
    /// PersistentKeepalive=25
    /// ```
    pub fn build_netdev(&self, iface: &CompiledWgInterface) -> String {
        let mut out = String::new();

        // [NetDev] section
        out.push_str("[NetDev]\n");
        out.push_str(&format!("Name={}\n", iface.interface_name));
        out.push_str("Kind=wireguard\n");

        // [WireGuard] section
        out.push_str("\n[WireGuard]\n");
        out.push_str(&format!("ListenPort={}\n", iface.listen_port));
        out.push_str(&format!("PrivateKey={}\n", iface.private_key_ref));

        // [WireGuardPeer] sections
        for peer in &iface.peers {
            out.push_str(&self.build_peer_section(peer));
        }

        out
    }

    /// Build a [WireGuardPeer] section.
    pub fn build_peer_section(&self, peer: &CompiledWgPeer) -> String {
        let mut out = String::new();

        out.push_str("\n[WireGuardPeer]\n");
        out.push_str(&format!("PublicKey={}\n", peer.public_key));

        if let Some(ref endpoint) = peer.endpoint {
            out.push_str(&format!("Endpoint={}\n", endpoint));
        }

        for ip in &peer.allowed_ips {
            out.push_str(&format!("AllowedIPs={}\n", ip));
        }

        if peer.persistent_keepalive > 0 {
            out.push_str(&format!("PersistentKeepalive={}\n", peer.persistent_keepalive));
        }

        out
    }

    /// Build a .network file content for a WireGuard interface.
    ///
    /// Format:
    /// ```ini
    /// [Match]
    /// Name=wg0
    ///
    /// [Network]
    /// Address=10.0.0.1/24
    /// ```
    pub fn build_network(&self, iface: &CompiledWgInterface) -> String {
        let mut out = String::new();

        out.push_str("[Match]\n");
        out.push_str(&format!("Name={}\n", iface.interface_name));

        out.push_str("\n[Network]\n");
        out.push_str(&format!("Address={}\n", iface.address));

        out
    }

    // ── Internal helpers ────────────────────────────────────────────────

    fn file_path(&self, device_name: &str, ext: &str) -> PathBuf {
        let filename = format!("{}{}.{}", self.file_prefix, device_name, ext);
        self.config_dir.join(filename)
    }

    fn write_file(&self, device_name: &str, ext: &str, content: &str) -> Result<()> {
        std::fs::create_dir_all(&self.config_dir)
            .with_context(|| format!("Failed to create config dir {}", self.config_dir.display()))?;

        let path = self.file_path(device_name, ext);
        let tmp_path = self.config_dir.join(format!("{}{}.{}.tmp", self.file_prefix, device_name, ext));

        std::fs::write(&tmp_path, content)
            .with_context(|| format!("Failed to write {}", tmp_path.display()))?;
        std::fs::rename(&tmp_path, &path)
            .with_context(|| format!("Failed to rename {} to {}", tmp_path.display(), path.display()))?;

        tracing::debug!("Wrote {}", path.display());
        Ok(())
    }

    fn remove_stale_files(&self, active_names: &[&str]) -> Result<()> {
        if !self.config_dir.exists() {
            return Ok(());
        }

        let entries = std::fs::read_dir(&self.config_dir)
            .with_context(|| format!("Failed to read {}", self.config_dir.display()))?;

        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();

            if !name_str.starts_with(&self.file_prefix) {
                continue;
            }

            // Extract interface name from filename: prefix + iface_name + .ext
            let without_prefix = &name_str[self.file_prefix.len()..];
            let iface_name = without_prefix
                .rsplit_once('.')
                .map(|(n, _)| n)
                .unwrap_or(without_prefix);

            if !active_names.contains(&iface_name) {
                let path = entry.path();
                if let Err(e) = std::fs::remove_file(&path) {
                    tracing::warn!("Failed to remove stale file {}: {}", path.display(), e);
                } else {
                    tracing::debug!("Removed stale file {}", path.display());
                }
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_enforcer_with_dir(dir: &Path) -> WireguardEnforcer {
        WireguardEnforcer::with_config_dir(dir)
    }

    fn make_interface(name: &str, peers: Vec<CompiledWgPeer>) -> CompiledWgInterface {
        CompiledWgInterface {
            interface_name: name.to_string(),
            listen_port: 51820,
            address: "10.0.0.1/24".to_string(),
            private_key_ref: "aWFtYXByaXZhdGVrZXk=".to_string(),
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
    fn test_build_netdev_basic() {
        let enforcer = WireguardEnforcer::new();
        let iface = make_interface("wg0", vec![]);

        let content = enforcer.build_netdev(&iface);
        assert!(content.contains("[NetDev]"));
        assert!(content.contains("Name=wg0"));
        assert!(content.contains("Kind=wireguard"));
        assert!(content.contains("[WireGuard]"));
        assert!(content.contains("ListenPort=51820"));
        assert!(content.contains("PrivateKey=aWFtYXByaXZhdGVrZXk="));
    }

    #[test]
    fn test_build_netdev_with_peer() {
        let enforcer = WireguardEnforcer::new();
        let peer = make_peer("pubkey-1", Some("1.2.3.4:51820"), &["10.0.0.2/32"], 25);
        let iface = make_interface("wg0", vec![peer]);

        let content = enforcer.build_netdev(&iface);
        assert!(content.contains("[WireGuardPeer]"));
        assert!(content.contains("PublicKey=pubkey-1"));
        assert!(content.contains("Endpoint=1.2.3.4:51820"));
        assert!(content.contains("AllowedIPs=10.0.0.2/32"));
        assert!(content.contains("PersistentKeepalive=25"));
    }

    #[test]
    fn test_build_peer_without_endpoint() {
        let enforcer = WireguardEnforcer::new();
        let peer = make_peer("pubkey-1", None, &["10.0.0.2/32"], 25);

        let content = enforcer.build_peer_section(&peer);
        assert!(content.contains("PublicKey=pubkey-1"));
        assert!(!content.contains("Endpoint="));
    }

    #[test]
    fn test_build_peer_multiple_allowed_ips() {
        let enforcer = WireguardEnforcer::new();
        let peer = make_peer("pubkey-1", None, &["10.0.0.0/24", "10.0.1.0/24"], 25);

        let content = enforcer.build_peer_section(&peer);
        assert!(content.contains("AllowedIPs=10.0.0.0/24"));
        assert!(content.contains("AllowedIPs=10.0.1.0/24"));
    }

    #[test]
    fn test_build_peer_no_keepalive() {
        let enforcer = WireguardEnforcer::new();
        let peer = make_peer("pubkey-1", None, &["10.0.0.0/24"], 0);

        let content = enforcer.build_peer_section(&peer);
        assert!(!content.contains("PersistentKeepalive"));
    }

    #[test]
    fn test_build_network() {
        let enforcer = WireguardEnforcer::new();
        let iface = make_interface("wg0", vec![]);

        let content = enforcer.build_network(&iface);
        assert!(content.contains("[Match]"));
        assert!(content.contains("Name=wg0"));
        assert!(content.contains("[Network]"));
        assert!(content.contains("Address=10.0.0.1/24"));
    }

    #[test]
    fn test_write_and_read_files() {
        let dir = tempfile::tempdir().unwrap();
        let enforcer = make_enforcer_with_dir(dir.path());
        let peer = make_peer("pubkey-1", Some("1.2.3.4:51820"), &["10.0.0.2/32"], 25);
        let iface = make_interface("wg0", vec![peer]);

        enforcer.write_netdev(&iface).unwrap();
        enforcer.write_network(&iface).unwrap();

        let netdev_path = dir.path().join("50-vmspawnd-wg-wg0.netdev");
        let network_path = dir.path().join("50-vmspawnd-wg-wg0.network");

        assert!(netdev_path.exists());
        assert!(network_path.exists());

        let netdev_content = std::fs::read_to_string(&netdev_path).unwrap();
        assert!(netdev_content.contains("Kind=wireguard"));
        assert!(netdev_content.contains("[WireGuardPeer]"));
        assert!(netdev_content.contains("PublicKey=pubkey-1"));

        let network_content = std::fs::read_to_string(&network_path).unwrap();
        assert!(network_content.contains("Name=wg0"));
        assert!(network_content.contains("Address=10.0.0.1/24"));
    }

    #[test]
    fn test_remove_interface_files() {
        let dir = tempfile::tempdir().unwrap();
        let enforcer = make_enforcer_with_dir(dir.path());
        let iface = make_interface("wg0", vec![]);

        enforcer.write_netdev(&iface).unwrap();
        enforcer.write_network(&iface).unwrap();

        let netdev_path = dir.path().join("50-vmspawnd-wg-wg0.netdev");
        let network_path = dir.path().join("50-vmspawnd-wg-wg0.network");
        assert!(netdev_path.exists());
        assert!(network_path.exists());

        enforcer.remove_interface("wg0").unwrap();
        assert!(!netdev_path.exists());
        assert!(!network_path.exists());
    }

    #[test]
    fn test_remove_stale_files() {
        let dir = tempfile::tempdir().unwrap();
        let enforcer = make_enforcer_with_dir(dir.path());

        // Write configs for wg0 and wg1
        let iface0 = make_interface("wg0", vec![]);
        let iface1 = make_interface("wg1", vec![]);
        enforcer.write_netdev(&iface0).unwrap();
        enforcer.write_network(&iface0).unwrap();
        enforcer.write_netdev(&iface1).unwrap();
        enforcer.write_network(&iface1).unwrap();

        // Only wg0 is active now
        enforcer.remove_stale_files(&["wg0"]).unwrap();

        // wg0 files should remain
        assert!(dir.path().join("50-vmspawnd-wg-wg0.netdev").exists());
        assert!(dir.path().join("50-vmspawnd-wg-wg0.network").exists());
        // wg1 files should be gone
        assert!(!dir.path().join("50-vmspawnd-wg-wg1.netdev").exists());
        assert!(!dir.path().join("50-vmspawnd-wg-wg1.network").exists());
    }

    #[test]
    fn test_cleanup_empty() {
        let dir = tempfile::tempdir().unwrap();
        let enforcer = make_enforcer_with_dir(dir.path());
        let result = enforcer.cleanup(&[]);
        assert!(result.is_ok());
    }

    #[test]
    fn test_multiple_peers() {
        let enforcer = WireguardEnforcer::new();
        let peers = vec![
            make_peer("pubkey-1", Some("1.2.3.4:51820"), &["10.0.0.2/32"], 25),
            make_peer("pubkey-2", Some("5.6.7.8:51820"), &["10.0.0.3/32"], 30),
        ];
        let iface = make_interface("wg0", peers);

        let content = enforcer.build_netdev(&iface);
        // Should have two [WireGuardPeer] sections
        let peer_count = content.matches("[WireGuardPeer]").count();
        assert_eq!(peer_count, 2);
        assert!(content.contains("PublicKey=pubkey-1"));
        assert!(content.contains("PublicKey=pubkey-2"));
        assert!(content.contains("PersistentKeepalive=25"));
        assert!(content.contains("PersistentKeepalive=30"));
    }
}
