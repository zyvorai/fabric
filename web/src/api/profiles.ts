import { apiFetch } from "./client"
const API_BASE = '/api'

export interface VMProfile {
  name: string
  description: string
  cpus: number
  memory: number
  disk: number
  category: 'general' | 'compute' | 'memory' | 'storage' | 'gpu'
  network_bandwidth?: string
  builtin: boolean
}

export async function listProfiles(): Promise<VMProfile[]> {
  const res = await apiFetch(`${API_BASE}/profiles`)
  if (!res.ok) throw new Error('Failed to list profiles')
  return res.json()
}

export async function createProfile(req: Omit<VMProfile, 'builtin'>): Promise<VMProfile> {
  const res = await apiFetch(`${API_BASE}/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create profile')
  return res.json()
}

export async function deleteProfile(name: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/profiles/${name}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete profile')
}
