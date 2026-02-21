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
  const res = await fetch(`${API_BASE}/vms`)
  if (!res.ok) throw new Error('Failed to fetch VMs')
  return res.json()
}

export async function getVM(name: string): Promise<VM> {
  const res = await fetch(`${API_BASE}/vms/${name}`)
  if (!res.ok) throw new Error('Failed to fetch VM')
  return res.json()
}

export async function createVM(req: CreateVMRequest): Promise<VM> {
  const res = await fetch(`${API_BASE}/vms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create VM')
  return res.json()
}

export async function deleteVM(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/vms/${name}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete VM')
}

export async function startVM(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/vms/${name}/start`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to start VM')
}

export async function stopVM(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/vms/${name}/stop`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to stop VM')
}

export async function restartVM(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/vms/${name}/restart`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to restart VM')
}

export async function pauseVM(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/vms/${name}/pause`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to pause VM')
}

export async function resumeVM(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/vms/${name}/resume`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to resume VM')
}

export async function getMetrics(name: string): Promise<VMMetrics> {
  const res = await fetch(`${API_BASE}/vms/${name}/metrics`)
  if (!res.ok) throw new Error('Failed to fetch metrics')
  return res.json()
}

export async function cloneVM(sourceName: string, targetName: string, options?: {
  includeSnapshots?: boolean
  linkedClone?: boolean
}): Promise<void> {
  const res = await fetch(`${API_BASE}/vms/${sourceName}/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target_name: targetName,
      include_snapshots: options?.includeSnapshots ?? false,
      linked_clone: options?.linkedClone ?? false,
    }),
  })
  if (!res.ok) throw new Error('Failed to clone VM')
}

export interface Template {
  name: string
  description: string
  cpus: number
  memory: number
  disk_size: number
  created: string
}

export async function createTemplate(vmName: string, templateName: string, description?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/vms/${vmName}/template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_name: templateName,
      description: description || ''
    }),
  })
  if (!res.ok) throw new Error('Failed to create template')
}

export async function listTemplates(): Promise<Template[]> {
  const res = await fetch(`${API_BASE}/templates`)
  if (!res.ok) throw new Error('Failed to fetch templates')
  return res.json()
}

export async function createVMFromTemplate(templateName: string, vmName: string): Promise<void> {
  const res = await fetch(`${API_BASE}/templates/${templateName}/instantiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vm_name: vmName }),
  })
  if (!res.ok) throw new Error('Failed to create VM from template')
}

export async function deleteTemplate(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/templates/${name}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete template')
}

// Tag Management
export async function addTag(vmName: string, tag: string): Promise<void> {
  const res = await fetch(`${API_BASE}/vms/${vmName}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag }),
  })
  if (!res.ok) throw new Error('Failed to add tag')
}

export async function removeTag(vmName: string, tag: string): Promise<void> {
  const res = await fetch(`${API_BASE}/vms/${vmName}/tags/${tag}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to remove tag')
}

export async function updateTags(vmName: string, tags: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/vms/${vmName}/tags`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  })
  if (!res.ok) throw new Error('Failed to update tags')
}
