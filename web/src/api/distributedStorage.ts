import { apiFetch } from "./client"
export interface DistributedStoragePool {
  id: string
  name: string
  pool_type: string
  total_capacity_gb: number
  used_capacity_gb: number
  available_capacity_gb: number
  hosts: string[]
  replication_factor: number
  erasure_coding: boolean
  status: string
  health: string
  created: string
  updated?: string
}

export interface StoragePolicy {
  id: string
  name: string
  description?: string
  replication_factor: number
  stripe_width: number
  failure_tolerance: number
  encryption_enabled: boolean
  deduplication_enabled: boolean
  compression_enabled: boolean
  tier: 'performance' | 'standard' | 'archive'
  iops_limit?: number
  throughput_limit_mbps?: number
  created: string
  updated?: string
}

export interface StorageMigration {
  id: string
  vm_id: string
  vm_name: string
  source_pool_id: string
  source_pool_name: string
  target_pool_id: string
  target_pool_name: string
  policy_id?: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  progress_pct: number
  bytes_migrated: number
  bytes_total: number
  started_at?: string
  completed_at?: string
  error?: string
}

export interface DatastoreCluster {
  id: string
  name: string
  description?: string
  storage_pool_ids: string[]
  sdrs_enabled: boolean
  space_threshold_pct: number
  io_latency_threshold_ms: number
  total_capacity_gb: number
  used_capacity_gb: number
  vm_count: number
  status: string
  created: string
  updated?: string
}

export interface ComplianceReport {
  id: string
  vm_id: string
  vm_name: string
  policy_id: string
  policy_name: string
  compliant: boolean
  violations: Array<{
    rule: string
    expected: string
    actual: string
    severity: 'warning' | 'error'
  }>
  checked_at: string
}

const API_BASE = '/api'

// Distributed storage pools

export async function listStoragePools(): Promise<DistributedStoragePool[]> {
  const res = await apiFetch(`${API_BASE}/distributed-storage/pools`)
  if (!res.ok) throw new Error('Failed to fetch distributed storage pools')
  return res.json()
}

export async function createStoragePool(req: {
  name: string
  pool_type: string
  hosts: string[]
  replication_factor?: number
  erasure_coding?: boolean
}): Promise<DistributedStoragePool> {
  const res = await apiFetch(`${API_BASE}/distributed-storage/pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create distributed storage pool')
  return res.json()
}

export async function deleteStoragePool(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/distributed-storage/pools/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete distributed storage pool')
}

// Storage migrations

export async function startStorageMigration(req: {
  vm_id: string
  source_pool_id: string
  target_pool_id: string
  policy_id?: string
}): Promise<StorageMigration> {
  const res = await apiFetch(`${API_BASE}/distributed-storage/migrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to start storage migration')
  return res.json()
}

export async function listStorageMigrations(status?: string): Promise<StorageMigration[]> {
  const url = status
    ? `${API_BASE}/distributed-storage/migrations?status=${status}`
    : `${API_BASE}/distributed-storage/migrations`
  const res = await apiFetch(url)
  if (!res.ok) throw new Error('Failed to fetch storage migrations')
  return res.json()
}

// Storage policies

export async function listStoragePolicies(): Promise<StoragePolicy[]> {
  const res = await apiFetch(`${API_BASE}/distributed-storage/policies`)
  if (!res.ok) throw new Error('Failed to fetch storage policies')
  return res.json()
}

export async function createStoragePolicy(req: {
  name: string
  description?: string
  replication_factor: number
  stripe_width?: number
  failure_tolerance?: number
  encryption_enabled?: boolean
  deduplication_enabled?: boolean
  compression_enabled?: boolean
  tier?: 'performance' | 'standard' | 'archive'
  iops_limit?: number
  throughput_limit_mbps?: number
}): Promise<StoragePolicy> {
  const res = await apiFetch(`${API_BASE}/distributed-storage/policies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create storage policy')
  return res.json()
}

export async function deleteStoragePolicy(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/distributed-storage/policies/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete storage policy')
}

// Compliance

export async function checkCompliance(vmId: string, policyId: string): Promise<ComplianceReport> {
  const res = await apiFetch(`${API_BASE}/distributed-storage/compliance/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vm_id: vmId, policy_id: policyId }),
  })
  if (!res.ok) throw new Error('Failed to check storage compliance')
  return res.json()
}

// Datastore clusters

export async function listDatastoreClusters(): Promise<DatastoreCluster[]> {
  const res = await apiFetch(`${API_BASE}/distributed-storage/datastore-clusters`)
  if (!res.ok) throw new Error('Failed to fetch datastore clusters')
  return res.json()
}

export async function createDatastoreCluster(req: {
  name: string
  description?: string
  storage_pool_ids: string[]
  sdrs_enabled?: boolean
  space_threshold_pct?: number
  io_latency_threshold_ms?: number
}): Promise<DatastoreCluster> {
  const res = await apiFetch(`${API_BASE}/distributed-storage/datastore-clusters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create datastore cluster')
  return res.json()
}
