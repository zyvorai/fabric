import { apiFetch } from "./client"
const API_BASE = '/api'

export interface ScalingPolicy {
  vm_name: string
  enabled: boolean
  cpu_scale_up_threshold?: number
  cpu_scale_down_threshold?: number
  memory_scale_up_threshold?: number
  memory_scale_down_threshold?: number
  min_cpus: number
  max_cpus: number
  min_memory_mb: number
  max_memory_mb: number
  cooldown_secs: number
  last_scale_action?: string
  created: string
}

export interface ScaleEvent {
  id: string
  vm_name: string
  action: 'scale_up' | 'scale_down'
  resource: string
  from_value: string
  to_value: string
  reason: string
  timestamp: string
}

export async function listPolicies(): Promise<ScalingPolicy[]> {
  const res = await apiFetch(`${API_BASE}/autoscale`)
  if (!res.ok) throw new Error('Failed to list policies')
  return res.json()
}

export async function createPolicy(policy: Omit<ScalingPolicy, 'enabled' | 'created' | 'last_scale_action'>): Promise<ScalingPolicy> {
  const res = await apiFetch(`${API_BASE}/autoscale`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(policy),
  })
  if (!res.ok) throw new Error('Failed to create policy')
  return res.json()
}

export async function deletePolicy(vmName: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/autoscale/${vmName}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete policy')
}

export async function listScaleEvents(): Promise<ScaleEvent[]> {
  const res = await apiFetch(`${API_BASE}/autoscale/events`)
  if (!res.ok) throw new Error('Failed to list events')
  return res.json()
}
