use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Distributed Virtual Switch (DVS) models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SwitchStatus {
    Active,
    Partial,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamingAlgorithm {
    Failover,
    LoadBased,
    SrcPortHash,
    SrcMacHash,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Uplink {
    pub id: String,
    pub name: String,
    pub speed_mbps: u32,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityPolicy {
    pub promiscuous_mode: bool,
    pub mac_changes: bool,
    pub forged_transmits: bool,
}

impl Default for SecurityPolicy {
    fn default() -> Self {
        Self {
            promiscuous_mode: false,
            mac_changes: false,
            forged_transmits: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrafficShaping {
    pub enabled: bool,
    pub avg_bandwidth_kbps: u64,
    pub peak_bandwidth_kbps: u64,
    pub burst_size_kb: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamingPolicy {
    pub algorithm: TeamingAlgorithm,
    pub active_uplinks: Vec<String>,
    pub standby_uplinks: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DistributedSwitch {
    pub id: String,
    pub name: String,
    pub cluster_id: String,
    pub mtu: u16,
    pub uplinks: Vec<Uplink>,
    pub port_groups: Vec<String>,
    pub nioc_enabled: bool,
    pub status: SwitchStatus,
    pub hosts: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortGroup {
    pub id: String,
    pub name: String,
    pub switch_id: String,
    pub vlan_id: Option<u16>,
    pub vlan_trunk: Option<Vec<u16>>,
    pub security_policy: SecurityPolicy,
    pub traffic_shaping: Option<TrafficShaping>,
    pub teaming_policy: TeamingPolicy,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Micro-Segmentation (Distributed Firewall) models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FirewallAction {
    Allow,
    Deny,
    Reject,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Direction {
    Inbound,
    Outbound,
    Both,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Protocol {
    Tcp,
    Udp,
    Icmp,
    Any,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TargetType {
    SecurityGroup,
    IpAddress,
    IpRange,
    Any,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemberType {
    VmName,
    Tag,
    IpAddress,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleTarget {
    pub target_type: TargetType,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirewallRule {
    pub id: String,
    pub name: String,
    pub section_id: String,
    pub priority: u32,
    pub action: FirewallAction,
    pub direction: Direction,
    pub protocol: Option<Protocol>,
    pub source: RuleTarget,
    pub destination: RuleTarget,
    pub port_range: Option<String>,
    pub enabled: bool,
    pub logged: bool,
    pub hit_count: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupMember {
    pub member_type: MemberType,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityGroup {
    pub id: String,
    pub name: String,
    pub description: String,
    pub members: Vec<GroupMember>,
    pub rules: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirewallSection {
    pub id: String,
    pub name: String,
    pub priority: u32,
    pub rules: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Overlay Network models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OverlayType {
    Vxlan,
    Geneve,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TepStatus {
    Up,
    Down,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelEndpoint {
    pub host_id: String,
    pub vtep_ip: String,
    pub status: TepStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayNetwork {
    pub id: String,
    pub name: String,
    pub vni: u32,
    pub network_type: OverlayType,
    pub subnet: String,
    pub gateway: Option<String>,
    pub tunnel_endpoints: Vec<TunnelEndpoint>,
    pub arp_suppression: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Network Load Balancer models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LbAlgorithm {
    RoundRobin,
    LeastConnections,
    IpHash,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LbStatus {
    Active,
    Inactive,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemberStatus {
    Up,
    Down,
    Drain,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthCheckType {
    Tcp,
    Http,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LbMember {
    pub id: String,
    pub address: String,
    pub port: u16,
    pub weight: u32,
    pub status: MemberStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheck {
    pub check_type: HealthCheckType,
    pub interval_secs: u32,
    pub timeout_secs: u32,
    pub unhealthy_threshold: u32,
    pub http_path: Option<String>,
}

impl Default for HealthCheck {
    fn default() -> Self {
        Self {
            check_type: HealthCheckType::Tcp,
            interval_secs: 10,
            timeout_secs: 5,
            unhealthy_threshold: 3,
            http_path: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadBalancer {
    pub id: String,
    pub name: String,
    pub vip: String,
    pub port: u16,
    pub algorithm: LbAlgorithm,
    pub members: Vec<LbMember>,
    pub health_check: HealthCheck,
    pub status: LbStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// SR-IOV models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SriovAssignment {
    pub vf_index: u32,
    pub vm_name: String,
    pub mac_address: Option<String>,
    pub vlan_id: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SriovNic {
    pub host_id: String,
    pub pci_address: String,
    pub device_name: String,
    pub total_vfs: u32,
    pub available_vfs: u32,
    pub driver: String,
    pub assigned_vms: Vec<SriovAssignment>,
}

// ---------------------------------------------------------------------------
// Network I/O Control models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrafficType {
    VirtualMachine,
    Management,
    VMotion,
    Storage,
    FaultTolerance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NiocPolicy {
    pub traffic_type: TrafficType,
    pub shares: u32,
    pub reservation_mbps: Option<u32>,
    pub limit_mbps: Option<u32>,
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSwitchRequest {
    pub name: String,
    pub cluster_id: String,
    pub mtu: Option<u16>,
    pub uplinks: Vec<Uplink>,
    pub nioc_enabled: Option<bool>,
    pub hosts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePortGroupRequest {
    pub name: String,
    pub switch_id: String,
    pub vlan_id: Option<u16>,
    pub vlan_trunk: Option<Vec<u16>>,
    pub security_policy: Option<SecurityPolicy>,
    pub traffic_shaping: Option<TrafficShaping>,
    pub teaming_policy: TeamingPolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatePortGroupRequest {
    pub name: Option<String>,
    pub vlan_id: Option<u16>,
    pub vlan_trunk: Option<Vec<u16>>,
    pub security_policy: Option<SecurityPolicy>,
    pub traffic_shaping: Option<TrafficShaping>,
    pub teaming_policy: Option<TeamingPolicy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSectionRequest {
    pub name: String,
    pub priority: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRuleRequest {
    pub name: String,
    pub section_id: String,
    pub priority: u32,
    pub action: FirewallAction,
    pub direction: Direction,
    pub protocol: Option<Protocol>,
    pub source: RuleTarget,
    pub destination: RuleTarget,
    pub port_range: Option<String>,
    pub enabled: Option<bool>,
    pub logged: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRuleRequest {
    pub name: Option<String>,
    pub priority: Option<u32>,
    pub action: Option<FirewallAction>,
    pub direction: Option<Direction>,
    pub protocol: Option<Protocol>,
    pub source: Option<RuleTarget>,
    pub destination: Option<RuleTarget>,
    pub port_range: Option<String>,
    pub enabled: Option<bool>,
    pub logged: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSecurityGroupRequest {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateOverlayRequest {
    pub name: String,
    pub vni: u32,
    pub network_type: OverlayType,
    pub subnet: String,
    pub gateway: Option<String>,
    pub arp_suppression: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateLoadBalancerRequest {
    pub name: String,
    pub vip: String,
    pub port: u16,
    pub algorithm: LbAlgorithm,
    pub health_check: Option<HealthCheck>,
}

// ---------------------------------------------------------------------------
// NetworkManager – central coordinator
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct NetworkManager {
    switches: Arc<RwLock<HashMap<String, DistributedSwitch>>>,
    port_groups: Arc<RwLock<HashMap<String, PortGroup>>>,
    sections: Arc<RwLock<HashMap<String, FirewallSection>>>,
    rules: Arc<RwLock<HashMap<String, FirewallRule>>>,
    security_groups: Arc<RwLock<HashMap<String, SecurityGroup>>>,
    overlays: Arc<RwLock<HashMap<String, OverlayNetwork>>>,
    load_balancers: Arc<RwLock<HashMap<String, LoadBalancer>>>,
    sriov_nics: Arc<RwLock<HashMap<String, SriovNic>>>,
    /// Round-robin counters keyed by load-balancer id.
    rr_counters: Arc<RwLock<HashMap<String, usize>>>,
}

impl NetworkManager {
    pub fn new() -> Self {
        Self {
            switches: Arc::new(RwLock::new(HashMap::new())),
            port_groups: Arc::new(RwLock::new(HashMap::new())),
            sections: Arc::new(RwLock::new(HashMap::new())),
            rules: Arc::new(RwLock::new(HashMap::new())),
            security_groups: Arc::new(RwLock::new(HashMap::new())),
            overlays: Arc::new(RwLock::new(HashMap::new())),
            load_balancers: Arc::new(RwLock::new(HashMap::new())),
            sriov_nics: Arc::new(RwLock::new(HashMap::new())),
            rr_counters: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    // -----------------------------------------------------------------------
    // Distributed Virtual Switch
    // -----------------------------------------------------------------------

    pub fn create_switch(&self, req: CreateSwitchRequest) -> Result<DistributedSwitch> {
        let now = Utc::now();
        let switch = DistributedSwitch {
            id: Uuid::new_v4().to_string(),
            name: req.name,
            cluster_id: req.cluster_id,
            mtu: req.mtu.unwrap_or(1500),
            uplinks: req.uplinks,
            port_groups: Vec::new(),
            nioc_enabled: req.nioc_enabled.unwrap_or(false),
            status: SwitchStatus::Active,
            hosts: req.hosts,
            created_at: now,
            updated_at: now,
        };
        tracing::info!(switch_id = %switch.id, name = %switch.name, "created distributed switch");
        let mut map = self.switches.write().map_err(|e| anyhow!("lock error: {e}"))?;
        map.insert(switch.id.clone(), switch.clone());
        Ok(switch)
    }

    pub fn get_switch(&self, id: &str) -> Option<DistributedSwitch> {
        let map = self.switches.read().ok()?;
        map.get(id).cloned()
    }

    pub fn list_switches(&self, cluster_id: Option<&str>) -> Vec<DistributedSwitch> {
        let map = self.switches.read().unwrap_or_else(|e| e.into_inner());
        map.values()
            .filter(|s| cluster_id.map_or(true, |cid| s.cluster_id == cid))
            .cloned()
            .collect()
    }

    pub fn delete_switch(&self, id: &str) -> Result<()> {
        let mut map = self.switches.write().map_err(|e| anyhow!("lock error: {e}"))?;
        map.remove(id)
            .ok_or_else(|| anyhow!("switch {id} not found"))?;
        tracing::info!(switch_id = %id, "deleted distributed switch");
        Ok(())
    }

    pub fn create_port_group(&self, req: CreatePortGroupRequest) -> Result<PortGroup> {
        // Verify the parent switch exists.
        {
            let switches = self.switches.read().map_err(|e| anyhow!("lock error: {e}"))?;
            if !switches.contains_key(&req.switch_id) {
                return Err(anyhow!("switch {} not found", req.switch_id));
            }
        }

        let now = Utc::now();
        let pg = PortGroup {
            id: Uuid::new_v4().to_string(),
            name: req.name,
            switch_id: req.switch_id.clone(),
            vlan_id: req.vlan_id,
            vlan_trunk: req.vlan_trunk,
            security_policy: req.security_policy.unwrap_or_default(),
            traffic_shaping: req.traffic_shaping,
            teaming_policy: req.teaming_policy,
            created_at: now,
            updated_at: now,
        };

        // Add port group id to the parent switch.
        {
            let mut switches = self.switches.write().map_err(|e| anyhow!("lock error: {e}"))?;
            if let Some(sw) = switches.get_mut(&req.switch_id) {
                sw.port_groups.push(pg.id.clone());
                sw.updated_at = now;
            }
        }

        tracing::info!(port_group_id = %pg.id, name = %pg.name, "created port group");
        let mut map = self.port_groups.write().map_err(|e| anyhow!("lock error: {e}"))?;
        map.insert(pg.id.clone(), pg.clone());
        Ok(pg)
    }

    pub fn get_port_group(&self, id: &str) -> Option<PortGroup> {
        let map = self.port_groups.read().ok()?;
        map.get(id).cloned()
    }

    pub fn list_port_groups(&self, switch_id: Option<&str>) -> Vec<PortGroup> {
        let map = self.port_groups.read().unwrap_or_else(|e| e.into_inner());
        map.values()
            .filter(|pg| switch_id.map_or(true, |sid| pg.switch_id == sid))
            .cloned()
            .collect()
    }

    pub fn update_port_group(&self, id: &str, req: UpdatePortGroupRequest) -> Result<PortGroup> {
        let mut map = self.port_groups.write().map_err(|e| anyhow!("lock error: {e}"))?;
        let pg = map.get_mut(id).ok_or_else(|| anyhow!("port group {id} not found"))?;

        if let Some(name) = req.name {
            pg.name = name;
        }
        if let Some(vlan_id) = req.vlan_id {
            pg.vlan_id = Some(vlan_id);
        }
        if let Some(vlan_trunk) = req.vlan_trunk {
            pg.vlan_trunk = Some(vlan_trunk);
        }
        if let Some(security_policy) = req.security_policy {
            pg.security_policy = security_policy;
        }
        if let Some(traffic_shaping) = req.traffic_shaping {
            pg.traffic_shaping = Some(traffic_shaping);
        }
        if let Some(teaming_policy) = req.teaming_policy {
            pg.teaming_policy = teaming_policy;
        }
        pg.updated_at = Utc::now();

        tracing::info!(port_group_id = %id, "updated port group");
        Ok(pg.clone())
    }

    pub fn delete_port_group(&self, id: &str) -> Result<()> {
        let mut map = self.port_groups.write().map_err(|e| anyhow!("lock error: {e}"))?;
        let pg = map.remove(id).ok_or_else(|| anyhow!("port group {id} not found"))?;
        drop(map);

        // Remove from parent switch.
        let mut switches = self.switches.write().map_err(|e| anyhow!("lock error: {e}"))?;
        if let Some(sw) = switches.get_mut(&pg.switch_id) {
            sw.port_groups.retain(|pid| pid != id);
            sw.updated_at = Utc::now();
        }

        tracing::info!(port_group_id = %id, "deleted port group");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Firewall sections & rules
    // -----------------------------------------------------------------------

    pub fn create_section(&self, req: CreateSectionRequest) -> Result<FirewallSection> {
        let now = Utc::now();
        let section = FirewallSection {
            id: Uuid::new_v4().to_string(),
            name: req.name,
            priority: req.priority,
            rules: Vec::new(),
            created_at: now,
            updated_at: now,
        };
        tracing::info!(section_id = %section.id, name = %section.name, "created firewall section");
        let mut map = self.sections.write().map_err(|e| anyhow!("lock error: {e}"))?;
        map.insert(section.id.clone(), section.clone());
        Ok(section)
    }

    pub fn list_sections(&self) -> Vec<FirewallSection> {
        let map = self.sections.read().unwrap_or_else(|e| e.into_inner());
        let mut sections: Vec<_> = map.values().cloned().collect();
        sections.sort_by_key(|s| s.priority);
        sections
    }

    pub fn create_rule(&self, req: CreateRuleRequest) -> Result<FirewallRule> {
        // Verify section exists.
        {
            let sections = self.sections.read().map_err(|e| anyhow!("lock error: {e}"))?;
            if !sections.contains_key(&req.section_id) {
                return Err(anyhow!("section {} not found", req.section_id));
            }
        }

        let now = Utc::now();
        let rule = FirewallRule {
            id: Uuid::new_v4().to_string(),
            name: req.name,
            section_id: req.section_id.clone(),
            priority: req.priority,
            action: req.action,
            direction: req.direction,
            protocol: req.protocol,
            source: req.source,
            destination: req.destination,
            port_range: req.port_range,
            enabled: req.enabled.unwrap_or(true),
            logged: req.logged.unwrap_or(false),
            hit_count: 0,
            created_at: now,
            updated_at: now,
        };

        // Add rule id to the parent section.
        {
            let mut sections = self.sections.write().map_err(|e| anyhow!("lock error: {e}"))?;
            if let Some(sec) = sections.get_mut(&req.section_id) {
                sec.rules.push(rule.id.clone());
                sec.updated_at = now;
            }
        }

        tracing::info!(rule_id = %rule.id, name = %rule.name, "created firewall rule");
        let mut map = self.rules.write().map_err(|e| anyhow!("lock error: {e}"))?;
        map.insert(rule.id.clone(), rule.clone());
        Ok(rule)
    }

    pub fn get_rule(&self, id: &str) -> Option<FirewallRule> {
        let map = self.rules.read().ok()?;
        map.get(id).cloned()
    }

    pub fn list_rules(&self, section_id: Option<&str>) -> Vec<FirewallRule> {
        let map = self.rules.read().unwrap_or_else(|e| e.into_inner());
        let mut rules: Vec<_> = map
            .values()
            .filter(|r| section_id.map_or(true, |sid| r.section_id == sid))
            .cloned()
            .collect();
        rules.sort_by_key(|r| r.priority);
        rules
    }

    pub fn update_rule(&self, id: &str, req: UpdateRuleRequest) -> Result<FirewallRule> {
        let mut map = self.rules.write().map_err(|e| anyhow!("lock error: {e}"))?;
        let rule = map.get_mut(id).ok_or_else(|| anyhow!("rule {id} not found"))?;

        if let Some(name) = req.name {
            rule.name = name;
        }
        if let Some(priority) = req.priority {
            rule.priority = priority;
        }
        if let Some(action) = req.action {
            rule.action = action;
        }
        if let Some(direction) = req.direction {
            rule.direction = direction;
        }
        if req.protocol.is_some() {
            rule.protocol = req.protocol;
        }
        if let Some(source) = req.source {
            rule.source = source;
        }
        if let Some(destination) = req.destination {
            rule.destination = destination;
        }
        if req.port_range.is_some() {
            rule.port_range = req.port_range;
        }
        if let Some(enabled) = req.enabled {
            rule.enabled = enabled;
        }
        if let Some(logged) = req.logged {
            rule.logged = logged;
        }
        rule.updated_at = Utc::now();

        tracing::info!(rule_id = %id, "updated firewall rule");
        Ok(rule.clone())
    }

    pub fn delete_rule(&self, id: &str) -> Result<()> {
        let mut map = self.rules.write().map_err(|e| anyhow!("lock error: {e}"))?;
        let rule = map.remove(id).ok_or_else(|| anyhow!("rule {id} not found"))?;
        drop(map);

        // Remove from parent section.
        let mut sections = self.sections.write().map_err(|e| anyhow!("lock error: {e}"))?;
        if let Some(sec) = sections.get_mut(&rule.section_id) {
            sec.rules.retain(|rid| rid != id);
            sec.updated_at = Utc::now();
        }

        tracing::info!(rule_id = %id, "deleted firewall rule");
        Ok(())
    }

    pub fn increment_hit_count(&self, id: &str) -> Result<()> {
        let mut map = self.rules.write().map_err(|e| anyhow!("lock error: {e}"))?;
        let rule = map.get_mut(id).ok_or_else(|| anyhow!("rule {id} not found"))?;
        rule.hit_count += 1;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Security groups
    // -----------------------------------------------------------------------

    pub fn create_security_group(&self, req: CreateSecurityGroupRequest) -> Result<SecurityGroup> {
        let now = Utc::now();
        let sg = SecurityGroup {
            id: Uuid::new_v4().to_string(),
            name: req.name,
            description: req.description,
            members: Vec::new(),
            rules: Vec::new(),
            created_at: now,
            updated_at: now,
        };
        tracing::info!(group_id = %sg.id, name = %sg.name, "created security group");
        let mut map = self.security_groups.write().map_err(|e| anyhow!("lock error: {e}"))?;
        map.insert(sg.id.clone(), sg.clone());
        Ok(sg)
    }

    pub fn list_security_groups(&self) -> Vec<SecurityGroup> {
        let map = self.security_groups.read().unwrap_or_else(|e| e.into_inner());
        map.values().cloned().collect()
    }

    pub fn add_group_member(&self, group_id: &str, member: GroupMember) -> Result<()> {
        let mut map = self.security_groups.write().map_err(|e| anyhow!("lock error: {e}"))?;
        let sg = map
            .get_mut(group_id)
            .ok_or_else(|| anyhow!("security group {group_id} not found"))?;
        sg.members.push(member);
        sg.updated_at = Utc::now();
        tracing::info!(group_id = %group_id, "added member to security group");
        Ok(())
    }

    pub fn remove_group_member(&self, group_id: &str, member_value: &str) -> Result<()> {
        let mut map = self.security_groups.write().map_err(|e| anyhow!("lock error: {e}"))?;
        let sg = map
            .get_mut(group_id)
            .ok_or_else(|| anyhow!("security group {group_id} not found"))?;
        let before = sg.members.len();
        sg.members.retain(|m| m.value != member_value);
        if sg.members.len() == before {
            return Err(anyhow!("member with value '{member_value}' not found in group"));
        }
        sg.updated_at = Utc::now();
        tracing::info!(group_id = %group_id, member_value = %member_value, "removed member from security group");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Simplified packet evaluation against firewall rules
    // -----------------------------------------------------------------------

    /// Evaluate a packet against the distributed firewall rules. Rules are
    /// checked in priority order (lowest number = highest priority). The first
    /// matching enabled rule wins. If no rule matches the default action is
    /// `Allow`.
    pub fn evaluate_packet(
        &self,
        src_ip: &str,
        dst_ip: &str,
        protocol: Protocol,
        dst_port: u16,
    ) -> FirewallAction {
        let mut rules: Vec<FirewallRule> = {
            let rules_map = self.rules.read().unwrap_or_else(|e| e.into_inner());
            rules_map.values().filter(|r| r.enabled).cloned().collect()
        };
        rules.sort_by_key(|r| r.priority);

        for rule in &rules {
            // Check protocol.
            if let Some(ref rp) = rule.protocol {
                if *rp != Protocol::Any && *rp != protocol {
                    continue;
                }
            }

            // Check source.
            if !Self::target_matches(&rule.source, src_ip) {
                continue;
            }

            // Check destination.
            if !Self::target_matches(&rule.destination, dst_ip) {
                continue;
            }

            // Check port range (simple single-port or range "start-end").
            if let Some(ref range) = rule.port_range {
                if !Self::port_in_range(dst_port, range) {
                    continue;
                }
            }

            // Matched – increment hit count (best-effort).
            let _ = self.increment_hit_count(&rule.id);
            return rule.action.clone();
        }

        // Default: allow.
        FirewallAction::Allow
    }

    fn target_matches(target: &RuleTarget, ip: &str) -> bool {
        match target.target_type {
            TargetType::Any => true,
            TargetType::IpAddress => target.value == ip,
            TargetType::IpRange => {
                // Simplified: treat value as "start-end" inclusive text match.
                // A production implementation would perform numeric comparison.
                if let Some((start, end)) = target.value.split_once('-') {
                    ip >= start.trim() && ip <= end.trim()
                } else {
                    target.value == ip
                }
            }
            TargetType::SecurityGroup => {
                // Security group resolution would require cross-referencing the
                // group's members; not implemented in this simplified evaluator.
                false
            }
        }
    }

    fn port_in_range(port: u16, range: &str) -> bool {
        if let Some((start_s, end_s)) = range.split_once('-') {
            let start: u16 = start_s.trim().parse().unwrap_or(0);
            let end: u16 = end_s.trim().parse().unwrap_or(0);
            port >= start && port <= end
        } else {
            range.trim().parse::<u16>().map_or(false, |p| p == port)
        }
    }

    // -----------------------------------------------------------------------
    // Overlay networks
    // -----------------------------------------------------------------------

    pub fn create_overlay(&self, req: CreateOverlayRequest) -> Result<OverlayNetwork> {
        let now = Utc::now();
        let overlay = OverlayNetwork {
            id: Uuid::new_v4().to_string(),
            name: req.name,
            vni: req.vni,
            network_type: req.network_type,
            subnet: req.subnet,
            gateway: req.gateway,
            tunnel_endpoints: Vec::new(),
            arp_suppression: req.arp_suppression.unwrap_or(false),
            created_at: now,
            updated_at: now,
        };
        tracing::info!(overlay_id = %overlay.id, name = %overlay.name, vni = overlay.vni, "created overlay network");
        let mut map = self.overlays.write().map_err(|e| anyhow!("lock error: {e}"))?;
        map.insert(overlay.id.clone(), overlay.clone());
        Ok(overlay)
    }

    pub fn get_overlay(&self, id: &str) -> Option<OverlayNetwork> {
        let map = self.overlays.read().ok()?;
        map.get(id).cloned()
    }

    pub fn list_overlays(&self) -> Vec<OverlayNetwork> {
        let map = self.overlays.read().unwrap_or_else(|e| e.into_inner());
        map.values().cloned().collect()
    }

    pub fn delete_overlay(&self, id: &str) -> Result<()> {
        let mut map = self.overlays.write().map_err(|e| anyhow!("lock error: {e}"))?;
        map.remove(id)
            .ok_or_else(|| anyhow!("overlay {id} not found"))?;
        tracing::info!(overlay_id = %id, "deleted overlay network");
        Ok(())
    }

    pub fn add_tunnel_endpoint(&self, overlay_id: &str, tep: TunnelEndpoint) -> Result<()> {
        let mut map = self.overlays.write().map_err(|e| anyhow!("lock error: {e}"))?;
        let overlay = map
            .get_mut(overlay_id)
            .ok_or_else(|| anyhow!("overlay {overlay_id} not found"))?;
        overlay.tunnel_endpoints.push(tep);
        overlay.updated_at = Utc::now();
        tracing::info!(overlay_id = %overlay_id, "added tunnel endpoint");
        Ok(())
    }

    pub fn remove_tunnel_endpoint(&self, overlay_id: &str, host_id: &str) -> Result<()> {
        let mut map = self.overlays.write().map_err(|e| anyhow!("lock error: {e}"))?;
        let overlay = map
            .get_mut(overlay_id)
            .ok_or_else(|| anyhow!("overlay {overlay_id} not found"))?;
        let before = overlay.tunnel_endpoints.len();
        overlay.tunnel_endpoints.retain(|t| t.host_id != host_id);
        if overlay.tunnel_endpoints.len() == before {
            return Err(anyhow!("tunnel endpoint for host {host_id} not found"));
        }
        overlay.updated_at = Utc::now();
        tracing::info!(overlay_id = %overlay_id, host_id = %host_id, "removed tunnel endpoint");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Load balancer
    // -----------------------------------------------------------------------

    pub fn create_load_balancer(&self, req: CreateLoadBalancerRequest) -> Result<LoadBalancer> {
        let now = Utc::now();
        let lb = LoadBalancer {
            id: Uuid::new_v4().to_string(),
            name: req.name,
            vip: req.vip,
            port: req.port,
            algorithm: req.algorithm,
            members: Vec::new(),
            health_check: req.health_check.unwrap_or_default(),
            status: LbStatus::Active,
            created_at: now,
            updated_at: now,
        };
        tracing::info!(lb_id = %lb.id, name = %lb.name, "created load balancer");
        let mut map = self.load_balancers.write().map_err(|e| anyhow!("lock error: {e}"))?;
        map.insert(lb.id.clone(), lb.clone());
        Ok(lb)
    }

    pub fn get_load_balancer(&self, id: &str) -> Option<LoadBalancer> {
        let map = self.load_balancers.read().ok()?;
        map.get(id).cloned()
    }

    pub fn list_load_balancers(&self) -> Vec<LoadBalancer> {
        let map = self.load_balancers.read().unwrap_or_else(|e| e.into_inner());
        map.values().cloned().collect()
    }

    pub fn delete_load_balancer(&self, id: &str) -> Result<()> {
        let mut map = self.load_balancers.write().map_err(|e| anyhow!("lock error: {e}"))?;
        map.remove(id)
            .ok_or_else(|| anyhow!("load balancer {id} not found"))?;
        // Clean up round-robin counter.
        if let Ok(mut rr) = self.rr_counters.write() {
            rr.remove(id);
        }
        tracing::info!(lb_id = %id, "deleted load balancer");
        Ok(())
    }

    pub fn add_lb_member(&self, lb_id: &str, member: LbMember) -> Result<()> {
        let mut map = self.load_balancers.write().map_err(|e| anyhow!("lock error: {e}"))?;
        let lb = map
            .get_mut(lb_id)
            .ok_or_else(|| anyhow!("load balancer {lb_id} not found"))?;
        lb.members.push(member);
        lb.updated_at = Utc::now();
        tracing::info!(lb_id = %lb_id, "added member to load balancer");
        Ok(())
    }

    pub fn remove_lb_member(&self, lb_id: &str, member_id: &str) -> Result<()> {
        let mut map = self.load_balancers.write().map_err(|e| anyhow!("lock error: {e}"))?;
        let lb = map
            .get_mut(lb_id)
            .ok_or_else(|| anyhow!("load balancer {lb_id} not found"))?;
        let before = lb.members.len();
        lb.members.retain(|m| m.id != member_id);
        if lb.members.len() == before {
            return Err(anyhow!("member {member_id} not found in load balancer"));
        }
        lb.updated_at = Utc::now();
        tracing::info!(lb_id = %lb_id, member_id = %member_id, "removed member from load balancer");
        Ok(())
    }

    pub fn update_member_status(
        &self,
        lb_id: &str,
        member_id: &str,
        status: MemberStatus,
    ) -> Result<()> {
        let mut map = self.load_balancers.write().map_err(|e| anyhow!("lock error: {e}"))?;
        let lb = map
            .get_mut(lb_id)
            .ok_or_else(|| anyhow!("load balancer {lb_id} not found"))?;
        let member = lb
            .members
            .iter_mut()
            .find(|m| m.id == member_id)
            .ok_or_else(|| anyhow!("member {member_id} not found"))?;
        member.status = status;
        lb.updated_at = Utc::now();
        Ok(())
    }

    /// Select the next healthy member according to the load balancer's
    /// algorithm. Only members with status `Up` are considered.
    pub fn get_next_member(&self, lb_id: &str) -> Result<LbMember> {
        let map = self.load_balancers.read().map_err(|e| anyhow!("lock error: {e}"))?;
        let lb = map
            .get(lb_id)
            .ok_or_else(|| anyhow!("load balancer {lb_id} not found"))?;

        let healthy: Vec<&LbMember> = lb
            .members
            .iter()
            .filter(|m| m.status == MemberStatus::Up)
            .collect();

        if healthy.is_empty() {
            return Err(anyhow!("no healthy members in load balancer {lb_id}"));
        }

        match lb.algorithm {
            LbAlgorithm::RoundRobin => {
                let mut rr = self.rr_counters.write().map_err(|e| anyhow!("lock error: {e}"))?;
                let counter = rr.entry(lb_id.to_string()).or_insert(0);
                let idx = *counter % healthy.len();
                *counter = counter.wrapping_add(1);
                Ok(healthy[idx].clone())
            }
            LbAlgorithm::LeastConnections => {
                // Simplified: pick the member with the lowest weight (used as a
                // proxy for connection count in this in-memory model).
                let member = healthy
                    .iter()
                    .min_by_key(|m| m.weight)
                    .expect("healthy is non-empty");
                Ok((*member).clone())
            }
            LbAlgorithm::IpHash => {
                // Simplified: return the first healthy member. A production
                // implementation would hash the client IP.
                Ok(healthy[0].clone())
            }
        }
    }

    // -----------------------------------------------------------------------
    // SR-IOV
    // -----------------------------------------------------------------------

    /// Compose an internal key for SR-IOV NIC storage.
    fn sriov_key(host_id: &str, pci_address: &str) -> String {
        format!("{host_id}:{pci_address}")
    }

    pub fn register_sriov_nic(&self, nic: SriovNic) -> Result<()> {
        let key = Self::sriov_key(&nic.host_id, &nic.pci_address);
        let mut map = self.sriov_nics.write().map_err(|e| anyhow!("lock error: {e}"))?;
        tracing::info!(
            host_id = %nic.host_id,
            pci_address = %nic.pci_address,
            total_vfs = nic.total_vfs,
            "registered SR-IOV NIC"
        );
        map.insert(key, nic);
        Ok(())
    }

    pub fn list_sriov_nics(&self, host_id: Option<&str>) -> Vec<SriovNic> {
        let map = self.sriov_nics.read().unwrap_or_else(|e| e.into_inner());
        map.values()
            .filter(|n| host_id.map_or(true, |hid| n.host_id == hid))
            .cloned()
            .collect()
    }

    pub fn assign_vf(
        &self,
        host_id: &str,
        pci_address: &str,
        vm_name: &str,
    ) -> Result<SriovAssignment> {
        let key = Self::sriov_key(host_id, pci_address);
        let mut map = self.sriov_nics.write().map_err(|e| anyhow!("lock error: {e}"))?;
        let nic = map
            .get_mut(&key)
            .ok_or_else(|| anyhow!("SR-IOV NIC {pci_address} on host {host_id} not found"))?;

        if nic.available_vfs == 0 {
            return Err(anyhow!(
                "no available VFs on NIC {pci_address} (host {host_id})"
            ));
        }

        let vf_index = nic.total_vfs - nic.available_vfs;
        let assignment = SriovAssignment {
            vf_index,
            vm_name: vm_name.to_string(),
            mac_address: None,
            vlan_id: None,
        };

        nic.assigned_vms.push(assignment.clone());
        nic.available_vfs -= 1;

        tracing::info!(
            host_id = %host_id,
            pci_address = %pci_address,
            vf_index = vf_index,
            vm_name = %vm_name,
            "assigned SR-IOV VF"
        );
        Ok(assignment)
    }

    pub fn release_vf(
        &self,
        host_id: &str,
        pci_address: &str,
        vf_index: u32,
    ) -> Result<()> {
        let key = Self::sriov_key(host_id, pci_address);
        let mut map = self.sriov_nics.write().map_err(|e| anyhow!("lock error: {e}"))?;
        let nic = map
            .get_mut(&key)
            .ok_or_else(|| anyhow!("SR-IOV NIC {pci_address} on host {host_id} not found"))?;

        let before = nic.assigned_vms.len();
        nic.assigned_vms.retain(|a| a.vf_index != vf_index);
        if nic.assigned_vms.len() == before {
            return Err(anyhow!("VF index {vf_index} not assigned"));
        }

        nic.available_vfs += 1;

        tracing::info!(
            host_id = %host_id,
            pci_address = %pci_address,
            vf_index = vf_index,
            "released SR-IOV VF"
        );
        Ok(())
    }
}

impl Default for NetworkManager {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn manager() -> NetworkManager {
        NetworkManager::new()
    }

    // -- DVS ----------------------------------------------------------------

    #[test]
    fn test_create_and_get_switch() {
        let mgr = manager();
        let sw = mgr
            .create_switch(CreateSwitchRequest {
                name: "dvs-prod".into(),
                cluster_id: "cluster-1".into(),
                mtu: Some(9000),
                uplinks: vec![Uplink {
                    id: "up1".into(),
                    name: "uplink1".into(),
                    speed_mbps: 10_000,
                    active: true,
                }],
                nioc_enabled: Some(true),
                hosts: vec!["host-a".into()],
            })
            .unwrap();

        assert_eq!(sw.name, "dvs-prod");
        assert_eq!(sw.mtu, 9000);
        assert!(sw.nioc_enabled);
        assert_eq!(sw.status, SwitchStatus::Active);

        let fetched = mgr.get_switch(&sw.id).expect("switch should exist");
        assert_eq!(fetched.id, sw.id);
    }

    #[test]
    fn test_list_switches_by_cluster() {
        let mgr = manager();
        mgr.create_switch(CreateSwitchRequest {
            name: "dvs-a".into(),
            cluster_id: "c1".into(),
            mtu: None,
            uplinks: vec![],
            nioc_enabled: None,
            hosts: vec![],
        })
        .unwrap();
        mgr.create_switch(CreateSwitchRequest {
            name: "dvs-b".into(),
            cluster_id: "c2".into(),
            mtu: None,
            uplinks: vec![],
            nioc_enabled: None,
            hosts: vec![],
        })
        .unwrap();

        assert_eq!(mgr.list_switches(None).len(), 2);
        assert_eq!(mgr.list_switches(Some("c1")).len(), 1);
        assert_eq!(mgr.list_switches(Some("c1"))[0].name, "dvs-a");
    }

    // -- Port groups --------------------------------------------------------

    #[test]
    fn test_port_group_lifecycle() {
        let mgr = manager();
        let sw = mgr
            .create_switch(CreateSwitchRequest {
                name: "dvs".into(),
                cluster_id: "c1".into(),
                mtu: None,
                uplinks: vec![],
                nioc_enabled: None,
                hosts: vec![],
            })
            .unwrap();

        let pg = mgr
            .create_port_group(CreatePortGroupRequest {
                name: "pg-web".into(),
                switch_id: sw.id.clone(),
                vlan_id: Some(100),
                vlan_trunk: None,
                security_policy: None,
                traffic_shaping: None,
                teaming_policy: TeamingPolicy {
                    algorithm: TeamingAlgorithm::Failover,
                    active_uplinks: vec![],
                    standby_uplinks: vec![],
                },
            })
            .unwrap();

        assert_eq!(pg.vlan_id, Some(100));
        assert!(!pg.security_policy.promiscuous_mode);

        // Verify the switch now references the port group.
        let sw_updated = mgr.get_switch(&sw.id).unwrap();
        assert!(sw_updated.port_groups.contains(&pg.id));

        // Update port group.
        let updated = mgr
            .update_port_group(
                &pg.id,
                UpdatePortGroupRequest {
                    name: Some("pg-web-updated".into()),
                    vlan_id: Some(200),
                    vlan_trunk: None,
                    security_policy: None,
                    traffic_shaping: None,
                    teaming_policy: None,
                },
            )
            .unwrap();
        assert_eq!(updated.name, "pg-web-updated");
        assert_eq!(updated.vlan_id, Some(200));

        // Delete port group and verify removal from switch.
        mgr.delete_port_group(&pg.id).unwrap();
        assert!(mgr.get_port_group(&pg.id).is_none());
        let sw_after = mgr.get_switch(&sw.id).unwrap();
        assert!(!sw_after.port_groups.contains(&pg.id));
    }

    // -- Firewall rules -----------------------------------------------------

    #[test]
    fn test_firewall_rule_allow() {
        let mgr = manager();
        let section = mgr
            .create_section(CreateSectionRequest {
                name: "default".into(),
                priority: 100,
            })
            .unwrap();

        mgr.create_rule(CreateRuleRequest {
            name: "allow-web".into(),
            section_id: section.id.clone(),
            priority: 10,
            action: FirewallAction::Allow,
            direction: Direction::Inbound,
            protocol: Some(Protocol::Tcp),
            source: RuleTarget {
                target_type: TargetType::Any,
                value: String::new(),
            },
            destination: RuleTarget {
                target_type: TargetType::IpAddress,
                value: "10.0.0.5".into(),
            },
            port_range: Some("80".into()),
            enabled: None,
            logged: None,
        })
        .unwrap();

        let action = mgr.evaluate_packet("192.168.1.1", "10.0.0.5", Protocol::Tcp, 80);
        assert_eq!(action, FirewallAction::Allow);
    }

    #[test]
    fn test_firewall_rule_deny() {
        let mgr = manager();
        let section = mgr
            .create_section(CreateSectionRequest {
                name: "block".into(),
                priority: 50,
            })
            .unwrap();

        mgr.create_rule(CreateRuleRequest {
            name: "deny-ssh".into(),
            section_id: section.id.clone(),
            priority: 5,
            action: FirewallAction::Deny,
            direction: Direction::Inbound,
            protocol: Some(Protocol::Tcp),
            source: RuleTarget {
                target_type: TargetType::Any,
                value: String::new(),
            },
            destination: RuleTarget {
                target_type: TargetType::Any,
                value: String::new(),
            },
            port_range: Some("22".into()),
            enabled: None,
            logged: None,
        })
        .unwrap();

        let action = mgr.evaluate_packet("1.2.3.4", "10.0.0.1", Protocol::Tcp, 22);
        assert_eq!(action, FirewallAction::Deny);

        // Non-matching port falls through to default allow.
        let action2 = mgr.evaluate_packet("1.2.3.4", "10.0.0.1", Protocol::Tcp, 443);
        assert_eq!(action2, FirewallAction::Allow);
    }

    #[test]
    fn test_firewall_rule_priority_order() {
        let mgr = manager();
        let section = mgr
            .create_section(CreateSectionRequest {
                name: "ordered".into(),
                priority: 10,
            })
            .unwrap();

        // Higher priority (lower number) deny rule.
        mgr.create_rule(CreateRuleRequest {
            name: "deny-all".into(),
            section_id: section.id.clone(),
            priority: 1,
            action: FirewallAction::Deny,
            direction: Direction::Both,
            protocol: Some(Protocol::Any),
            source: RuleTarget {
                target_type: TargetType::Any,
                value: String::new(),
            },
            destination: RuleTarget {
                target_type: TargetType::Any,
                value: String::new(),
            },
            port_range: None,
            enabled: None,
            logged: None,
        })
        .unwrap();

        // Lower priority allow rule (should not be reached).
        mgr.create_rule(CreateRuleRequest {
            name: "allow-http".into(),
            section_id: section.id.clone(),
            priority: 100,
            action: FirewallAction::Allow,
            direction: Direction::Inbound,
            protocol: Some(Protocol::Tcp),
            source: RuleTarget {
                target_type: TargetType::Any,
                value: String::new(),
            },
            destination: RuleTarget {
                target_type: TargetType::Any,
                value: String::new(),
            },
            port_range: Some("80".into()),
            enabled: None,
            logged: None,
        })
        .unwrap();

        let action = mgr.evaluate_packet("1.2.3.4", "10.0.0.5", Protocol::Tcp, 80);
        assert_eq!(action, FirewallAction::Deny);
    }

    // -- Security groups ----------------------------------------------------

    #[test]
    fn test_security_group_membership() {
        let mgr = manager();
        let sg = mgr
            .create_security_group(CreateSecurityGroupRequest {
                name: "web-servers".into(),
                description: "Web tier VMs".into(),
            })
            .unwrap();

        mgr.add_group_member(
            &sg.id,
            GroupMember {
                member_type: MemberType::Tag,
                value: "role:web".into(),
            },
        )
        .unwrap();

        mgr.add_group_member(
            &sg.id,
            GroupMember {
                member_type: MemberType::IpAddress,
                value: "10.0.1.10".into(),
            },
        )
        .unwrap();

        let groups = mgr.list_security_groups();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].members.len(), 2);

        mgr.remove_group_member(&sg.id, "role:web").unwrap();
        let groups2 = mgr.list_security_groups();
        assert_eq!(groups2[0].members.len(), 1);
        assert_eq!(groups2[0].members[0].value, "10.0.1.10");
    }

    // -- Overlay networks ---------------------------------------------------

    #[test]
    fn test_overlay_network_endpoints() {
        let mgr = manager();
        let overlay = mgr
            .create_overlay(CreateOverlayRequest {
                name: "vxlan-prod".into(),
                vni: 5001,
                network_type: OverlayType::Vxlan,
                subnet: "10.100.0.0/24".into(),
                gateway: Some("10.100.0.1".into()),
                arp_suppression: Some(true),
            })
            .unwrap();

        assert_eq!(overlay.vni, 5001);
        assert!(overlay.arp_suppression);

        mgr.add_tunnel_endpoint(
            &overlay.id,
            TunnelEndpoint {
                host_id: "host-1".into(),
                vtep_ip: "192.168.10.1".into(),
                status: TepStatus::Up,
            },
        )
        .unwrap();

        mgr.add_tunnel_endpoint(
            &overlay.id,
            TunnelEndpoint {
                host_id: "host-2".into(),
                vtep_ip: "192.168.10.2".into(),
                status: TepStatus::Up,
            },
        )
        .unwrap();

        let o = mgr.get_overlay(&overlay.id).unwrap();
        assert_eq!(o.tunnel_endpoints.len(), 2);

        mgr.remove_tunnel_endpoint(&overlay.id, "host-1").unwrap();
        let o2 = mgr.get_overlay(&overlay.id).unwrap();
        assert_eq!(o2.tunnel_endpoints.len(), 1);
        assert_eq!(o2.tunnel_endpoints[0].host_id, "host-2");
    }

    // -- Load balancer ------------------------------------------------------

    #[test]
    fn test_lb_round_robin() {
        let mgr = manager();
        let lb = mgr
            .create_load_balancer(CreateLoadBalancerRequest {
                name: "web-lb".into(),
                vip: "10.0.0.100".into(),
                port: 80,
                algorithm: LbAlgorithm::RoundRobin,
                health_check: None,
            })
            .unwrap();

        mgr.add_lb_member(
            &lb.id,
            LbMember {
                id: "m1".into(),
                address: "10.0.0.11".into(),
                port: 8080,
                weight: 1,
                status: MemberStatus::Up,
            },
        )
        .unwrap();

        mgr.add_lb_member(
            &lb.id,
            LbMember {
                id: "m2".into(),
                address: "10.0.0.12".into(),
                port: 8080,
                weight: 1,
                status: MemberStatus::Up,
            },
        )
        .unwrap();

        let first = mgr.get_next_member(&lb.id).unwrap();
        let second = mgr.get_next_member(&lb.id).unwrap();
        let third = mgr.get_next_member(&lb.id).unwrap();

        // Round-robin cycles through members.
        assert_ne!(first.id, second.id);
        assert_eq!(first.id, third.id);
    }

    #[test]
    fn test_lb_skips_down_members() {
        let mgr = manager();
        let lb = mgr
            .create_load_balancer(CreateLoadBalancerRequest {
                name: "api-lb".into(),
                vip: "10.0.0.200".into(),
                port: 443,
                algorithm: LbAlgorithm::RoundRobin,
                health_check: None,
            })
            .unwrap();

        mgr.add_lb_member(
            &lb.id,
            LbMember {
                id: "m1".into(),
                address: "10.0.0.21".into(),
                port: 8443,
                weight: 1,
                status: MemberStatus::Down,
            },
        )
        .unwrap();

        mgr.add_lb_member(
            &lb.id,
            LbMember {
                id: "m2".into(),
                address: "10.0.0.22".into(),
                port: 8443,
                weight: 1,
                status: MemberStatus::Up,
            },
        )
        .unwrap();

        // Only the up member should ever be returned.
        let member = mgr.get_next_member(&lb.id).unwrap();
        assert_eq!(member.id, "m2");
        let member2 = mgr.get_next_member(&lb.id).unwrap();
        assert_eq!(member2.id, "m2");
    }

    #[test]
    fn test_lb_no_healthy_members_error() {
        let mgr = manager();
        let lb = mgr
            .create_load_balancer(CreateLoadBalancerRequest {
                name: "empty-lb".into(),
                vip: "10.0.0.50".into(),
                port: 80,
                algorithm: LbAlgorithm::RoundRobin,
                health_check: None,
            })
            .unwrap();

        let result = mgr.get_next_member(&lb.id);
        assert!(result.is_err());
    }

    // -- SR-IOV -------------------------------------------------------------

    #[test]
    fn test_sriov_assign_and_release() {
        let mgr = manager();
        mgr.register_sriov_nic(SriovNic {
            host_id: "host-1".into(),
            pci_address: "0000:03:00.0".into(),
            device_name: "ens3f0".into(),
            total_vfs: 8,
            available_vfs: 8,
            driver: "ixgbevf".into(),
            assigned_vms: vec![],
        })
        .unwrap();

        let assignment = mgr.assign_vf("host-1", "0000:03:00.0", "vm-web-01").unwrap();
        assert_eq!(assignment.vf_index, 0);
        assert_eq!(assignment.vm_name, "vm-web-01");

        let assignment2 = mgr.assign_vf("host-1", "0000:03:00.0", "vm-web-02").unwrap();
        assert_eq!(assignment2.vf_index, 1);

        // Verify available VFs decremented.
        let nics = mgr.list_sriov_nics(Some("host-1"));
        assert_eq!(nics.len(), 1);
        assert_eq!(nics[0].available_vfs, 6);
        assert_eq!(nics[0].assigned_vms.len(), 2);

        // Release VF 0 and verify count restored.
        mgr.release_vf("host-1", "0000:03:00.0", 0).unwrap();
        let nics2 = mgr.list_sriov_nics(Some("host-1"));
        assert_eq!(nics2[0].available_vfs, 7);
        assert_eq!(nics2[0].assigned_vms.len(), 1);
    }

    #[test]
    fn test_sriov_exhaustion() {
        let mgr = manager();
        mgr.register_sriov_nic(SriovNic {
            host_id: "h1".into(),
            pci_address: "0000:04:00.0".into(),
            device_name: "ens4f0".into(),
            total_vfs: 1,
            available_vfs: 1,
            driver: "mlx5_core".into(),
            assigned_vms: vec![],
        })
        .unwrap();

        mgr.assign_vf("h1", "0000:04:00.0", "vm1").unwrap();
        let err = mgr.assign_vf("h1", "0000:04:00.0", "vm2");
        assert!(err.is_err());
    }
}
