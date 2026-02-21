use crate::models::*;

// ─── Bridge ───────────────────────────────────────────────────────────────────

/// Generate the .netdev file for a bridge
pub fn bridge_netdev(cfg: &BridgeConfig) -> String {
    let mut out = String::new();
    out.push_str("[NetDev]\n");
    out.push_str(&format!("Name={}\n", cfg.name));
    out.push_str("Kind=bridge\n");
    if let Some(mtu) = cfg.mtu {
        out.push_str(&format!("MTUBytes={}\n", mtu));
    }
    if let Some(ref mac) = cfg.mac_address {
        out.push_str(&format!("MACAddress={}\n", mac));
    }

    // [Bridge] section
    let has_bridge_opts = cfg.stp.is_some()
        || cfg.forward_delay_sec.is_some()
        || cfg.hello_time_sec.is_some()
        || cfg.max_age_sec.is_some()
        || cfg.vlan_filtering.is_some();

    if has_bridge_opts {
        out.push_str("\n[Bridge]\n");
        if let Some(stp) = cfg.stp {
            out.push_str(&format!("STP={}\n", if stp { "yes" } else { "no" }));
        }
        if let Some(fd) = cfg.forward_delay_sec {
            out.push_str(&format!("ForwardDelaySec={}\n", fd));
        }
        if let Some(ht) = cfg.hello_time_sec {
            out.push_str(&format!("HelloTimeSec={}\n", ht));
        }
        if let Some(ma) = cfg.max_age_sec {
            out.push_str(&format!("MaxAgeSec={}\n", ma));
        }
        if let Some(vf) = cfg.vlan_filtering {
            out.push_str(&format!("VLANFiltering={}\n", if vf { "yes" } else { "no" }));
        }
    }

    out
}

/// Generate the .network file for a bridge
pub fn bridge_network(cfg: &BridgeConfig) -> String {
    let mut out = String::new();
    out.push_str("[Match]\n");
    out.push_str(&format!("Name={}\n", cfg.name));

    out.push_str("\n[Network]\n");
    for addr in &cfg.addresses {
        out.push_str(&format!("Address={}\n", addr));
    }
    if let Some(ref gw) = cfg.gateway {
        out.push_str(&format!("Gateway={}\n", gw));
    }
    for d in &cfg.dns {
        out.push_str(&format!("DNS={}\n", d));
    }
    if cfg.dhcp != DhcpMode::No {
        out.push_str(&format!("DHCP={}\n", cfg.dhcp.as_str()));
    }

    out
}

// ─── VLAN ─────────────────────────────────────────────────────────────────────

/// Generate the .netdev file for a VLAN
pub fn vlan_netdev(cfg: &VlanConfig) -> String {
    let mut out = String::new();
    out.push_str("[NetDev]\n");
    out.push_str(&format!("Name={}\n", cfg.name));
    out.push_str("Kind=vlan\n");
    if let Some(mtu) = cfg.mtu {
        out.push_str(&format!("MTUBytes={}\n", mtu));
    }

    out.push_str("\n[VLAN]\n");
    out.push_str(&format!("Id={}\n", cfg.vlan_id));

    out
}

/// Generate the .network file for the VLAN's parent interface to attach the VLAN
pub fn vlan_parent_network(cfg: &VlanConfig, _prefix: &str) -> String {
    let mut out = String::new();
    out.push_str("[Match]\n");
    out.push_str(&format!("Name={}\n", cfg.parent_interface));

    out.push_str("\n[Network]\n");
    out.push_str(&format!("VLAN={}\n", cfg.name));

    out
}

/// Generate the .network file for the VLAN interface itself
pub fn vlan_network(cfg: &VlanConfig) -> String {
    let mut out = String::new();
    out.push_str("[Match]\n");
    out.push_str(&format!("Name={}\n", cfg.name));

    out.push_str("\n[Network]\n");
    for addr in &cfg.addresses {
        out.push_str(&format!("Address={}\n", addr));
    }
    if let Some(ref gw) = cfg.gateway {
        out.push_str(&format!("Gateway={}\n", gw));
    }
    for d in &cfg.dns {
        out.push_str(&format!("DNS={}\n", d));
    }
    if cfg.dhcp != DhcpMode::No {
        out.push_str(&format!("DHCP={}\n", cfg.dhcp.as_str()));
    }

    out
}

// ─── Macvtap ──────────────────────────────────────────────────────────────────

/// Generate the .netdev file for a macvtap device
pub fn macvtap_netdev(cfg: &MacvtapConfig) -> String {
    let mut out = String::new();
    out.push_str("[NetDev]\n");
    out.push_str(&format!("Name={}\n", cfg.name));
    out.push_str("Kind=macvtap\n");
    if let Some(mtu) = cfg.mtu {
        out.push_str(&format!("MTUBytes={}\n", mtu));
    }
    if let Some(ref mac) = cfg.mac_address {
        out.push_str(&format!("MACAddress={}\n", mac));
    }

    out.push_str("\n[MACVTAP]\n");
    out.push_str(&format!("Mode={}\n", cfg.mode.as_str()));

    out
}

/// Generate the .network file for the macvtap's parent interface
pub fn macvtap_parent_network(cfg: &MacvtapConfig) -> String {
    let mut out = String::new();
    out.push_str("[Match]\n");
    out.push_str(&format!("Name={}\n", cfg.parent_interface));

    out.push_str("\n[Network]\n");
    out.push_str(&format!("MACVTAP={}\n", cfg.name));

    out
}

/// Generate the .network file for the macvtap interface itself (minimal)
pub fn macvtap_network(cfg: &MacvtapConfig) -> String {
    let mut out = String::new();
    out.push_str("[Match]\n");
    out.push_str(&format!("Name={}\n", cfg.name));

    out.push_str("\n[Network]\n");

    out
}

// ─── Tap ──────────────────────────────────────────────────────────────────────

/// Generate the .netdev file for a tap device
pub fn tap_netdev(cfg: &TapConfig) -> String {
    let mut out = String::new();
    out.push_str("[NetDev]\n");
    out.push_str(&format!("Name={}\n", cfg.name));
    out.push_str("Kind=tap\n");
    if let Some(mtu) = cfg.mtu {
        out.push_str(&format!("MTUBytes={}\n", mtu));
    }
    if let Some(ref mac) = cfg.mac_address {
        out.push_str(&format!("MACAddress={}\n", mac));
    }

    out.push_str("\n[Tap]\n");
    if let Some(ref user) = cfg.user {
        out.push_str(&format!("User={}\n", user));
    }
    if let Some(ref group) = cfg.group {
        out.push_str(&format!("Group={}\n", group));
    }
    if let Some(mq) = cfg.multi_queue {
        out.push_str(&format!("MultiQueue={}\n", if mq { "yes" } else { "no" }));
    }
    if let Some(vnet) = cfg.vnet_hdr {
        out.push_str(&format!("VNetHeader={}\n", if vnet { "yes" } else { "no" }));
    }

    out
}

/// Generate the .network file for a tap device
pub fn tap_network(cfg: &TapConfig) -> String {
    let mut out = String::new();
    out.push_str("[Match]\n");
    out.push_str(&format!("Name={}\n", cfg.name));

    out.push_str("\n[Network]\n");
    if let Some(ref bridge) = cfg.bridge {
        out.push_str(&format!("Bridge={}\n", bridge));
    }

    out
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_bridge() -> BridgeConfig {
        BridgeConfig {
            id: "test-id".into(),
            name: "br0".into(),
            stp: Some(true),
            forward_delay_sec: Some(15),
            hello_time_sec: None,
            max_age_sec: None,
            vlan_filtering: Some(true),
            mtu: Some(1500),
            mac_address: Some("52:54:00:aa:bb:cc".into()),
            addresses: vec!["10.0.0.1/24".into()],
            gateway: Some("10.0.0.254".into()),
            dns: vec!["8.8.8.8".into()],
            dhcp: DhcpMode::No,
            created: String::new(),
            updated: String::new(),
        }
    }

    #[test]
    fn test_bridge_netdev() {
        let cfg = make_bridge();
        let out = bridge_netdev(&cfg);
        assert!(out.contains("[NetDev]\n"));
        assert!(out.contains("Name=br0\n"));
        assert!(out.contains("Kind=bridge\n"));
        assert!(out.contains("MTUBytes=1500\n"));
        assert!(out.contains("MACAddress=52:54:00:aa:bb:cc\n"));
        assert!(out.contains("[Bridge]\n"));
        assert!(out.contains("STP=yes\n"));
        assert!(out.contains("ForwardDelaySec=15\n"));
        assert!(out.contains("VLANFiltering=yes\n"));
    }

    #[test]
    fn test_bridge_netdev_minimal() {
        let cfg = BridgeConfig {
            id: "id".into(),
            name: "br-min".into(),
            stp: None,
            forward_delay_sec: None,
            hello_time_sec: None,
            max_age_sec: None,
            vlan_filtering: None,
            mtu: None,
            mac_address: None,
            addresses: vec![],
            gateway: None,
            dns: vec![],
            dhcp: DhcpMode::No,
            created: String::new(),
            updated: String::new(),
        };
        let out = bridge_netdev(&cfg);
        assert!(out.contains("Name=br-min\n"));
        assert!(out.contains("Kind=bridge\n"));
        assert!(!out.contains("[Bridge]"));
        assert!(!out.contains("MTUBytes"));
    }

    #[test]
    fn test_bridge_network() {
        let cfg = make_bridge();
        let out = bridge_network(&cfg);
        assert!(out.contains("[Match]\n"));
        assert!(out.contains("Name=br0\n"));
        assert!(out.contains("[Network]\n"));
        assert!(out.contains("Address=10.0.0.1/24\n"));
        assert!(out.contains("Gateway=10.0.0.254\n"));
        assert!(out.contains("DNS=8.8.8.8\n"));
        assert!(!out.contains("DHCP="));
    }

    #[test]
    fn test_bridge_network_dhcp() {
        let mut cfg = make_bridge();
        cfg.dhcp = DhcpMode::Yes;
        let out = bridge_network(&cfg);
        assert!(out.contains("DHCP=yes\n"));
    }

    #[test]
    fn test_vlan_netdev() {
        let cfg = VlanConfig {
            id: "id".into(),
            name: "vlan100".into(),
            vlan_id: 100,
            parent_interface: "eth0".into(),
            mtu: Some(1400),
            addresses: vec![],
            gateway: None,
            dns: vec![],
            dhcp: DhcpMode::No,
            created: String::new(),
            updated: String::new(),
        };
        let out = vlan_netdev(&cfg);
        assert!(out.contains("Name=vlan100\n"));
        assert!(out.contains("Kind=vlan\n"));
        assert!(out.contains("MTUBytes=1400\n"));
        assert!(out.contains("[VLAN]\n"));
        assert!(out.contains("Id=100\n"));
    }

    #[test]
    fn test_vlan_parent_network() {
        let cfg = VlanConfig {
            id: "id".into(),
            name: "vlan100".into(),
            vlan_id: 100,
            parent_interface: "eth0".into(),
            mtu: None,
            addresses: vec![],
            gateway: None,
            dns: vec![],
            dhcp: DhcpMode::No,
            created: String::new(),
            updated: String::new(),
        };
        let out = vlan_parent_network(&cfg, "50-vmspawnd-");
        assert!(out.contains("Name=eth0\n"));
        assert!(out.contains("VLAN=vlan100\n"));
    }

    #[test]
    fn test_vlan_network_with_addresses() {
        let cfg = VlanConfig {
            id: "id".into(),
            name: "vlan200".into(),
            vlan_id: 200,
            parent_interface: "eth0".into(),
            mtu: None,
            addresses: vec!["192.168.200.1/24".into()],
            gateway: Some("192.168.200.254".into()),
            dns: vec!["1.1.1.1".into(), "8.8.8.8".into()],
            dhcp: DhcpMode::Ipv4,
            created: String::new(),
            updated: String::new(),
        };
        let out = vlan_network(&cfg);
        assert!(out.contains("Name=vlan200\n"));
        assert!(out.contains("Address=192.168.200.1/24\n"));
        assert!(out.contains("Gateway=192.168.200.254\n"));
        assert!(out.contains("DNS=1.1.1.1\n"));
        assert!(out.contains("DNS=8.8.8.8\n"));
        assert!(out.contains("DHCP=ipv4\n"));
    }

    #[test]
    fn test_macvtap_netdev() {
        let cfg = MacvtapConfig {
            id: "id".into(),
            name: "mvt0".into(),
            parent_interface: "eth0".into(),
            mode: MacvtapMode::Bridge,
            mtu: Some(1500),
            mac_address: Some("52:54:00:11:22:33".into()),
            created: String::new(),
            updated: String::new(),
        };
        let out = macvtap_netdev(&cfg);
        assert!(out.contains("Name=mvt0\n"));
        assert!(out.contains("Kind=macvtap\n"));
        assert!(out.contains("MTUBytes=1500\n"));
        assert!(out.contains("MACAddress=52:54:00:11:22:33\n"));
        assert!(out.contains("[MACVTAP]\n"));
        assert!(out.contains("Mode=bridge\n"));
    }

    #[test]
    fn test_macvtap_passthru() {
        let cfg = MacvtapConfig {
            id: "id".into(),
            name: "mvt1".into(),
            parent_interface: "eno1".into(),
            mode: MacvtapMode::Passthru,
            mtu: None,
            mac_address: None,
            created: String::new(),
            updated: String::new(),
        };
        let out = macvtap_netdev(&cfg);
        assert!(out.contains("Mode=passthru\n"));
        assert!(!out.contains("MTUBytes"));
        assert!(!out.contains("MACAddress"));
    }

    #[test]
    fn test_macvtap_parent_network() {
        let cfg = MacvtapConfig {
            id: "id".into(),
            name: "mvt0".into(),
            parent_interface: "eth0".into(),
            mode: MacvtapMode::Bridge,
            mtu: None,
            mac_address: None,
            created: String::new(),
            updated: String::new(),
        };
        let out = macvtap_parent_network(&cfg);
        assert!(out.contains("Name=eth0\n"));
        assert!(out.contains("MACVTAP=mvt0\n"));
    }

    #[test]
    fn test_tap_netdev() {
        let cfg = TapConfig {
            id: "id".into(),
            name: "tap0".into(),
            user: Some("qemu".into()),
            group: Some("kvm".into()),
            multi_queue: Some(true),
            vnet_hdr: Some(true),
            bridge: None,
            mtu: Some(1500),
            mac_address: None,
            created: String::new(),
            updated: String::new(),
        };
        let out = tap_netdev(&cfg);
        assert!(out.contains("Name=tap0\n"));
        assert!(out.contains("Kind=tap\n"));
        assert!(out.contains("MTUBytes=1500\n"));
        assert!(out.contains("[Tap]\n"));
        assert!(out.contains("User=qemu\n"));
        assert!(out.contains("Group=kvm\n"));
        assert!(out.contains("MultiQueue=yes\n"));
        assert!(out.contains("VNetHeader=yes\n"));
    }

    #[test]
    fn test_tap_netdev_minimal() {
        let cfg = TapConfig {
            id: "id".into(),
            name: "tap-min".into(),
            user: None,
            group: None,
            multi_queue: None,
            vnet_hdr: None,
            bridge: None,
            mtu: None,
            mac_address: None,
            created: String::new(),
            updated: String::new(),
        };
        let out = tap_netdev(&cfg);
        assert!(out.contains("Name=tap-min\n"));
        assert!(out.contains("Kind=tap\n"));
        assert!(out.contains("[Tap]\n"));
        assert!(!out.contains("User="));
        assert!(!out.contains("MultiQueue"));
    }

    #[test]
    fn test_tap_network_with_bridge() {
        let cfg = TapConfig {
            id: "id".into(),
            name: "tap0".into(),
            user: None,
            group: None,
            multi_queue: None,
            vnet_hdr: None,
            bridge: Some("br0".into()),
            mtu: None,
            mac_address: None,
            created: String::new(),
            updated: String::new(),
        };
        let out = tap_network(&cfg);
        assert!(out.contains("Name=tap0\n"));
        assert!(out.contains("Bridge=br0\n"));
    }

    #[test]
    fn test_tap_network_no_bridge() {
        let cfg = TapConfig {
            id: "id".into(),
            name: "tap1".into(),
            user: None,
            group: None,
            multi_queue: None,
            vnet_hdr: None,
            bridge: None,
            mtu: None,
            mac_address: None,
            created: String::new(),
            updated: String::new(),
        };
        let out = tap_network(&cfg);
        assert!(out.contains("Name=tap1\n"));
        assert!(!out.contains("Bridge="));
    }
}
