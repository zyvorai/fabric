import { apiGet, apiPost, apiDelete } from './client'

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
  return apiGet<AvailabilityZone[]>(`${API_BASE}/zones`)
}

export async function createZone(req: { name: string; description?: string; region?: string }): Promise<AvailabilityZone> {
  return apiPost<AvailabilityZone>(`${API_BASE}/zones`, req)
}

export async function deleteZone(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/zones/${id}`)
}

export async function listSpotInstances(): Promise<SpotInstance[]> {
  return apiGet<SpotInstance[]>(`${API_BASE}/spot-instances`)
}

export async function evictSpotInstance(id: string): Promise<SpotInstance> {
  return apiPost<SpotInstance>(`${API_BASE}/spot-instances/${id}/evict`)
}
