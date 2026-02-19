import { API_BASE_URL } from './config'

export interface NfsConfig {
  server: string
  export_path: string
  mount_path: string
  mount_options: string[]
  auto_start: boolean
  nfs_version: 'V3' | 'V4' | 'V4_1' | 'V4_2'
}

export interface StoragePool {
  id: string
  name: string
  pool_type: 'Local' | 'Directory' | { NFS: { server: string; export_path: string; mount_options: string[] } }
  path: string
  capacity: number
  available: number
  state: 'Inactive' | 'Starting' | 'Active' | 'Stopping' | 'Degraded' | 'Failed'
  auto_start: boolean
  created: string
  updated: string
}

export interface NfsStats {
  total_kb: number
  used_kb: number
  available_kb: number
  use_percent: number
  mount_point: string
}

export interface NfsHealth {
  status: 'Healthy' | 'ServerUnreachable' | 'Unmounted' | 'Degraded'
  server_reachable: boolean
  is_mounted: boolean
  last_check: string
}

export interface CreateNfsPoolRequest {
  name: string
  config: NfsConfig
}

export interface CreateLocalPoolRequest {
  name: string
  path: string
  auto_start: boolean
}

// List all storage pools
export async function listStoragePools(): Promise<StoragePool[]> {
  const response = await fetch(`${API_BASE_URL}/storage/pools`)
  if (!response.ok) {
    throw new Error('Failed to list storage pools')
  }
  return response.json()
}

// Get storage pool details
export async function getStoragePool(name: string): Promise<StoragePool> {
  const response = await fetch(`${API_BASE_URL}/storage/pools/${name}`)
  if (!response.ok) {
    throw new Error(`Failed to get storage pool: ${name}`)
  }
  return response.json()
}

// Create local storage pool
export async function createLocalPool(request: CreateLocalPoolRequest): Promise<StoragePool> {
  const response = await fetch(`${API_BASE_URL}/storage/pools/local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new Error('Failed to create local pool')
  }
  return response.json()
}

// Create NFS storage pool
export async function createNfsPool(request: CreateNfsPoolRequest): Promise<StoragePool> {
  const response = await fetch(`${API_BASE_URL}/storage/pools/nfs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to create NFS pool: ${error}`)
  }
  return response.json()
}

// Delete storage pool
export async function deleteStoragePool(name: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/storage/pools/${name}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error(`Failed to delete storage pool: ${name}`)
  }
}

// Start storage pool
export async function startStoragePool(name: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/storage/pools/${name}/start`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(`Failed to start storage pool: ${name}`)
  }
}

// Stop storage pool
export async function stopStoragePool(name: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/storage/pools/${name}/stop`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(`Failed to stop storage pool: ${name}`)
  }
}

// Get NFS pool health
export async function getNfsHealth(name: string): Promise<NfsHealth> {
  const response = await fetch(`${API_BASE_URL}/storage/pools/${name}/health`)
  if (!response.ok) {
    throw new Error(`Failed to get NFS health for: ${name}`)
  }
  return response.json()
}

// Get NFS pool stats
export async function getNfsStats(name: string): Promise<NfsStats> {
  const response = await fetch(`${API_BASE_URL}/storage/pools/${name}/stats`)
  if (!response.ok) {
    throw new Error(`Failed to get NFS stats for: ${name}`)
  }
  return response.json()
}

// Refresh pool statistics
export async function refreshPoolStats(name: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/storage/pools/${name}/refresh`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(`Failed to refresh pool stats: ${name}`)
  }
}
