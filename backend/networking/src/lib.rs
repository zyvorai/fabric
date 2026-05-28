// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

pub mod host_discovery;
pub mod models;
pub mod netlink;
pub mod nftables;
pub mod parser;
pub mod serializer;

use anyhow::{Context, Result};
use models::*;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

pub struct NetworkdManager {
    config_dir: PathBuf,
    file_prefix: String,
}

impl NetworkdManager {
    pub fn new(config_dir: impl Into<PathBuf>, file_prefix: impl Into<String>) -> Self {
        Self {
            config_dir: config_dir.into(),
            file_prefix: file_prefix.into(),
        }
    }

    /// Write a bridge's .netdev and .network files
    pub fn apply_bridge(&self, cfg: &BridgeConfig) -> Result<()> {
        let netdev = serializer::bridge_netdev(cfg);
        let network = serializer::bridge_network(cfg);

        self.write_file(&cfg.name, "netdev", &netdev)?;
        self.write_file(&cfg.name, "network", &network)?;

        tracing::info!("Applied bridge config: {}", cfg.name);
        Ok(())
    }

    /// Write a VLAN's .netdev, parent .network, and VLAN .network files
    pub fn apply_vlan(&self, cfg: &VlanConfig) -> Result<()> {
        let netdev = serializer::vlan_netdev(cfg);
        let parent_network = serializer::vlan_parent_network(cfg, &self.file_prefix);
        let vlan_network = serializer::vlan_network(cfg);

        self.write_file(&cfg.name, "netdev", &netdev)?;
        self.write_file(&format!("{}-parent", cfg.name), "network", &parent_network)?;
        self.write_file(&cfg.name, "network", &vlan_network)?;

        tracing::info!("Applied VLAN config: {} (id={}, parent={})", cfg.name, cfg.vlan_id, cfg.parent_interface);
        Ok(())
    }

    /// Write a macvtap's .netdev, parent .network, and macvtap .network files
    pub fn apply_macvtap(&self, cfg: &MacvtapConfig) -> Result<()> {
        let netdev = serializer::macvtap_netdev(cfg);
        let parent_network = serializer::macvtap_parent_network(cfg);
        let macvtap_network = serializer::macvtap_network(cfg);

        self.write_file(&cfg.name, "netdev", &netdev)?;
        self.write_file(&format!("{}-parent", cfg.name), "network", &parent_network)?;
        self.write_file(&cfg.name, "network", &macvtap_network)?;

        tracing::info!("Applied macvtap config: {} (parent={}, mode={:?})", cfg.name, cfg.parent_interface, cfg.mode);
        Ok(())
    }

    /// Write a tap's .netdev and .network files
    pub fn apply_tap(&self, cfg: &TapConfig) -> Result<()> {
        let netdev = serializer::tap_netdev(cfg);
        let network = serializer::tap_network(cfg);

        self.write_file(&cfg.name, "netdev", &netdev)?;
        self.write_file(&cfg.name, "network", &network)?;

        tracing::info!("Applied tap config: {}", cfg.name);
        Ok(())
    }

    /// Write a bond's .netdev, .network, and slave .network files
    pub fn apply_bond(&self, cfg: &BondConfig) -> Result<()> {
        let netdev = serializer::bond_netdev(cfg);
        let network = serializer::bond_network(cfg);

        self.write_file(&cfg.name, "netdev", &netdev)?;
        self.write_file(&cfg.name, "network", &network)?;

        // Write slave .network files for each interface
        for slave in &cfg.slave_interfaces {
            let slave_network = serializer::bond_slave_network(slave, &cfg.name);
            self.write_file(&format!("{}-slave-{}", cfg.name, slave), "network", &slave_network)?;
        }

        tracing::info!("Applied bond config: {} (mode={}, slaves={:?})", cfg.name, cfg.mode.as_str(), cfg.slave_interfaces);
        Ok(())
    }

    /// Write a .network file for an existing physical interface
    pub fn apply_network_file(&self, cfg: &NetworkFileConfig) -> Result<()> {
        let content = serializer::network_file(cfg);
        self.write_file(&format!("net-{}", cfg.match_name), "network", &content)?;

        tracing::info!("Applied network file for: {}", cfg.match_name);
        Ok(())
    }

    /// Write a .link file for interface configuration
    pub fn apply_link_file(&self, cfg: &LinkFileConfig) -> Result<()> {
        let content = serializer::link_file(cfg);
        let file_id = cfg.name.as_deref()
            .or(cfg.match_original_name.as_deref())
            .unwrap_or(&cfg.id);
        self.write_file(&format!("link-{}", file_id), "link", &content)?;

        tracing::info!("Applied link file: {:?}", cfg.name);
        Ok(())
    }

    /// Write a VXLAN's .netdev, optional parent .network, and VXLAN .network files
    pub fn apply_vxlan(&self, cfg: &VxlanConfig) -> Result<()> {
        let netdev = serializer::vxlan_netdev(cfg);
        let vxlan_network = serializer::vxlan_network(cfg);

        self.write_file(&cfg.name, "netdev", &netdev)?;
        self.write_file(&cfg.name, "network", &vxlan_network)?;

        // If a parent interface is specified, write the parent .network file
        if cfg.parent_interface.is_some() {
            let parent_network = serializer::vxlan_parent_network(cfg);
            if !parent_network.is_empty() {
                self.write_file(&format!("{}-parent", cfg.name), "network", &parent_network)?;
            }
        }

        tracing::info!("Applied VXLAN config: {} (VNI={})", cfg.name, cfg.vni);
        Ok(())
    }

    /// Configure SR-IOV VFs on a physical function interface
    pub fn apply_sriov(&self, cfg: &SriovConfig) -> Result<()> {
        // Set number of VFs via sysfs
        let sriov_path = format!("/sys/class/net/{}/device/sriov_numvfs", cfg.pf_name);
        fs::write(&sriov_path, cfg.num_vfs.to_string())
            .with_context(|| format!("Failed to set sriov_numvfs on {}", cfg.pf_name))?;

        tracing::info!(
            pf = %cfg.pf_name, num_vfs = cfg.num_vfs,
            "Set SR-IOV VFs"
        );

        // Configure individual VFs using ip link
        for vf in &cfg.vf_configs {
            let mut args = vec![
                "link".to_string(),
                "set".to_string(),
                cfg.pf_name.clone(),
                "vf".to_string(),
                vf.vf_index.to_string(),
            ];

            if let Some(ref mac) = vf.mac_address {
                args.push("mac".to_string());
                args.push(mac.clone());
            }
            if let Some(vlan) = vf.vlan {
                args.push("vlan".to_string());
                args.push(vlan.to_string());
                if let Some(qos) = vf.qos {
                    args.push("qos".to_string());
                    args.push(qos.to_string());
                }
            }
            if let Some(spoofchk) = vf.spoofchk {
                args.push("spoofchk".to_string());
                args.push(if spoofchk { "on" } else { "off" }.to_string());
            }
            if let Some(trust) = vf.trust {
                args.push("trust".to_string());
                args.push(if trust { "on" } else { "off" }.to_string());
            }

            // Only run if we have extra config beyond the base "ip link set dev vf idx"
            if args.len() > 5 {
                let output = Command::new("ip")
                    .args(&args)
                    .output()
                    .with_context(|| format!("Failed to configure VF {}", vf.vf_index))?;

                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    return Err(anyhow::anyhow!(
                        "ip link set vf {} failed: {}", vf.vf_index, stderr
                    ));
                }

                tracing::info!(
                    pf = %cfg.pf_name, vf = vf.vf_index,
                    "Configured SR-IOV VF"
                );
            }
        }

        Ok(())
    }

    /// Remove SR-IOV VFs by setting numvfs to 0
    pub fn remove_sriov(&self, pf_name: &str) -> Result<()> {
        let sriov_path = format!("/sys/class/net/{}/device/sriov_numvfs", pf_name);
        fs::write(&sriov_path, "0")
            .with_context(|| format!("Failed to reset sriov_numvfs on {}", pf_name))?;

        tracing::info!(pf = %pf_name, "Removed SR-IOV VFs");
        Ok(())
    }

    /// Remove all config files for a named device
    pub fn remove_device(&self, name: &str) -> Result<()> {
        let patterns = [
            format!("{}{}.netdev", self.file_prefix, name),
            format!("{}{}.network", self.file_prefix, name),
            format!("{}{}-parent.network", self.file_prefix, name),
            format!("{}{}.link", self.file_prefix, name),
        ];

        for filename in &patterns {
            let path = self.config_dir.join(filename);
            if path.exists() {
                fs::remove_file(&path)
                    .with_context(|| format!("Failed to remove {}", path.display()))?;
                tracing::info!("Removed {}", path.display());
            }
        }

        // Also remove any bond slave files matching prefix-name-slave-*
        if self.config_dir.exists() {
            let slave_prefix = format!("{}{}-slave-", self.file_prefix, name);
            for entry in fs::read_dir(&self.config_dir)? {
                let entry = entry?;
                let fname = entry.file_name().to_string_lossy().to_string();
                if fname.starts_with(&slave_prefix) {
                    fs::remove_file(entry.path())
                        .with_context(|| format!("Failed to remove {}", entry.path().display()))?;
                    tracing::info!("Removed {}", entry.path().display());
                }
            }
        }

        Ok(())
    }

    /// Run `networkctl reload` to apply configuration changes
    pub fn reload(&self) -> Result<()> {
        let output = Command::new("networkctl")
            .arg("reload")
            .output()
            .context("Failed to execute networkctl reload")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("networkctl reload failed: {}", stderr));
        }

        tracing::info!("Reloaded systemd-networkd");
        Ok(())
    }

    /// List all config files we manage (with our prefix)
    pub fn list_managed_files(&self) -> Result<Vec<String>> {
        let mut files = Vec::new();
        if !self.config_dir.exists() {
            return Ok(files);
        }

        for entry in fs::read_dir(&self.config_dir)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&self.file_prefix) {
                files.push(name);
            }
        }

        files.sort();
        Ok(files)
    }

    /// Query `networkctl status <name>` for a specific device
    pub fn device_status(&self, name: &str) -> Result<String> {
        let output = Command::new("networkctl")
            .args(["status", name, "--no-pager"])
            .output()
            .context("Failed to execute networkctl status")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("networkctl status {} failed: {}", name, stderr));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// List network links via networkctl, falling back to `ip -j link` when networkctl is absent.
    pub fn list_links(&self) -> Result<Vec<LinkInfo>> {
        match self.list_links_networkctl() {
            Ok(links) if !links.is_empty() => Ok(links),
            Ok(_) | Err(_) => self.list_links_ip(),
        }
    }

    fn list_links_networkctl(&self) -> Result<Vec<LinkInfo>> {
        let output = Command::new("networkctl")
            .args(["list", "--no-pager", "--no-legend"])
            .output()
            .context("Failed to execute networkctl list")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("networkctl list failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut links = Vec::new();

        for line in stdout.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                if let Ok(index) = parts[0].parse::<u32>() {
                    links.push(LinkInfo {
                        index,
                        name: parts[1].to_string(),
                        kind: parts[2].to_string(),
                        operational_state: parts[3].to_string(),
                        setup_state: parts.get(4).unwrap_or(&"").to_string(),
                    });
                }
            }
        }

        Ok(links)
    }

    /// Parse `ip -j link show` (works without systemd-networkd / networkctl).
    pub fn list_links_ip(&self) -> Result<Vec<LinkInfo>> {
        let bridge_names = self.list_bridge_names_ip()?;

        let output = Command::new("ip")
            .args(["-j", "link", "show"])
            .output()
            .context("Failed to execute ip -j link show")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("ip -j link show failed: {}", stderr));
        }

        let entries: Vec<serde_json::Value> =
            serde_json::from_slice(&output.stdout).context("Failed to parse ip -j link JSON")?;

        let mut links = Vec::new();
        for entry in entries {
            let name = match entry.get("ifname").and_then(|v| v.as_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };
            let index = entry
                .get("ifindex")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;
            let operstate = entry
                .get("operstate")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_lowercase();
            let link_type = entry
                .get("link_type")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let kind = if bridge_names.contains(&name) {
                "bridge".to_string()
            } else {
                link_type
            };
            links.push(LinkInfo {
                index,
                name,
                kind,
                operational_state: operstate,
                setup_state: "unmanaged".to_string(),
            });
        }

        links.sort_by(|a, b| a.index.cmp(&b.index));
        Ok(links)
    }

    /// Host interface discovery (shared by API list endpoints).
    pub fn discover_host_interfaces(&self) -> Result<Vec<host_discovery::HostNetDevice>> {
        host_discovery::discover_interfaces()
    }

    fn list_bridge_names_ip(&self) -> Result<std::collections::HashSet<String>> {
        let output = Command::new("ip")
            .args(["-j", "link", "show", "type", "bridge"])
            .output();

        let output = match output {
            Ok(o) if o.status.success() => o,
            _ => return Ok(std::collections::HashSet::new()),
        };

        let entries: Vec<serde_json::Value> =
            serde_json::from_slice(&output.stdout).unwrap_or_default();

        Ok(entries
            .iter()
            .filter_map(|e| e.get("ifname").and_then(|v| v.as_str()).map(str::to_string))
            .collect())
    }

    /// Generate a random MAC address with QEMU KVM prefix 52:54:00
    pub fn generate_mac_address() -> String {
        use rand::Rng;
        let mut rng = rand::rng();
        format!(
            "52:54:00:{:02x}:{:02x}:{:02x}",
            rng.random::<u8>(),
            rng.random::<u8>(),
            rng.random::<u8>()
        )
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn write_file(&self, device_name: &str, ext: &str, content: &str) -> Result<()> {
        fs::create_dir_all(&self.config_dir)
            .with_context(|| format!("Failed to create config dir {}", self.config_dir.display()))?;

        let filename = format!("{}{}.{}", self.file_prefix, device_name, ext);
        let path = self.config_dir.join(&filename);
        let tmp_path = self.config_dir.join(format!("{}.tmp", filename));

        fs::write(&tmp_path, content)
            .with_context(|| format!("Failed to write {}", tmp_path.display()))?;
        fs::rename(&tmp_path, &path)
            .with_context(|| format!("Failed to rename {} to {}", tmp_path.display(), path.display()))?;

        tracing::debug!("Wrote {}", path.display());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp_manager() -> (NetworkdManager, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let mgr = NetworkdManager::new(dir.path(), "50-vmspawnd-");
        (mgr, dir)
    }

    #[test]
    fn test_apply_bridge_writes_files() {
        let (mgr, dir) = tmp_manager();
        let cfg = BridgeConfig {
            id: "id".into(),
            name: "br0".into(),
            stp: Some(true),
            forward_delay_sec: None,
            hello_time_sec: None,
            max_age_sec: None,
            vlan_filtering: None,
            mtu: None,
            mac_address: None,
            addresses: vec!["10.0.0.1/24".into()],
            gateway: None,
            dns: vec![],
            dhcp: DhcpMode::No,
            created: String::new(),
            updated: String::new(),
            managed: true,
            operational_state: None,
        };
        mgr.apply_bridge(&cfg).unwrap();

        let netdev_path = dir.path().join("50-vmspawnd-br0.netdev");
        let network_path = dir.path().join("50-vmspawnd-br0.network");
        assert!(netdev_path.exists());
        assert!(network_path.exists());

        let netdev = fs::read_to_string(netdev_path).unwrap();
        assert!(netdev.contains("Kind=bridge"));
        assert!(netdev.contains("STP=yes"));

        let network = fs::read_to_string(network_path).unwrap();
        assert!(network.contains("Address=10.0.0.1/24"));
    }

    #[test]
    fn test_apply_macvtap_writes_files() {
        let (mgr, dir) = tmp_manager();
        let cfg = MacvtapConfig {
            id: "id".into(),
            name: "mvt0".into(),
            parent_interface: "eth0".into(),
            mode: MacvtapMode::Bridge,
            mtu: None,
            mac_address: Some("52:54:00:aa:bb:cc".into()),
            created: String::new(),
            updated: String::new(),
        };
        mgr.apply_macvtap(&cfg).unwrap();

        assert!(dir.path().join("50-vmspawnd-mvt0.netdev").exists());
        assert!(dir.path().join("50-vmspawnd-mvt0-parent.network").exists());
        assert!(dir.path().join("50-vmspawnd-mvt0.network").exists());

        let netdev = fs::read_to_string(dir.path().join("50-vmspawnd-mvt0.netdev")).unwrap();
        assert!(netdev.contains("Kind=macvtap"));
        assert!(netdev.contains("Mode=bridge"));
    }

    #[test]
    fn test_remove_device() {
        let (mgr, dir) = tmp_manager();
        // Create some files
        fs::write(dir.path().join("50-vmspawnd-br0.netdev"), "test").unwrap();
        fs::write(dir.path().join("50-vmspawnd-br0.network"), "test").unwrap();

        mgr.remove_device("br0").unwrap();

        assert!(!dir.path().join("50-vmspawnd-br0.netdev").exists());
        assert!(!dir.path().join("50-vmspawnd-br0.network").exists());
    }

    #[test]
    fn test_list_managed_files() {
        let (mgr, dir) = tmp_manager();
        fs::write(dir.path().join("50-vmspawnd-br0.netdev"), "test").unwrap();
        fs::write(dir.path().join("50-vmspawnd-br0.network"), "test").unwrap();
        fs::write(dir.path().join("99-other.network"), "unrelated").unwrap();

        let files = mgr.list_managed_files().unwrap();
        assert_eq!(files.len(), 2);
        assert!(files.contains(&"50-vmspawnd-br0.netdev".to_string()));
        assert!(files.contains(&"50-vmspawnd-br0.network".to_string()));
    }

    #[test]
    fn test_generate_mac() {
        let mac = NetworkdManager::generate_mac_address();
        assert!(mac.starts_with("52:54:00:"));
        assert_eq!(mac.len(), 17);
    }

    #[test]
    fn test_apply_bond_writes_files() {
        let (mgr, dir) = tmp_manager();
        let cfg = BondConfig {
            id: "id".into(),
            name: "bond0".into(),
            mode: BondMode::Ieee8023ad,
            mii_monitor_sec: Some(100),
            up_delay_sec: None,
            down_delay_sec: None,
            lacp_rate: None,
            transmit_hash_policy: None,
            min_links: None,
            primary_slave: None,
            slave_interfaces: vec!["eth0".into(), "eth1".into()],
            mtu: None,
            mac_address: None,
            addresses: vec!["10.0.0.1/24".into()],
            gateway: None,
            dns: vec![],
            dhcp: DhcpMode::No,
            routes: vec![],
            created: String::new(),
            updated: String::new(),
        };
        mgr.apply_bond(&cfg).unwrap();

        assert!(dir.path().join("50-vmspawnd-bond0.netdev").exists());
        assert!(dir.path().join("50-vmspawnd-bond0.network").exists());
        assert!(dir.path().join("50-vmspawnd-bond0-slave-eth0.network").exists());
        assert!(dir.path().join("50-vmspawnd-bond0-slave-eth1.network").exists());

        let slave = fs::read_to_string(dir.path().join("50-vmspawnd-bond0-slave-eth0.network")).unwrap();
        assert!(slave.contains("Name=eth0"));
        assert!(slave.contains("Bond=bond0"));
    }

    #[test]
    fn test_remove_bond_cleans_slaves() {
        let (mgr, dir) = tmp_manager();
        fs::write(dir.path().join("50-vmspawnd-bond0.netdev"), "test").unwrap();
        fs::write(dir.path().join("50-vmspawnd-bond0.network"), "test").unwrap();
        fs::write(dir.path().join("50-vmspawnd-bond0-slave-eth0.network"), "test").unwrap();
        fs::write(dir.path().join("50-vmspawnd-bond0-slave-eth1.network"), "test").unwrap();

        mgr.remove_device("bond0").unwrap();

        assert!(!dir.path().join("50-vmspawnd-bond0.netdev").exists());
        assert!(!dir.path().join("50-vmspawnd-bond0.network").exists());
        assert!(!dir.path().join("50-vmspawnd-bond0-slave-eth0.network").exists());
        assert!(!dir.path().join("50-vmspawnd-bond0-slave-eth1.network").exists());
    }

    #[test]
    fn test_apply_network_file() {
        let (mgr, dir) = tmp_manager();
        let cfg = NetworkFileConfig {
            id: "id".into(),
            match_name: "enp3s0".into(),
            match_mac: None,
            addresses: vec!["192.168.1.10/24".into()],
            gateway: Some("192.168.1.1".into()),
            dns: vec![],
            dhcp: DhcpMode::No,
            bridge: Some("br0".into()),
            bond: None,
            mtu: None,
            routes: vec![],
            description: None,
            created: String::new(),
            updated: String::new(),
        };
        mgr.apply_network_file(&cfg).unwrap();

        let path = dir.path().join("50-vmspawnd-net-enp3s0.network");
        assert!(path.exists());
        let content = fs::read_to_string(path).unwrap();
        assert!(content.contains("Name=enp3s0"));
        assert!(content.contains("Bridge=br0"));
    }

    #[test]
    fn test_apply_link_file() {
        let (mgr, dir) = tmp_manager();
        let cfg = LinkFileConfig {
            id: "test-id".into(),
            match_mac: Some("00:11:22:33:44:55".into()),
            match_path: None,
            match_driver: None,
            match_original_name: None,
            name: Some("lan0".into()),
            mtu: Some(9000),
            mac_address: None,
            wake_on_lan: None,
            description: None,
            created: String::new(),
            updated: String::new(),
        };
        mgr.apply_link_file(&cfg).unwrap();

        let path = dir.path().join("50-vmspawnd-link-lan0.link");
        assert!(path.exists());
        let content = fs::read_to_string(path).unwrap();
        assert!(content.contains("MACAddress=00:11:22:33:44:55"));
        assert!(content.contains("Name=lan0"));
    }
}
