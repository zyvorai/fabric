import { apiFetch } from "./client"
export interface ResourceQuota {
  id: string
  name: string
  max_cpus: number
  max_memory: number // MB
  max_disk: number // GB
  max_vms: number
  used_cpus: number
  used_memory: number
  used_disk: number
  used_vms: number
  tags?: string[] // Apply quota to VMs with these tags
  enabled: boolean
  created: string
  updated: string
}

export interface CreateQuotaRequest {
  name: string
  max_cpus: number
  max_memory: number
  max_disk: number
  max_vms: number
  tags?: string[]
  enabled?: boolean
}

export interface QuotaUsage {
  quota_id: string
  quota_name: string
  cpu_percent: number
  memory_percent: number
  disk_percent: number
  vms_percent: number
  is_exceeded: boolean
  exceeded_resources: string[]
}

const API_BASE = '/api'

export async function listQuotas(): Promise<ResourceQuota[]> {
  const res = await apiFetch(`${API_BASE}/quotas`)
  if (!res.ok) throw new Error('Failed to fetch quotas')
  return res.json()
}

export async function getQuota(id: string): Promise<ResourceQuota> {
  const res = await apiFetch(`${API_BASE}/quotas/${id}`)
  if (!res.ok) throw new Error('Failed to fetch quota')
  return res.json()
}

export async function createQuota(req: CreateQuotaRequest): Promise<ResourceQuota> {
  const res = await apiFetch(`${API_BASE}/quotas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create quota')
  return res.json()
}

export async function updateQuota(id: string, req: Partial<CreateQuotaRequest>): Promise<ResourceQuota> {
  const res = await apiFetch(`${API_BASE}/quotas/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to update quota')
  return res.json()
}

export async function deleteQuota(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/quotas/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete quota')
}

export async function enableQuota(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/quotas/${id}/enable`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to enable quota')
}

export async function disableQuota(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/quotas/${id}/disable`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to disable quota')
}

export async function getQuotaUsage(id: string): Promise<QuotaUsage> {
  const res = await apiFetch(`${API_BASE}/quotas/${id}/usage`)
  if (!res.ok) throw new Error('Failed to fetch quota usage')
  return res.json()
}

export async function getAllQuotaUsage(): Promise<QuotaUsage[]> {
  const res = await apiFetch(`${API_BASE}/quotas/usage`)
  if (!res.ok) throw new Error('Failed to fetch quota usage')
  return res.json()
}
