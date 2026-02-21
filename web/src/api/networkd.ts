import { apiFetch } from "./client"
const API_BASE = '/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DhcpMode = 'yes' | 'no' | 'ipv4' | 'ipv6'
export type MacvtapMode = 'private' | 'vepa' | 'bridge' | 'passthru' | 'source'
export type BondMode = 'balance-rr' | 'active-backup' | 'balance-xor' | 'broadcast' | '802.3ad' | 'balance-tlb' | 'balance-alb'
export type LacpRate = 'slow' | 'fast'
export type TransmitHashPolicy = 'layer2' | 'layer3+4' | 'layer2+3' | 'encap2+3' | 'encap3+4'

export interface RouteEntry {
  destination: string
  gateway?: string
  metric?: number
  scope?: string
}

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

export interface BondConfig {
  id: string
  name: string
  mode: BondMode
  mii_monitor_sec?: number
  up_delay_sec?: number
  down_delay_sec?: number
  lacp_rate?: LacpRate
  transmit_hash_policy?: TransmitHashPolicy
  min_links?: number
  primary_slave?: string
  slave_interfaces: string[]
  mtu?: number
  mac_address?: string
  addresses: string[]
  gateway?: string
  dns: string[]
  dhcp: DhcpMode
  routes: RouteEntry[]
  created: string
  updated: string
}

export interface CreateBondRequest {
  name: string
  mode?: BondMode
  mii_monitor_sec?: number
  up_delay_sec?: number
  down_delay_sec?: number
  lacp_rate?: LacpRate
  transmit_hash_policy?: TransmitHashPolicy
  min_links?: number
  primary_slave?: string
  slave_interfaces?: string[]
  mtu?: number
  mac_address?: string
  addresses?: string[]
  gateway?: string
  dns?: string[]
  dhcp?: DhcpMode
  routes?: RouteEntry[]
}

export interface NetworkFileConfig {
  id: string
  match_name: string
  match_mac?: string
  addresses: string[]
  gateway?: string
  dns: string[]
  dhcp: DhcpMode
  bridge?: string
  bond?: string
  mtu?: number
  routes: RouteEntry[]
  description?: string
  created: string
  updated: string
}

export interface CreateNetworkFileRequest {
  match_name: string
  match_mac?: string
  addresses?: string[]
  gateway?: string
  dns?: string[]
  dhcp?: DhcpMode
  bridge?: string
  bond?: string
  mtu?: number
  routes?: RouteEntry[]
  description?: string
}

export interface LinkFileConfig {
  id: string
  match_mac?: string
  match_path?: string
  match_driver?: string
  match_original_name?: string
  name?: string
  mtu?: number
  mac_address?: string
  wake_on_lan?: string
  description?: string
  created: string
  updated: string
}

export interface CreateLinkFileRequest {
  match_mac?: string
  match_path?: string
  match_driver?: string
  match_original_name?: string
  name?: string
  mtu?: number
  mac_address?: string
  wake_on_lan?: string
  description?: string
}

export interface ParsedConfigFile {
  filename: string
  file_type: string
  sections: { name: string; entries: [string, string][] }[]
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
  const res = await apiFetch(`${API_BASE}/networkd/bridges`)
  if (!res.ok) throw new Error('Failed to fetch bridges')
  return res.json()
}

export async function createBridge(req: CreateBridgeRequest): Promise<BridgeConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/bridges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create bridge')
  return res.json()
}

export async function getBridge(id: string): Promise<BridgeConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/bridges/${id}`)
  if (!res.ok) throw new Error('Failed to fetch bridge')
  return res.json()
}

export async function updateBridge(id: string, req: CreateBridgeRequest): Promise<BridgeConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/bridges/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to update bridge')
  return res.json()
}

export async function deleteBridge(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/networkd/bridges/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete bridge')
}

// ─── VLANs ────────────────────────────────────────────────────────────────────

export async function listVlans(): Promise<VlanConfig[]> {
  const res = await apiFetch(`${API_BASE}/networkd/vlans`)
  if (!res.ok) throw new Error('Failed to fetch VLANs')
  return res.json()
}

export async function createVlan(req: CreateVlanRequest): Promise<VlanConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/vlans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create VLAN')
  return res.json()
}

export async function getVlan(id: string): Promise<VlanConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/vlans/${id}`)
  if (!res.ok) throw new Error('Failed to fetch VLAN')
  return res.json()
}

export async function updateVlan(id: string, req: CreateVlanRequest): Promise<VlanConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/vlans/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to update VLAN')
  return res.json()
}

export async function deleteVlan(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/networkd/vlans/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete VLAN')
}

// ─── Macvtap ──────────────────────────────────────────────────────────────────

export async function listMacvtaps(): Promise<MacvtapConfig[]> {
  const res = await apiFetch(`${API_BASE}/networkd/macvtaps`)
  if (!res.ok) throw new Error('Failed to fetch macvtaps')
  return res.json()
}

export async function createMacvtap(req: CreateMacvtapRequest): Promise<MacvtapConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/macvtaps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create macvtap')
  return res.json()
}

export async function getMacvtap(id: string): Promise<MacvtapConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/macvtaps/${id}`)
  if (!res.ok) throw new Error('Failed to fetch macvtap')
  return res.json()
}

export async function deleteMacvtap(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/networkd/macvtaps/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete macvtap')
}

// ─── Tap ──────────────────────────────────────────────────────────────────────

export async function listTaps(): Promise<TapConfig[]> {
  const res = await apiFetch(`${API_BASE}/networkd/taps`)
  if (!res.ok) throw new Error('Failed to fetch taps')
  return res.json()
}

export async function createTap(req: CreateTapRequest): Promise<TapConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/taps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create tap')
  return res.json()
}

export async function getTap(id: string): Promise<TapConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/taps/${id}`)
  if (!res.ok) throw new Error('Failed to fetch tap')
  return res.json()
}

export async function deleteTap(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/networkd/taps/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete tap')
}

// ─── Bonds ────────────────────────────────────────────────────────────────────

export async function listBonds(): Promise<BondConfig[]> {
  const res = await apiFetch(`${API_BASE}/networkd/bonds`)
  if (!res.ok) throw new Error('Failed to fetch bonds')
  return res.json()
}

export async function createBond(req: CreateBondRequest): Promise<BondConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/bonds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create bond')
  return res.json()
}

export async function getBond(id: string): Promise<BondConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/bonds/${id}`)
  if (!res.ok) throw new Error('Failed to fetch bond')
  return res.json()
}

export async function updateBond(id: string, req: CreateBondRequest): Promise<BondConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/bonds/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to update bond')
  return res.json()
}

export async function deleteBond(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/networkd/bonds/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete bond')
}

// ─── Network Files ────────────────────────────────────────────────────────────

export async function listNetworkFiles(): Promise<NetworkFileConfig[]> {
  const res = await apiFetch(`${API_BASE}/networkd/network-files`)
  if (!res.ok) throw new Error('Failed to fetch network files')
  return res.json()
}

export async function createNetworkFile(req: CreateNetworkFileRequest): Promise<NetworkFileConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/network-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create network file')
  return res.json()
}

export async function getNetworkFile(id: string): Promise<NetworkFileConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/network-files/${id}`)
  if (!res.ok) throw new Error('Failed to fetch network file')
  return res.json()
}

export async function deleteNetworkFile(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/networkd/network-files/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete network file')
}

// ─── Link Files ───────────────────────────────────────────────────────────────

export async function listLinkFiles(): Promise<LinkFileConfig[]> {
  const res = await apiFetch(`${API_BASE}/networkd/link-files`)
  if (!res.ok) throw new Error('Failed to fetch link files')
  return res.json()
}

export async function createLinkFile(req: CreateLinkFileRequest): Promise<LinkFileConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/link-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create link file')
  return res.json()
}

export async function deleteLinkFile(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/networkd/link-files/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete link file')
}

// ─── Port Forwards ───────────────────────────────────────────────────────────

export type Protocol = 'tcp' | 'udp' | 'both'

export interface PortForwardConfig {
  id: string
  name: string
  protocol: Protocol
  host_port: number
  guest_ip: string
  guest_port: number
  interface?: string
  enabled: boolean
  description?: string
  created: string
  updated: string
}

export interface CreatePortForwardRequest {
  name: string
  protocol?: Protocol
  host_port: number
  guest_ip: string
  guest_port: number
  interface?: string
  enabled?: boolean
  description?: string
}

export async function listPortForwards(): Promise<PortForwardConfig[]> {
  const res = await apiFetch(`${API_BASE}/networkd/port-forwards`)
  if (!res.ok) throw new Error('Failed to fetch port forwards')
  return res.json()
}

export async function createPortForward(req: CreatePortForwardRequest): Promise<PortForwardConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/port-forwards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create port forward')
  return res.json()
}

export async function getPortForward(id: string): Promise<PortForwardConfig> {
  const res = await apiFetch(`${API_BASE}/networkd/port-forwards/${id}`)
  if (!res.ok) throw new Error('Failed to fetch port forward')
  return res.json()
}

export async function deletePortForward(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/networkd/port-forwards/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete port forward')
}

export async function syncPortForwards(): Promise<{ status: string; rules: number }> {
  const res = await apiFetch(`${API_BASE}/networkd/port-forwards/sync`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to sync port forwards')
  return res.json()
}

// ─── Scan existing configs ────────────────────────────────────────────────────

export async function scanConfigs(): Promise<ParsedConfigFile[]> {
  const res = await apiFetch(`${API_BASE}/networkd/scan`)
  if (!res.ok) throw new Error('Failed to scan configs')
  return res.json()
}

// ─── Status & Control ─────────────────────────────────────────────────────────

export async function listLinks(): Promise<LinkInfo[]> {
  const res = await apiFetch(`${API_BASE}/networkd/links`)
  if (!res.ok) throw new Error('Failed to fetch links')
  return res.json()
}

export async function getDeviceStatus(name: string): Promise<{ name: string; status: string }> {
  const res = await apiFetch(`${API_BASE}/networkd/links/${name}/status`)
  if (!res.ok) throw new Error('Failed to fetch device status')
  return res.json()
}

export async function reloadNetworkd(): Promise<void> {
  const res = await apiFetch(`${API_BASE}/networkd/reload`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to reload networkd')
}

export async function listManagedFiles(): Promise<string[]> {
  const res = await apiFetch(`${API_BASE}/networkd/files`)
  if (!res.ok) throw new Error('Failed to fetch managed files')
  return res.json()
}
