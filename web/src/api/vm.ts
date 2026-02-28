import { apiGet, apiPost, apiPostVoid, apiPutVoid, apiDelete } from './client'

export interface VM {
  name: string
  state: 'running' | 'stopped' | 'paused' | 'unknown'
  cpus: number
  memory: number
  image: string
  ip?: string
  pid?: number
  tags?: string[]
}

export interface CreateVMRequest {
  name: string
  image: string
  cpus: number
  memory: number
}

export interface VMMetrics {
  cpu_usage: number
  memory_usage: number
  disk_usage: number
  network_rx: number
  network_tx: number
}

const API_BASE = '/api'

export async function listVMs(): Promise<VM[]> {
  return apiGet<VM[]>(`${API_BASE}/vms`)
}

export async function getVM(name: string): Promise<VM> {
  return apiGet<VM>(`${API_BASE}/vms/${name}`)
}

export async function createVM(req: CreateVMRequest): Promise<VM> {
  return apiPost<VM>(`${API_BASE}/vms`, req)
}

export async function deleteVM(name: string): Promise<void> {
  return apiDelete(`${API_BASE}/vms/${name}`)
}

export async function startVM(name: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/vms/${name}/start`)
}

export async function stopVM(name: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/vms/${name}/stop`)
}

export async function restartVM(name: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/vms/${name}/restart`)
}

export async function pauseVM(name: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/vms/${name}/pause`)
}

export async function resumeVM(name: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/vms/${name}/resume`)
}

export async function getMetrics(name: string): Promise<VMMetrics> {
  return apiGet<VMMetrics>(`${API_BASE}/vms/${name}/metrics`)
}

export async function cloneVM(sourceName: string, targetName: string, options?: {
  includeSnapshots?: boolean
  linkedClone?: boolean
}): Promise<void> {
  return apiPostVoid(`${API_BASE}/vms/${sourceName}/clone`, {
    target_name: targetName,
    include_snapshots: options?.includeSnapshots ?? false,
    linked_clone: options?.linkedClone ?? false,
  })
}

// Tag Management
export async function addTag(vmName: string, tag: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/vms/${vmName}/tags`, { tag })
}

export async function removeTag(vmName: string, tag: string): Promise<void> {
  return apiDelete(`${API_BASE}/vms/${vmName}/tags/${tag}`)
}

export async function updateTags(vmName: string, tags: string[]): Promise<void> {
  return apiPutVoid(`${API_BASE}/vms/${vmName}/tags`, { tags })
}
