import { apiGet, apiPost, apiPostVoid, apiDelete } from './client'

export interface KeyProvider {
  id: string
  name: string
  provider_type: string
  endpoint: string
  status: string
  key_count: number
  default_provider: boolean
  created: string
  updated?: string
}

export interface EncryptionPolicy {
  id: string
  name: string
  description?: string
  provider_id: string
  algorithm: string
  key_size: number
  auto_rotate: boolean
  rotation_interval_days?: number
  enabled: boolean
  created: string
  updated?: string
}

export interface VmEncryptionStatus {
  vm_id: string
  vm_name: string
  encrypted: boolean
  policy_id?: string
  policy_name?: string
  provider_id?: string
  algorithm?: string
  key_id?: string
  encrypted_at?: string
  last_key_rotation?: string
}

const API_BASE = '/api'

// Key providers

export async function listProviders(): Promise<KeyProvider[]> {
  return apiGet<KeyProvider[]>(`${API_BASE}/encryption/providers`)
}

export async function registerProvider(req: {
  name: string
  provider_type: string
  endpoint: string
  default_provider?: boolean
}): Promise<KeyProvider> {
  return apiPost<KeyProvider>(`${API_BASE}/encryption/providers`, req)
}

export async function removeProvider(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/encryption/providers/${id}`)
}

// Encryption policies

export async function listEncryptionPolicies(): Promise<EncryptionPolicy[]> {
  return apiGet<EncryptionPolicy[]>(`${API_BASE}/encryption/policies`)
}

export async function createEncryptionPolicy(req: {
  name: string
  description?: string
  provider_id: string
  algorithm: string
  key_size: number
  auto_rotate?: boolean
  rotation_interval_days?: number
  enabled?: boolean
}): Promise<EncryptionPolicy> {
  return apiPost<EncryptionPolicy>(`${API_BASE}/encryption/policies`, req)
}

// VM encryption operations

export async function encryptVm(vmId: string, policyId: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/encryption/vms/${vmId}/encrypt`, { policy_id: policyId })
}

export async function decryptVm(vmId: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/encryption/vms/${vmId}/decrypt`)
}

export async function getVmEncryptionStatus(vmId: string): Promise<VmEncryptionStatus> {
  return apiGet<VmEncryptionStatus>(`${API_BASE}/encryption/vms/${vmId}/status`)
}

export async function listEncryptedVms(): Promise<VmEncryptionStatus[]> {
  return apiGet<VmEncryptionStatus[]>(`${API_BASE}/encryption/vms`)
}

export async function rotateVmKey(vmId: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/encryption/vms/${vmId}/rotate-key`)
}
