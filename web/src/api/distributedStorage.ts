import { apiGet, apiPost, apiDelete } from './client'

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

export async function listDistributedPools(): Promise<DistributedStoragePool[]> {
  return apiGet<DistributedStoragePool[]>(`${API_BASE}/distributed-storage/pools`)
}

export async function createDistributedPool(req: {
  name: string
  pool_type: string
  hosts: string[]
  replication_factor?: number
  erasure_coding?: boolean
}): Promise<DistributedStoragePool> {
  return apiPost<DistributedStoragePool>(`${API_BASE}/distributed-storage/pools`, req)
}

export async function deleteDistributedPool(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/distributed-storage/pools/${id}`)
}

// Storage migrations

export async function startStorageMigration(req: {
  vm_id: string
  source_pool_id: string
  target_pool_id: string
  policy_id?: string
}): Promise<StorageMigration> {
  return apiPost<StorageMigration>(`${API_BASE}/distributed-storage/migrations`, req)
}

export async function listStorageMigrations(status?: string): Promise<StorageMigration[]> {
  const url = status
    ? `${API_BASE}/distributed-storage/migrations?status=${status}`
    : `${API_BASE}/distributed-storage/migrations`
  return apiGet<StorageMigration[]>(url)
}

// Storage policies

export async function listStoragePolicies(): Promise<StoragePolicy[]> {
  return apiGet<StoragePolicy[]>(`${API_BASE}/distributed-storage/policies`)
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
  return apiPost<StoragePolicy>(`${API_BASE}/distributed-storage/policies`, req)
}

export async function deleteStoragePolicy(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/distributed-storage/policies/${id}`)
}

// Compliance

export async function checkCompliance(vmId: string, policyId: string): Promise<ComplianceReport> {
  return apiPost<ComplianceReport>(`${API_BASE}/distributed-storage/compliance/check`, { vm_id: vmId, policy_id: policyId })
}

// Datastore clusters

export async function listDatastoreClusters(): Promise<DatastoreCluster[]> {
  return apiGet<DatastoreCluster[]>(`${API_BASE}/distributed-storage/datastore-clusters`)
}

export async function createDatastoreCluster(req: {
  name: string
  description?: string
  storage_pool_ids: string[]
  sdrs_enabled?: boolean
  space_threshold_pct?: number
  io_latency_threshold_ms?: number
}): Promise<DatastoreCluster> {
  return apiPost<DatastoreCluster>(`${API_BASE}/distributed-storage/datastore-clusters`, req)
}
