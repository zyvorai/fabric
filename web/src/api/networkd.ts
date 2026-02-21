const API_BASE = '/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DhcpMode = 'yes' | 'no' | 'ipv4' | 'ipv6'
export type MacvtapMode = 'private' | 'vepa' | 'bridge' | 'passthru' | 'source'

export interface BridgeConfig {
  id: string
  name: string
  stp?: boolean
  forward_delay_sec?: number
  hello_time_sec?: number
  max_age_sec?: number
  vlan_filtering?: boolean
  mtu?: number
  mac_address?: string
  addresses: string[]
  gateway?: string
  dns: string[]
  dhcp: DhcpMode
  created: string
  updated: string
}

export interface CreateBridgeRequest {
  name: string
  stp?: boolean
  forward_delay_sec?: number
  hello_time_sec?: number
  max_age_sec?: number
  vlan_filtering?: boolean
  mtu?: number
  mac_address?: string
  addresses?: string[]
  gateway?: string
  dns?: string[]
  dhcp?: DhcpMode
}

export interface VlanConfig {
  id: string
  name: string
  vlan_id: number
  parent_interface: string
  mtu?: number
  addresses: string[]
  gateway?: string
  dns: string[]
  dhcp: DhcpMode
  created: string
  updated: string
}

export interface CreateVlanRequest {
  name: string
  vlan_id: number
  parent_interface: string
  mtu?: number
  addresses?: string[]
  gateway?: string
  dns?: string[]
  dhcp?: DhcpMode
}

export interface MacvtapConfig {
  id: string
  name: string
  parent_interface: string
  mode: MacvtapMode
  mtu?: number
  mac_address?: string
  created: string
  updated: string
}

export interface CreateMacvtapRequest {
  name: string
  parent_interface: string
  mode?: MacvtapMode
  mtu?: number
  mac_address?: string
}

export interface TapConfig {
  id: string
  name: string
  user?: string
  group?: string
  multi_queue?: boolean
  vnet_hdr?: boolean
  bridge?: string
  mtu?: number
  mac_address?: string
  created: string
  updated: string
}

export interface CreateTapRequest {
  name: string
  user?: string
  group?: string
  multi_queue?: boolean
  vnet_hdr?: boolean
  bridge?: string
  mtu?: number
  mac_address?: string
}

export interface LinkInfo {
  index: number
  name: string
  kind: string
  operational_state: string
  setup_state: string
}

// ─── Bridges ──────────────────────────────────────────────────────────────────

export async function listBridges(): Promise<BridgeConfig[]> {
  const res = await fetch(`${API_BASE}/networkd/bridges`)
  if (!res.ok) throw new Error('Failed to fetch bridges')
  return res.json()
}

export async function createBridge(req: CreateBridgeRequest): Promise<BridgeConfig> {
  const res = await fetch(`${API_BASE}/networkd/bridges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create bridge')
  return res.json()
}

export async function getBridge(id: string): Promise<BridgeConfig> {
  const res = await fetch(`${API_BASE}/networkd/bridges/${id}`)
  if (!res.ok) throw new Error('Failed to fetch bridge')
  return res.json()
}

export async function updateBridge(id: string, req: CreateBridgeRequest): Promise<BridgeConfig> {
  const res = await fetch(`${API_BASE}/networkd/bridges/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to update bridge')
  return res.json()
}

export async function deleteBridge(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/networkd/bridges/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete bridge')
}

// ─── VLANs ────────────────────────────────────────────────────────────────────

export async function listVlans(): Promise<VlanConfig[]> {
  const res = await fetch(`${API_BASE}/networkd/vlans`)
  if (!res.ok) throw new Error('Failed to fetch VLANs')
  return res.json()
}

export async function createVlan(req: CreateVlanRequest): Promise<VlanConfig> {
  const res = await fetch(`${API_BASE}/networkd/vlans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create VLAN')
  return res.json()
}

export async function getVlan(id: string): Promise<VlanConfig> {
  const res = await fetch(`${API_BASE}/networkd/vlans/${id}`)
  if (!res.ok) throw new Error('Failed to fetch VLAN')
  return res.json()
}

export async function updateVlan(id: string, req: CreateVlanRequest): Promise<VlanConfig> {
  const res = await fetch(`${API_BASE}/networkd/vlans/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to update VLAN')
  return res.json()
}

export async function deleteVlan(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/networkd/vlans/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete VLAN')
}

// ─── Macvtap ──────────────────────────────────────────────────────────────────

export async function listMacvtaps(): Promise<MacvtapConfig[]> {
  const res = await fetch(`${API_BASE}/networkd/macvtaps`)
  if (!res.ok) throw new Error('Failed to fetch macvtaps')
  return res.json()
}

export async function createMacvtap(req: CreateMacvtapRequest): Promise<MacvtapConfig> {
  const res = await fetch(`${API_BASE}/networkd/macvtaps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create macvtap')
  return res.json()
}

export async function getMacvtap(id: string): Promise<MacvtapConfig> {
  const res = await fetch(`${API_BASE}/networkd/macvtaps/${id}`)
  if (!res.ok) throw new Error('Failed to fetch macvtap')
  return res.json()
}

export async function deleteMacvtap(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/networkd/macvtaps/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete macvtap')
}

// ─── Tap ──────────────────────────────────────────────────────────────────────

export async function listTaps(): Promise<TapConfig[]> {
  const res = await fetch(`${API_BASE}/networkd/taps`)
  if (!res.ok) throw new Error('Failed to fetch taps')
  return res.json()
}

export async function createTap(req: CreateTapRequest): Promise<TapConfig> {
  const res = await fetch(`${API_BASE}/networkd/taps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create tap')
  return res.json()
}

export async function getTap(id: string): Promise<TapConfig> {
  const res = await fetch(`${API_BASE}/networkd/taps/${id}`)
  if (!res.ok) throw new Error('Failed to fetch tap')
  return res.json()
}

export async function deleteTap(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/networkd/taps/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete tap')
}

// ─── Status & Control ─────────────────────────────────────────────────────────

export async function listLinks(): Promise<LinkInfo[]> {
  const res = await fetch(`${API_BASE}/networkd/links`)
  if (!res.ok) throw new Error('Failed to fetch links')
  return res.json()
}

export async function getDeviceStatus(name: string): Promise<{ name: string; status: string }> {
  const res = await fetch(`${API_BASE}/networkd/links/${name}/status`)
  if (!res.ok) throw new Error('Failed to fetch device status')
  return res.json()
}

export async function reloadNetworkd(): Promise<void> {
  const res = await fetch(`${API_BASE}/networkd/reload`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to reload networkd')
}

export async function listManagedFiles(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/networkd/files`)
  if (!res.ok) throw new Error('Failed to fetch managed files')
  return res.json()
}
