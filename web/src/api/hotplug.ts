import { API_BASE_URL } from './config'
import { apiFetch } from './client'

export interface HotplugCpuRequest {
  count: number
}

export interface HotplugMemoryRequest {
  size_mb: number
}

export interface HotplugDiskRequest {
  path: string
  bus?: string
}

export interface HotplugNicRequest {
  bridge: string
  model?: string
}

export async function hotplugCpu(vmName: string, req: HotplugCpuRequest): Promise<unknown> {
  const res = await apiFetch(`${API_BASE_URL}/vms/${vmName}/hotplug/cpu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to hotplug CPU')
  return res.json()
}

export async function hotplugMemory(vmName: string, req: HotplugMemoryRequest): Promise<unknown> {
  const res = await apiFetch(`${API_BASE_URL}/vms/${vmName}/hotplug/memory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to hotplug memory')
  return res.json()
}

export async function hotplugDisk(vmName: string, req: HotplugDiskRequest): Promise<unknown> {
  const res = await apiFetch(`${API_BASE_URL}/vms/${vmName}/hotplug/disk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to hotplug disk')
  return res.json()
}

export async function hotremoveDisk(vmName: string, deviceId: string): Promise<unknown> {
  const res = await apiFetch(`${API_BASE_URL}/vms/${vmName}/hotplug/disk/${deviceId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to hot-remove disk')
  return res.json()
}

export async function hotplugNic(vmName: string, req: HotplugNicRequest): Promise<unknown> {
  const res = await apiFetch(`${API_BASE_URL}/vms/${vmName}/hotplug/nic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to hotplug NIC')
  return res.json()
}

export async function hotremoveNic(vmName: string, deviceId: string): Promise<unknown> {
  const res = await apiFetch(`${API_BASE_URL}/vms/${vmName}/hotplug/nic/${deviceId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to hot-remove NIC')
  return res.json()
}
