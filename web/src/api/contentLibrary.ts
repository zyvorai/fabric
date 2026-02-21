import { apiFetch } from "./client"
export interface Library {
  id: string
  name: string
  description?: string
  library_type: 'local' | 'subscribed'
  storage_path: string
  publish_url?: string
  subscribe_url?: string
  item_count: number
  total_size_bytes: number
  auto_sync: boolean
  last_sync?: string
  status: string
  created: string
  updated?: string
}

export interface LibraryItem {
  id: string
  library_id: string
  name: string
  description?: string
  item_type: 'template' | 'iso' | 'ovf' | 'script' | 'file'
  version: string
  size_bytes: number
  content_hash?: string
  tags?: string[]
  metadata?: Record<string, string>
  created: string
  updated?: string
}

export interface GuestCustomizationSpec {
  id: string
  name: string
  description?: string
  os_type: 'linux' | 'windows'
  hostname_prefix?: string
  domain?: string
  dns_servers?: string[]
  ntp_servers?: string[]
  timezone?: string
  network_config?: {
    dhcp: boolean
    static_ip?: string
    subnet_mask?: string
    gateway?: string
  }
  ssh_keys?: string[]
  run_once_commands?: string[]
  admin_password_hash?: string
  created: string
  updated?: string
}

export interface HostProfile {
  id: string
  name: string
  description?: string
  reference_host_id?: string
  settings: Record<string, unknown>
  compliant_hosts: number
  non_compliant_hosts: number
  status: string
  created: string
  updated?: string
}

const API_BASE = '/api'

// Libraries

export async function listLibraries(): Promise<Library[]> {
  const res = await apiFetch(`${API_BASE}/content-library/libraries`)
  if (!res.ok) throw new Error('Failed to fetch libraries')
  return res.json()
}

export async function createLibrary(req: {
  name: string
  description?: string
  library_type: 'local' | 'subscribed'
  storage_path: string
  subscribe_url?: string
  auto_sync?: boolean
}): Promise<Library> {
  const res = await apiFetch(`${API_BASE}/content-library/libraries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create library')
  return res.json()
}

export async function deleteLibrary(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/content-library/libraries/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete library')
}

export async function syncLibrary(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/content-library/libraries/${id}/sync`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to sync library')
}

// Library items

export async function listLibraryItems(libraryId: string): Promise<LibraryItem[]> {
  const res = await apiFetch(`${API_BASE}/content-library/libraries/${libraryId}/items`)
  if (!res.ok) throw new Error('Failed to fetch library items')
  return res.json()
}

export async function addLibraryItem(libraryId: string, req: {
  name: string
  description?: string
  item_type: 'template' | 'iso' | 'ovf' | 'script' | 'file'
  tags?: string[]
  metadata?: Record<string, string>
}): Promise<LibraryItem> {
  const res = await apiFetch(`${API_BASE}/content-library/libraries/${libraryId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to add library item')
  return res.json()
}

export async function deleteLibraryItem(libraryId: string, itemId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/content-library/libraries/${libraryId}/items/${itemId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete library item')
}

export async function searchItems(query: string, libraryId?: string): Promise<LibraryItem[]> {
  const params = new URLSearchParams({ q: query })
  if (libraryId) params.append('library_id', libraryId)
  const res = await apiFetch(`${API_BASE}/content-library/items/search?${params}`)
  if (!res.ok) throw new Error('Failed to search library items')
  return res.json()
}

// Guest customization specs

export async function listCustomizationSpecs(): Promise<GuestCustomizationSpec[]> {
  const res = await apiFetch(`${API_BASE}/content-library/customization-specs`)
  if (!res.ok) throw new Error('Failed to fetch customization specs')
  return res.json()
}

export async function createCustomizationSpec(req: {
  name: string
  description?: string
  os_type: 'linux' | 'windows'
  hostname_prefix?: string
  domain?: string
  dns_servers?: string[]
  ntp_servers?: string[]
  timezone?: string
  network_config?: {
    dhcp: boolean
    static_ip?: string
    subnet_mask?: string
    gateway?: string
  }
  ssh_keys?: string[]
  run_once_commands?: string[]
}): Promise<GuestCustomizationSpec> {
  const res = await apiFetch(`${API_BASE}/content-library/customization-specs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create customization spec')
  return res.json()
}

export async function deleteCustomizationSpec(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/content-library/customization-specs/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete customization spec')
}

// Host profiles

export async function listHostProfiles(): Promise<HostProfile[]> {
  const res = await apiFetch(`${API_BASE}/content-library/host-profiles`)
  if (!res.ok) throw new Error('Failed to fetch host profiles')
  return res.json()
}

export async function createHostProfile(req: {
  name: string
  description?: string
  reference_host_id?: string
  settings: Record<string, unknown>
}): Promise<HostProfile> {
  const res = await apiFetch(`${API_BASE}/content-library/host-profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create host profile')
  return res.json()
}

export async function deleteHostProfile(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/content-library/host-profiles/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete host profile')
}

export async function checkHostCompliance(profileId: string, hostId: string): Promise<{
  compliant: boolean
  deviations: Array<{
    setting: string
    expected: string
    actual: string
  }>
  checked_at: string
}> {
  const res = await apiFetch(`${API_BASE}/content-library/host-profiles/${profileId}/check-compliance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host_id: hostId }),
  })
  if (!res.ok) throw new Error('Failed to check host compliance')
  return res.json()
}
