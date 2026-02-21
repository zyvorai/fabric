use serde::{Deserialize, Serialize};

/// Types of network devices managed by systemd-networkd
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NetDevKind {
    Bridge,
    Vlan,
    Macvtap,
    Tap,
}

impl NetDevKind {
    pub fn as_str(&self) -> &str {
        match self {
            NetDevKind::Bridge => "bridge",
            NetDevKind::Vlan => "vlan",
            NetDevKind::Macvtap => "macvtap",
            NetDevKind::Tap => "tap",
        }
    }
}

impl std::fmt::Display for NetDevKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Macvtap / macvlan mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MacvtapMode {
    Private,
    Vepa,
    Bridge,
    Passthru,
    Source,
}

impl MacvtapMode {
    pub fn as_str(&self) -> &str {
        match self {
            MacvtapMode::Private => "private",
            MacvtapMode::Vepa => "vepa",
            MacvtapMode::Bridge => "bridge",
            MacvtapMode::Passthru => "passthru",
            MacvtapMode::Source => "source",
        }
    }
}

/// DHCP configuration mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DhcpMode {
    Yes,
    No,
    Ipv4,
    Ipv6,
}

impl DhcpMode {
    pub fn as_str(&self) -> &str {
        match self {
            DhcpMode::Yes => "yes",
            DhcpMode::No => "no",
            DhcpMode::Ipv4 => "ipv4",
            DhcpMode::Ipv6 => "ipv6",
        }
    }
}

impl Default for DhcpMode {
    fn default() -> Self {
        DhcpMode::No
    }
}

// ─── Bridge ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeConfig {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub stp: Option<bool>,
    #[serde(default)]
    pub forward_delay_sec: Option<u32>,
    #[serde(default)]
    pub hello_time_sec: Option<u32>,
    #[serde(default)]
    pub max_age_sec: Option<u32>,
    #[serde(default)]
    pub vlan_filtering: Option<bool>,
    #[serde(default)]
    pub mtu: Option<u16>,
    #[serde(default)]
    pub mac_address: Option<String>,
    #[serde(default)]
    pub addresses: Vec<String>,
    #[serde(default)]
    pub gateway: Option<String>,
    #[serde(default)]
    pub dns: Vec<String>,
    #[serde(default)]
    pub dhcp: DhcpMode,
    #[serde(default)]
    pub created: String,
    #[serde(default)]
    pub updated: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBridgeRequest {
    pub name: String,
    #[serde(default)]
    pub stp: Option<bool>,
    #[serde(default)]
    pub forward_delay_sec: Option<u32>,
    #[serde(default)]
    pub hello_time_sec: Option<u32>,
    #[serde(default)]
    pub max_age_sec: Option<u32>,
    #[serde(default)]
    pub vlan_filtering: Option<bool>,
    #[serde(default)]
    pub mtu: Option<u16>,
    #[serde(default)]
    pub mac_address: Option<String>,
    #[serde(default)]
    pub addresses: Vec<String>,
    #[serde(default)]
    pub gateway: Option<String>,
    #[serde(default)]
    pub dns: Vec<String>,
    #[serde(default)]
    pub dhcp: DhcpMode,
}

// ─── VLAN ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlanConfig {
    pub id: String,
    pub name: String,
    pub vlan_id: u16,
    pub parent_interface: String,
    #[serde(default)]
    pub mtu: Option<u16>,
    #[serde(default)]
    pub addresses: Vec<String>,
    #[serde(default)]
    pub gateway: Option<String>,
    #[serde(default)]
    pub dns: Vec<String>,
    #[serde(default)]
    pub dhcp: DhcpMode,
    #[serde(default)]
    pub created: String,
    #[serde(default)]
    pub updated: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateVlanRequest {
    pub name: String,
    pub vlan_id: u16,
    pub parent_interface: String,
    #[serde(default)]
    pub mtu: Option<u16>,
    #[serde(default)]
    pub addresses: Vec<String>,
    #[serde(default)]
    pub gateway: Option<String>,
    #[serde(default)]
    pub dns: Vec<String>,
    #[serde(default)]
    pub dhcp: DhcpMode,
}

// ─── Macvtap ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacvtapConfig {
    pub id: String,
    pub name: String,
    pub parent_interface: String,
    #[serde(default = "default_macvtap_mode")]
    pub mode: MacvtapMode,
    #[serde(default)]
    pub mtu: Option<u16>,
    #[serde(default)]
    pub mac_address: Option<String>,
    #[serde(default)]
    pub created: String,
    #[serde(default)]
    pub updated: String,
}

fn default_macvtap_mode() -> MacvtapMode {
    MacvtapMode::Bridge
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMacvtapRequest {
    pub name: String,
    pub parent_interface: String,
    #[serde(default = "default_macvtap_mode")]
    pub mode: MacvtapMode,
    #[serde(default)]
    pub mtu: Option<u16>,
    #[serde(default)]
    pub mac_address: Option<String>,
}

// ─── Tap ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TapConfig {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub user: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub multi_queue: Option<bool>,
    #[serde(default)]
    pub vnet_hdr: Option<bool>,
    /// Bridge to attach this tap to
    #[serde(default)]
    pub bridge: Option<String>,
    #[serde(default)]
    pub mtu: Option<u16>,
    #[serde(default)]
    pub mac_address: Option<String>,
    #[serde(default)]
    pub created: String,
    #[serde(default)]
    pub updated: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTapRequest {
    pub name: String,
    #[serde(default)]
    pub user: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub multi_queue: Option<bool>,
    #[serde(default)]
    pub vnet_hdr: Option<bool>,
    #[serde(default)]
    pub bridge: Option<String>,
    #[serde(default)]
    pub mtu: Option<u16>,
    #[serde(default)]
    pub mac_address: Option<String>,
}

// ─── Device status from networkctl ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceStatus {
    pub name: String,
    pub kind: String,
    pub state: String,
    pub address: Option<String>,
    pub driver: Option<String>,
    pub mtu: Option<u32>,
    pub mac_address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkInfo {
    pub index: u32,
    pub name: String,
    pub kind: String,
    pub operational_state: String,
    pub setup_state: String,
}

/// Wrapper enum for all managed device types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "device_type", rename_all = "lowercase")]
pub enum NetworkDevice {
    Bridge(BridgeConfig),
    Vlan(VlanConfig),
    Macvtap(MacvtapConfig),
    Tap(TapConfig),
}
