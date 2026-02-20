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
  const res = await fetch(`${API_BASE}/encryption/providers`)
  if (!res.ok) throw new Error('Failed to fetch key providers')
  return res.json()
}

export async function registerProvider(req: {
  name: string
  provider_type: string
  endpoint: string
  default_provider?: boolean
}): Promise<KeyProvider> {
  const res = await fetch(`${API_BASE}/encryption/providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to register key provider')
  return res.json()
}

export async function removeProvider(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/encryption/providers/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to remove key provider')
}

// Encryption policies

export async function listEncryptionPolicies(): Promise<EncryptionPolicy[]> {
  const res = await fetch(`${API_BASE}/encryption/policies`)
  if (!res.ok) throw new Error('Failed to fetch encryption policies')
  return res.json()
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
  const res = await fetch(`${API_BASE}/encryption/policies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create encryption policy')
  return res.json()
}

// VM encryption operations

export async function encryptVm(vmId: string, policyId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/encryption/vms/${vmId}/encrypt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy_id: policyId }),
  })
  if (!res.ok) throw new Error('Failed to encrypt VM')
}

export async function decryptVm(vmId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/encryption/vms/${vmId}/decrypt`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to decrypt VM')
}

export async function getVmEncryptionStatus(vmId: string): Promise<VmEncryptionStatus> {
  const res = await fetch(`${API_BASE}/encryption/vms/${vmId}/status`)
  if (!res.ok) throw new Error('Failed to fetch VM encryption status')
  return res.json()
}

export async function listEncryptedVms(): Promise<VmEncryptionStatus[]> {
  const res = await fetch(`${API_BASE}/encryption/vms`)
  if (!res.ok) throw new Error('Failed to fetch encrypted VMs')
  return res.json()
}

export async function rotateVmKey(vmId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/encryption/vms/${vmId}/rotate-key`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to rotate VM encryption key')
}
