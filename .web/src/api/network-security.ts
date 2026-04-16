import { apiGet, apiPost, apiPut, apiPostVoid, apiDelete } from './client'

const API_BASE = '/api'

// ─── Network Policies ────────────────────────────────────────────────────────

export type PolicyDirection = 'ingress' | 'egress'
export type PolicyAction = 'allow' | 'deny' | 'log'

export interface PolicyRule {
  direction: PolicyDirection
  protocol?: string
  port?: number
  cidr?: string
  action: PolicyAction
}

export interface NetworkPolicy {
  id: string
  name: string
  description?: string
  labels: Record<string, string>
  ingress_rules: PolicyRule[]
  egress_rules: PolicyRule[]
  priority: number
  enabled: boolean
  matched_vms: number
  created: string
  updated: string
}

export interface CreateNetworkPolicyRequest {
  name: string
  description?: string
  labels?: Record<string, string>
  ingress_rules?: PolicyRule[]
  egress_rules?: PolicyRule[]
  priority?: number
  enabled?: boolean
}

export async function listNetworkPolicies(): Promise<NetworkPolicy[]> {
  return apiGet<NetworkPolicy[]>(`${API_BASE}/network-policies`)
}

export async function createNetworkPolicy(req: CreateNetworkPolicyRequest): Promise<NetworkPolicy> {
  return apiPost<NetworkPolicy>(`${API_BASE}/network-policies`, req)
}

export async function getNetworkPolicy(id: string): Promise<NetworkPolicy> {
  return apiGet<NetworkPolicy>(`${API_BASE}/network-policies/${id}`)
}

export async function updateNetworkPolicy(id: string, req: CreateNetworkPolicyRequest): Promise<NetworkPolicy> {
  return apiPut<NetworkPolicy>(`${API_BASE}/network-policies/${id}`, req)
}

export async function deleteNetworkPolicy(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/network-policies/${id}`)
}

export async function syncNetworkPolicies(): Promise<{ status: string; policies: number }> {
  return apiPost<{ status: string; policies: number }>(`${API_BASE}/network-policies/sync`)
}

export async function networkPolicyStatus(): Promise<{ enforced: number; pending: number }> {
  return apiGet<{ enforced: number; pending: number }>(`${API_BASE}/network-policies/status`)
}

// ─── Firewall ────────────────────────────────────────────────────────────────

export type FirewallAction = 'accept' | 'drop' | 'reject' | 'log'

export interface FirewallRule {
  protocol?: string
  port?: number
  source_cidr?: string
  dest_cidr?: string
  action: FirewallAction
}

export interface FirewallProfile {
  id: string
  name: string
  description?: string
  default_action: FirewallAction
  rules: FirewallRule[]
  enabled: boolean
  created: string
  updated: string
}

export interface CreateFirewallProfileRequest {
  name: string
  description?: string
  default_action?: FirewallAction
  rules?: FirewallRule[]
  enabled?: boolean
}

export interface FirewallZone {
  id: string
  name: string
  description?: string
  labels: Record<string, string>
  profile_id: string
  created: string
  updated: string
}

export interface CreateFirewallZoneRequest {
  name: string
  description?: string
  labels?: Record<string, string>
  profile_id: string
}

export interface VMFirewallAssignment {
  id: string
  vm_name: string
  profile_id: string
  zone_id?: string
  created: string
}

export interface CreateVMFirewallAssignmentRequest {
  vm_name: string
  profile_id: string
  zone_id?: string
}

export async function listFirewallProfiles(): Promise<FirewallProfile[]> {
  return apiGet<FirewallProfile[]>(`${API_BASE}/vm-firewall/profiles`)
}

export async function createFirewallProfile(req: CreateFirewallProfileRequest): Promise<FirewallProfile> {
  return apiPost<FirewallProfile>(`${API_BASE}/vm-firewall/profiles`, req)
}

export async function getFirewallProfile(id: string): Promise<FirewallProfile> {
  return apiGet<FirewallProfile>(`${API_BASE}/vm-firewall/profiles/${id}`)
}

export async function updateFirewallProfile(id: string, req: CreateFirewallProfileRequest): Promise<FirewallProfile> {
  return apiPut<FirewallProfile>(`${API_BASE}/vm-firewall/profiles/${id}`, req)
}

export async function deleteFirewallProfile(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/vm-firewall/profiles/${id}`)
}

export async function listFirewallZones(): Promise<FirewallZone[]> {
  return apiGet<FirewallZone[]>(`${API_BASE}/vm-firewall/zones`)
}

export async function createFirewallZone(req: CreateFirewallZoneRequest): Promise<FirewallZone> {
  return apiPost<FirewallZone>(`${API_BASE}/vm-firewall/zones`, req)
}

export async function deleteFirewallZone(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/vm-firewall/zones/${id}`)
}

export async function listVMFirewallAssignments(): Promise<VMFirewallAssignment[]> {
  return apiGet<VMFirewallAssignment[]>(`${API_BASE}/vm-firewall/assignments`)
}

export async function createVMFirewallAssignment(req: CreateVMFirewallAssignmentRequest): Promise<VMFirewallAssignment> {
  return apiPost<VMFirewallAssignment>(`${API_BASE}/vm-firewall/assignments`, req)
}

export async function deleteVMFirewallAssignment(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/vm-firewall/assignments/${id}`)
}

export async function syncFirewall(): Promise<{ status: string; profiles: number }> {
  return apiPost<{ status: string; profiles: number }>(`${API_BASE}/vm-firewall/sync`)
}

export async function firewallStatus(): Promise<{ active_profiles: number; assigned_vms: number }> {
  return apiGet<{ active_profiles: number; assigned_vms: number }>(`${API_BASE}/vm-firewall/status`)
}

// ─── Service Mesh ────────────────────────────────────────────────────────────

export type LoadBalancerAlgorithm = 'round-robin' | 'least-conn' | 'random' | 'ip-hash'

export interface ServiceBackend {
  address: string
  port: number
  weight?: number
}

export interface Service {
  id: string
  name: string
  description?: string
  virtual_ip: string
  port: number
  protocol: string
  algorithm: LoadBalancerAlgorithm
  backends: ServiceBackend[]
  labels: Record<string, string>
  health_check?: boolean
  enabled: boolean
  created: string
  updated: string
}

export interface CreateServiceRequest {
  name: string
  description?: string
  virtual_ip: string
  port: number
  protocol?: string
  algorithm?: LoadBalancerAlgorithm
  backends?: ServiceBackend[]
  labels?: Record<string, string>
  health_check?: boolean
  enabled?: boolean
}

export async function listServices(): Promise<Service[]> {
  return apiGet<Service[]>(`${API_BASE}/service-mesh/services`)
}

export async function createService(req: CreateServiceRequest): Promise<Service> {
  return apiPost<Service>(`${API_BASE}/service-mesh/services`, req)
}

export async function getService(id: string): Promise<Service> {
  return apiGet<Service>(`${API_BASE}/service-mesh/services/${id}`)
}

export async function updateService(id: string, req: CreateServiceRequest): Promise<Service> {
  return apiPut<Service>(`${API_BASE}/service-mesh/services/${id}`, req)
}

export async function deleteService(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/service-mesh/services/${id}`)
}

export async function syncServices(): Promise<{ status: string; services: number }> {
  return apiPost<{ status: string; services: number }>(`${API_BASE}/service-mesh/sync`)
}

export async function serviceMeshStatus(): Promise<{ active_services: number; total_backends: number }> {
  return apiGet<{ active_services: number; total_backends: number }>(`${API_BASE}/service-mesh/status`)
}

// ─── QoS / Traffic Shaping ───────────────────────────────────────────────────

export interface QoSPolicy {
  id: string
  name: string
  description?: string
  labels: Record<string, string>
  guaranteed_rate?: string
  max_rate?: string
  burst?: string
  priority: number
  matched_vms: number
  enabled: boolean
  created: string
  updated: string
}

export interface CreateQoSPolicyRequest {
  name: string
  description?: string
  labels?: Record<string, string>
  guaranteed_rate?: string
  max_rate?: string
  burst?: string
  priority?: number
  enabled?: boolean
}

export async function listQosPolicies(): Promise<QoSPolicy[]> {
  return apiGet<QoSPolicy[]>(`${API_BASE}/traffic-shaping/policies`)
}

export async function createQosPolicy(req: CreateQoSPolicyRequest): Promise<QoSPolicy> {
  return apiPost<QoSPolicy>(`${API_BASE}/traffic-shaping/policies`, req)
}

export async function getQosPolicy(id: string): Promise<QoSPolicy> {
  return apiGet<QoSPolicy>(`${API_BASE}/traffic-shaping/policies/${id}`)
}

export async function updateQosPolicy(id: string, req: CreateQoSPolicyRequest): Promise<QoSPolicy> {
  return apiPut<QoSPolicy>(`${API_BASE}/traffic-shaping/policies/${id}`, req)
}

export async function deleteQosPolicy(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/traffic-shaping/policies/${id}`)
}

export async function syncQos(): Promise<{ status: string; policies: number }> {
  return apiPost<{ status: string; policies: number }>(`${API_BASE}/traffic-shaping/sync`)
}

export async function qosStatus(): Promise<{ active_policies: number; shaped_vms: number }> {
  return apiGet<{ active_policies: number; shaped_vms: number }>(`${API_BASE}/traffic-shaping/status`)
}

// ─── DNS ─────────────────────────────────────────────────────────────────────

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'PTR'

export interface DnsRecord {
  name: string
  record_type: DnsRecordType
  value: string
  ttl: number
}

export interface DnsZone {
  id: string
  name: string
  description?: string
  domain: string
  records: DnsRecord[]
  enabled: boolean
  created: string
  updated: string
}

export interface CreateDnsZoneRequest {
  name: string
  description?: string
  domain: string
  records?: DnsRecord[]
  enabled?: boolean
}

export interface DnsPolicy {
  id: string
  name: string
  description?: string
  labels: Record<string, string>
  upstream_servers: string[]
  blocked_domains: string[]
  enabled: boolean
  created: string
  updated: string
}

export interface CreateDnsPolicyRequest {
  name: string
  description?: string
  labels?: Record<string, string>
  upstream_servers?: string[]
  blocked_domains?: string[]
  enabled?: boolean
}

export async function listDnsZones(): Promise<DnsZone[]> {
  return apiGet<DnsZone[]>(`${API_BASE}/dns-policy/zones`)
}

export async function createDnsZone(req: CreateDnsZoneRequest): Promise<DnsZone> {
  return apiPost<DnsZone>(`${API_BASE}/dns-policy/zones`, req)
}

export async function getDnsZone(id: string): Promise<DnsZone> {
  return apiGet<DnsZone>(`${API_BASE}/dns-policy/zones/${id}`)
}

export async function updateDnsZone(id: string, req: CreateDnsZoneRequest): Promise<DnsZone> {
  return apiPut<DnsZone>(`${API_BASE}/dns-policy/zones/${id}`, req)
}

export async function deleteDnsZone(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/dns-policy/zones/${id}`)
}

export async function listDnsPolicies(): Promise<DnsPolicy[]> {
  return apiGet<DnsPolicy[]>(`${API_BASE}/dns-policy/policies`)
}

export async function createDnsPolicy(req: CreateDnsPolicyRequest): Promise<DnsPolicy> {
  return apiPost<DnsPolicy>(`${API_BASE}/dns-policy/policies`, req)
}

export async function getDnsPolicy(id: string): Promise<DnsPolicy> {
  return apiGet<DnsPolicy>(`${API_BASE}/dns-policy/policies/${id}`)
}

export async function updateDnsPolicy(id: string, req: CreateDnsPolicyRequest): Promise<DnsPolicy> {
  return apiPut<DnsPolicy>(`${API_BASE}/dns-policy/policies/${id}`, req)
}

export async function deleteDnsPolicy(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/dns-policy/policies/${id}`)
}

export async function syncDns(): Promise<{ status: string; zones: number }> {
  return apiPost<{ status: string; zones: number }>(`${API_BASE}/dns-policy/sync`)
}

// ─── VPN Mesh ────────────────────────────────────────────────────────────────

export type VpnTopology = 'full-mesh' | 'hub-spoke' | 'point-to-point'

export interface VpnPeer {
  public_key: string
  endpoint?: string
  allowed_ips: string[]
}

export interface VpnTunnel {
  id: string
  name: string
  description?: string
  interface_name: string
  listen_port: number
  private_key_set: boolean
  peers: VpnPeer[]
  enabled: boolean
  created: string
  updated: string
}

export interface CreateVpnTunnelRequest {
  name: string
  description?: string
  interface_name?: string
  listen_port?: number
  private_key?: string
  peers?: VpnPeer[]
  enabled?: boolean
}

export interface VpnNetwork {
  id: string
  name: string
  description?: string
  topology: VpnTopology
  address_range: string
  labels: Record<string, string>
  tunnel_ids: string[]
  created: string
  updated: string
}

export interface CreateVpnNetworkRequest {
  name: string
  description?: string
  topology?: VpnTopology
  address_range: string
  labels?: Record<string, string>
  tunnel_ids?: string[]
}

export async function listVpnTunnels(): Promise<VpnTunnel[]> {
  return apiGet<VpnTunnel[]>(`${API_BASE}/vpn-mesh/tunnels`)
}

export async function createVpnTunnel(req: CreateVpnTunnelRequest): Promise<VpnTunnel> {
  return apiPost<VpnTunnel>(`${API_BASE}/vpn-mesh/tunnels`, req)
}

export async function getVpnTunnel(id: string): Promise<VpnTunnel> {
  return apiGet<VpnTunnel>(`${API_BASE}/vpn-mesh/tunnels/${id}`)
}

export async function updateVpnTunnel(id: string, req: CreateVpnTunnelRequest): Promise<VpnTunnel> {
  return apiPut<VpnTunnel>(`${API_BASE}/vpn-mesh/tunnels/${id}`, req)
}

export async function deleteVpnTunnel(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/vpn-mesh/tunnels/${id}`)
}

export async function listVpnNetworks(): Promise<VpnNetwork[]> {
  return apiGet<VpnNetwork[]>(`${API_BASE}/vpn-mesh/networks`)
}

export async function createVpnNetwork(req: CreateVpnNetworkRequest): Promise<VpnNetwork> {
  return apiPost<VpnNetwork>(`${API_BASE}/vpn-mesh/networks`, req)
}

export async function deleteVpnNetwork(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/vpn-mesh/networks/${id}`)
}

export async function syncVpn(): Promise<{ status: string; tunnels: number }> {
  return apiPost<{ status: string; tunnels: number }>(`${API_BASE}/vpn-mesh/sync`)
}

export async function vpnStatus(): Promise<{ active_tunnels: number; networks: number }> {
  return apiGet<{ active_tunnels: number; networks: number }>(`${API_BASE}/vpn-mesh/status`)
}

// ─── Packet Mirror ───────────────────────────────────────────────────────────

export type MirrorDirection = 'ingress' | 'egress' | 'both'

export interface MirrorSession {
  id: string
  name: string
  description?: string
  source_vm: string
  direction: MirrorDirection
  collector_address: string
  collector_port: number
  filter_protocol?: string
  filter_port?: number
  filter_cidr?: string
  enabled: boolean
  created: string
  updated: string
}

export interface CreateMirrorSessionRequest {
  name: string
  description?: string
  source_vm: string
  direction?: MirrorDirection
  collector_address: string
  collector_port: number
  filter_protocol?: string
  filter_port?: number
  filter_cidr?: string
  enabled?: boolean
}

export async function listMirrorSessions(): Promise<MirrorSession[]> {
  return apiGet<MirrorSession[]>(`${API_BASE}/packet-mirror/sessions`)
}

export async function createMirrorSession(req: CreateMirrorSessionRequest): Promise<MirrorSession> {
  return apiPost<MirrorSession>(`${API_BASE}/packet-mirror/sessions`, req)
}

export async function getMirrorSession(id: string): Promise<MirrorSession> {
  return apiGet<MirrorSession>(`${API_BASE}/packet-mirror/sessions/${id}`)
}

export async function updateMirrorSession(id: string, req: CreateMirrorSessionRequest): Promise<MirrorSession> {
  return apiPut<MirrorSession>(`${API_BASE}/packet-mirror/sessions/${id}`, req)
}

export async function deleteMirrorSession(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/packet-mirror/sessions/${id}`)
}

export async function syncMirror(): Promise<{ status: string; sessions: number }> {
  return apiPost<{ status: string; sessions: number }>(`${API_BASE}/packet-mirror/sync`)
}

export async function mirrorStatus(): Promise<{ active_sessions: number; mirrored_vms: number }> {
  return apiGet<{ active_sessions: number; mirrored_vms: number }>(`${API_BASE}/packet-mirror/status`)
}

// ─── NAT Gateway ─────────────────────────────────────────────────────────────

export type NatType = 'masquerade' | 'snat' | 'dnat' | 'hairpin'

export interface NatRule {
  id: string
  name: string
  description?: string
  nat_type: NatType
  source_cidr?: string
  dest_cidr?: string
  protocol?: string
  port?: number
  translate_address?: string
  translate_port?: number
  enabled: boolean
  created: string
  updated: string
}

export interface CreateNatRuleRequest {
  name: string
  description?: string
  nat_type: NatType
  source_cidr?: string
  dest_cidr?: string
  protocol?: string
  port?: number
  translate_address?: string
  translate_port?: number
  enabled?: boolean
}

export interface NatPool {
  id: string
  name: string
  description?: string
  address_range: string
  port_range_start?: number
  port_range_end?: number
  created: string
  updated: string
}

export interface CreateNatPoolRequest {
  name: string
  description?: string
  address_range: string
  port_range_start?: number
  port_range_end?: number
}

export interface NatGatewayConfig {
  id: string
  name: string
  description?: string
  labels: Record<string, string>
  pool_id?: string
  rule_ids: string[]
  enabled: boolean
  created: string
  updated: string
}

export interface CreateNatGatewayRequest {
  name: string
  description?: string
  labels?: Record<string, string>
  pool_id?: string
  rule_ids?: string[]
  enabled?: boolean
}

export async function listNatRules(): Promise<NatRule[]> {
  return apiGet<NatRule[]>(`${API_BASE}/nat-gateway/rules`)
}

export async function createNatRule(req: CreateNatRuleRequest): Promise<NatRule> {
  return apiPost<NatRule>(`${API_BASE}/nat-gateway/rules`, req)
}

export async function getNatRule(id: string): Promise<NatRule> {
  return apiGet<NatRule>(`${API_BASE}/nat-gateway/rules/${id}`)
}

export async function updateNatRule(id: string, req: CreateNatRuleRequest): Promise<NatRule> {
  return apiPut<NatRule>(`${API_BASE}/nat-gateway/rules/${id}`, req)
}

export async function deleteNatRule(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/nat-gateway/rules/${id}`)
}

export async function listNatPools(): Promise<NatPool[]> {
  return apiGet<NatPool[]>(`${API_BASE}/nat-gateway/pools`)
}

export async function createNatPool(req: CreateNatPoolRequest): Promise<NatPool> {
  return apiPost<NatPool>(`${API_BASE}/nat-gateway/pools`, req)
}

export async function deleteNatPool(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/nat-gateway/pools/${id}`)
}

export async function listNatGateways(): Promise<NatGatewayConfig[]> {
  return apiGet<NatGatewayConfig[]>(`${API_BASE}/nat-gateway/gateways`)
}

export async function createNatGateway(req: CreateNatGatewayRequest): Promise<NatGatewayConfig> {
  return apiPost<NatGatewayConfig>(`${API_BASE}/nat-gateway/gateways`, req)
}

export async function deleteNatGateway(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/nat-gateway/gateways/${id}`)
}

export async function syncNat(): Promise<{ status: string; rules: number }> {
  return apiPost<{ status: string; rules: number }>(`${API_BASE}/nat-gateway/sync`)
}

export async function natStatus(): Promise<{ active_rules: number; gateways: number }> {
  return apiGet<{ active_rules: number; gateways: number }>(`${API_BASE}/nat-gateway/status`)
}

// ─── Network Monitor ─────────────────────────────────────────────────────────

export type AlertSeverity = 'info' | 'warning' | 'critical'
export type MetricDirection = 'inbound' | 'outbound' | 'both'

export interface MonitorThreshold {
  metric: string
  value: number
  unit: string
  direction: MetricDirection
  severity: AlertSeverity
}

export interface MonitorPolicy {
  id: string
  name: string
  description?: string
  labels: Record<string, string>
  thresholds: MonitorThreshold[]
  interval_seconds: number
  enabled: boolean
  created: string
  updated: string
}

export interface CreateMonitorPolicyRequest {
  name: string
  description?: string
  labels?: Record<string, string>
  thresholds?: MonitorThreshold[]
  interval_seconds?: number
  enabled?: boolean
}

export interface NetworkMetrics {
  vm_name: string
  interface_name: string
  rx_bytes: number
  tx_bytes: number
  rx_packets: number
  tx_packets: number
  rx_errors: number
  tx_errors: number
  timestamp: string
}

export interface BandwidthAlert {
  id: string
  policy_id: string
  vm_name: string
  metric: string
  value: number
  threshold: number
  severity: AlertSeverity
  acknowledged: boolean
  created: string
}

export async function listMonitorPolicies(): Promise<MonitorPolicy[]> {
  return apiGet<MonitorPolicy[]>(`${API_BASE}/net-monitor/policies`)
}

export async function createMonitorPolicy(req: CreateMonitorPolicyRequest): Promise<MonitorPolicy> {
  return apiPost<MonitorPolicy>(`${API_BASE}/net-monitor/policies`, req)
}

export async function getMonitorPolicy(id: string): Promise<MonitorPolicy> {
  return apiGet<MonitorPolicy>(`${API_BASE}/net-monitor/policies/${id}`)
}

export async function updateMonitorPolicy(id: string, req: CreateMonitorPolicyRequest): Promise<MonitorPolicy> {
  return apiPut<MonitorPolicy>(`${API_BASE}/net-monitor/policies/${id}`, req)
}

export async function deleteMonitorPolicy(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/net-monitor/policies/${id}`)
}

export async function syncMonitor(): Promise<{ status: string; policies: number }> {
  return apiPost<{ status: string; policies: number }>(`${API_BASE}/net-monitor/sync`)
}

export async function monitorStatus(): Promise<{ active_policies: number; monitored_vms: number }> {
  return apiGet<{ active_policies: number; monitored_vms: number }>(`${API_BASE}/net-monitor/status`)
}

export async function listNetworkMetrics(): Promise<NetworkMetrics[]> {
  return apiGet<NetworkMetrics[]>(`${API_BASE}/net-monitor/metrics`)
}

export async function listBandwidthAlerts(): Promise<BandwidthAlert[]> {
  return apiGet<BandwidthAlert[]>(`${API_BASE}/net-monitor/alerts`)
}

export async function acknowledgeBandwidthAlert(id: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/net-monitor/alerts/${id}/acknowledge`)
}
