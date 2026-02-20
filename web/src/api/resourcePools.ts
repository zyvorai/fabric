export interface ResourcePool {
  id: string
  name: string
  parent_id?: string
  cluster_id: string
  cpu_reservation: number
  cpu_limit: number
  cpu_shares: number
  memory_reservation_mb: number
  memory_limit_mb: number
  memory_shares: number
  cpu_used: number
  memory_used_mb: number
  vm_count: number
  expandable_reservation: boolean
  status: string
  created: string
  updated?: string
}

export interface ResourcePoolSummary {
  id: string
  name: string
  cpu_total: number
  cpu_used: number
  cpu_available: number
  memory_total_mb: number
  memory_used_mb: number
  memory_available_mb: number
  vm_count: number
  child_pool_count: number
}

export interface AdmissionControlResult {
  admitted: boolean
  reason?: string
  available_cpu: number
  available_memory_mb: number
  requested_cpu: number
  requested_memory_mb: number
}

const API_BASE = '/api'

// Resource pool CRUD

export async function listPools(clusterId?: string): Promise<ResourcePool[]> {
  const url = clusterId
    ? `${API_BASE}/resource-pools?cluster_id=${clusterId}`
    : `${API_BASE}/resource-pools`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch resource pools')
  return res.json()
}

export async function createPool(req: {
  name: string
  cluster_id: string
  parent_id?: string
  cpu_reservation?: number
  cpu_limit?: number
  cpu_shares?: number
  memory_reservation_mb?: number
  memory_limit_mb?: number
  memory_shares?: number
  expandable_reservation?: boolean
}): Promise<ResourcePool> {
  const res = await fetch(`${API_BASE}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create resource pool')
  return res.json()
}

export async function getPool(id: string): Promise<ResourcePool> {
  const res = await fetch(`${API_BASE}/resource-pools/${id}`)
  if (!res.ok) throw new Error('Failed to fetch resource pool')
  return res.json()
}

export async function updatePool(id: string, req: Partial<ResourcePool>): Promise<ResourcePool> {
  const res = await fetch(`${API_BASE}/resource-pools/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to update resource pool')
  return res.json()
}

export async function deletePool(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/resource-pools/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete resource pool')
}

export async function getPoolSummary(id: string): Promise<ResourcePoolSummary> {
  const res = await fetch(`${API_BASE}/resource-pools/${id}/summary`)
  if (!res.ok) throw new Error('Failed to fetch resource pool summary')
  return res.json()
}

// VM assignment

export async function assignVm(poolId: string, vmId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/resource-pools/${poolId}/vms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vm_id: vmId }),
  })
  if (!res.ok) throw new Error('Failed to assign VM to resource pool')
}

export async function unassignVm(poolId: string, vmId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/resource-pools/${poolId}/vms/${vmId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to unassign VM from resource pool')
}

export async function moveVm(vmId: string, fromPoolId: string, toPoolId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/resource-pools/move-vm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vm_id: vmId,
      from_pool_id: fromPoolId,
      to_pool_id: toPoolId,
    }),
  })
  if (!res.ok) throw new Error('Failed to move VM between resource pools')
}

// Admission control

export async function checkAdmission(poolId: string, req: {
  cpu: number
  memory_mb: number
}): Promise<AdmissionControlResult> {
  const res = await fetch(`${API_BASE}/resource-pools/${poolId}/check-admission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to check admission control')
  return res.json()
}
