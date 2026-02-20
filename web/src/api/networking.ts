export interface DistributedSwitch {
  id: string
  name: string
  description?: string
  mtu: number
  uplink_count: number
  hosts: string[]
  port_group_count: number
  status: string
  created: string
  updated?: string
}

export interface PortGroup {
  id: string
  name: string
  switch_id: string
  vlan_id: number
  vlan_type: 'none' | 'vlan' | 'trunk'
  trunk_ranges?: string
  ports_available: number
  ports_used: number
  security_policy: {
    promiscuous_mode: boolean
    mac_changes: boolean
    forged_transmits: boolean
  }
  teaming_policy: string
  status: string
  created: string
  updated?: string
}

export interface FirewallRule {
  id: string
  name: string
  description?: string
  direction: 'inbound' | 'outbound'
  action: 'allow' | 'deny' | 'reject'
  protocol: string
  source: string
  destination: string
  port_range?: string
  priority: number
  security_group_ids?: string[]
  enabled: boolean
  hit_count: number
  created: string
  updated?: string
}

export interface SecurityGroup {
  id: string
  name: string
  description?: string
  vm_ids: string[]
  tags?: string[]
  rule_count: number
  created: string
  updated?: string
}

export interface OverlayNetwork {
  id: string
  name: string
  description?: string
  vni: number
  tunnel_type: 'vxlan' | 'geneve' | 'gre'
  subnet: string
  gateway?: string
  mtu: number
  hosts: string[]
  vm_count: number
  status: string
  created: string
  updated?: string
}

export interface LoadBalancer {
  id: string
  name: string
  description?: string
  vip: string
  port: number
  protocol: 'tcp' | 'udp' | 'http' | 'https'
  algorithm: 'round_robin' | 'least_connections' | 'ip_hash' | 'weighted'
  backends: Array<{
    address: string
    port: number
    weight: number
    status: string
  }>
  health_check: {
    protocol: string
    path?: string
    interval_seconds: number
    timeout_seconds: number
    unhealthy_threshold: number
  }
  status: string
  created: string
  updated?: string
}

const API_BASE = '/api'

// Distributed switches

export async function listSwitches(): Promise<DistributedSwitch[]> {
  const res = await fetch(`${API_BASE}/networking/switches`)
  if (!res.ok) throw new Error('Failed to fetch distributed switches')
  return res.json()
}

export async function createSwitch(req: {
  name: string
  description?: string
  mtu?: number
  uplink_count?: number
  hosts?: string[]
}): Promise<DistributedSwitch> {
  const res = await fetch(`${API_BASE}/networking/switches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create distributed switch')
  return res.json()
}

export async function deleteSwitch(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/networking/switches/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete distributed switch')
}

// Port groups

export async function listPortGroups(switchId?: string): Promise<PortGroup[]> {
  const url = switchId
    ? `${API_BASE}/networking/port-groups?switch_id=${switchId}`
    : `${API_BASE}/networking/port-groups`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch port groups')
  return res.json()
}

export async function createPortGroup(req: {
  name: string
  switch_id: string
  vlan_id?: number
  vlan_type?: 'none' | 'vlan' | 'trunk'
  trunk_ranges?: string
  security_policy?: {
    promiscuous_mode: boolean
    mac_changes: boolean
    forged_transmits: boolean
  }
  teaming_policy?: string
}): Promise<PortGroup> {
  const res = await fetch(`${API_BASE}/networking/port-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create port group')
  return res.json()
}

// Firewall rules

export async function listFirewallRules(securityGroupId?: string): Promise<FirewallRule[]> {
  const url = securityGroupId
    ? `${API_BASE}/networking/firewall-rules?security_group_id=${securityGroupId}`
    : `${API_BASE}/networking/firewall-rules`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch firewall rules')
  return res.json()
}

export async function createFirewallRule(req: {
  name: string
  description?: string
  direction: 'inbound' | 'outbound'
  action: 'allow' | 'deny' | 'reject'
  protocol: string
  source: string
  destination: string
  port_range?: string
  priority: number
  security_group_ids?: string[]
  enabled?: boolean
}): Promise<FirewallRule> {
  const res = await fetch(`${API_BASE}/networking/firewall-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create firewall rule')
  return res.json()
}

export async function deleteFirewallRule(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/networking/firewall-rules/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete firewall rule')
}

// Security groups

export async function listSecurityGroups(): Promise<SecurityGroup[]> {
  const res = await fetch(`${API_BASE}/networking/security-groups`)
  if (!res.ok) throw new Error('Failed to fetch security groups')
  return res.json()
}

export async function createSecurityGroup(req: {
  name: string
  description?: string
  vm_ids?: string[]
  tags?: string[]
}): Promise<SecurityGroup> {
  const res = await fetch(`${API_BASE}/networking/security-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create security group')
  return res.json()
}

// Overlay networks

export async function listOverlays(): Promise<OverlayNetwork[]> {
  const res = await fetch(`${API_BASE}/networking/overlays`)
  if (!res.ok) throw new Error('Failed to fetch overlay networks')
  return res.json()
}

export async function createOverlay(req: {
  name: string
  description?: string
  vni?: number
  tunnel_type: 'vxlan' | 'geneve' | 'gre'
  subnet: string
  gateway?: string
  mtu?: number
  hosts?: string[]
}): Promise<OverlayNetwork> {
  const res = await fetch(`${API_BASE}/networking/overlays`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create overlay network')
  return res.json()
}

// Load balancers

export async function listLoadBalancers(): Promise<LoadBalancer[]> {
  const res = await fetch(`${API_BASE}/networking/load-balancers`)
  if (!res.ok) throw new Error('Failed to fetch load balancers')
  return res.json()
}

export async function createLoadBalancer(req: {
  name: string
  description?: string
  vip: string
  port: number
  protocol: 'tcp' | 'udp' | 'http' | 'https'
  algorithm?: 'round_robin' | 'least_connections' | 'ip_hash' | 'weighted'
  backends: Array<{
    address: string
    port: number
    weight?: number
  }>
  health_check?: {
    protocol: string
    path?: string
    interval_seconds?: number
    timeout_seconds?: number
    unhealthy_threshold?: number
  }
}): Promise<LoadBalancer> {
  const res = await fetch(`${API_BASE}/networking/load-balancers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create load balancer')
  return res.json()
}
