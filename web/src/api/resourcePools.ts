// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { apiGet, apiPost, apiPut, apiPostVoid, apiDelete } from './client'

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
  return apiGet<ResourcePool[]>(url)
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
  return apiPost<ResourcePool>(`${API_BASE}/resource-pools`, req)
}

export async function getPool(id: string): Promise<ResourcePool> {
  return apiGet<ResourcePool>(`${API_BASE}/resource-pools/${id}`)
}

export async function updatePool(id: string, req: Partial<ResourcePool>): Promise<ResourcePool> {
  return apiPut<ResourcePool>(`${API_BASE}/resource-pools/${id}`, req)
}

export async function deletePool(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/resource-pools/${id}`)
}

export async function getPoolSummary(id: string): Promise<ResourcePoolSummary> {
  return apiGet<ResourcePoolSummary>(`${API_BASE}/resource-pools/${id}/summary`)
}

// VM assignment

export async function assignVm(poolId: string, vmId: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/resource-pools/${poolId}/vms`, { vm_id: vmId })
}

export async function unassignVm(poolId: string, vmId: string): Promise<void> {
  return apiDelete(`${API_BASE}/resource-pools/${poolId}/vms/${vmId}`)
}

export async function moveVm(vmId: string, fromPoolId: string, toPoolId: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/resource-pools/move-vm`, {
    vm_id: vmId,
    from_pool_id: fromPoolId,
    to_pool_id: toPoolId,
  })
}

// Admission control

export async function checkAdmission(poolId: string, req: {
  cpu: number
  memory_mb: number
}): Promise<AdmissionControlResult> {
  return apiPost<AdmissionControlResult>(`${API_BASE}/resource-pools/${poolId}/check-admission`, req)
}
