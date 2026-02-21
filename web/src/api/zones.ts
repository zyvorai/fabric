const API_BASE = '/api'

export interface AvailabilityZone {
  id: string
  name: string
  description: string
  region: string
  status: 'available' | 'degraded' | 'unavailable'
  hosts: string[]
  created: string
}

export interface SpotInstance {
  id: string
  vm_name: string
  max_price_per_hour: number
  priority: 'low' | 'regular'
  status: 'running' | 'evicted' | 'terminated'
  zone_id?: string
  eviction_policy: 'stop' | 'delete' | 'deallocate'
  created: string
  evicted_at?: string
}

export async function listZones(): Promise<AvailabilityZone[]> {
  const res = await fetch(`${API_BASE}/zones`)
  if (!res.ok) throw new Error('Failed to list zones')
  return res.json()
}

export async function createZone(req: { name: string; description?: string; region?: string }): Promise<AvailabilityZone> {
  const res = await fetch(`${API_BASE}/zones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create zone')
  return res.json()
}

export async function deleteZone(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/zones/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete zone')
}

export async function listSpotInstances(): Promise<SpotInstance[]> {
  const res = await fetch(`${API_BASE}/spot-instances`)
  if (!res.ok) throw new Error('Failed to list spot instances')
  return res.json()
}

export async function evictSpotInstance(id: string): Promise<SpotInstance> {
  const res = await fetch(`${API_BASE}/spot-instances/${id}/evict`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to evict spot instance')
  return res.json()
}
