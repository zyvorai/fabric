const API_BASE = '/api'

export interface VMTemplate {
  id: string
  name: string
  description?: string
  cpus: number
  memory: number
  disk: number
  image: string
  cloud_init?: unknown
  tags: string[]
  created: string
  updated: string
}

export interface CreateTemplateRequest {
  name: string
  description?: string
  cpus: number
  memory: number
  disk: number
  image: string
  cloud_init?: unknown
  tags?: string[]
  from_vm?: string
}

export interface DeployTemplateRequest {
  vm_name: string
}

export async function listTemplates(): Promise<VMTemplate[]> {
  const res = await fetch(`${API_BASE}/templates`)
  if (!res.ok) throw new Error('Failed to fetch templates')
  return res.json()
}

export async function getTemplate(id: string): Promise<VMTemplate> {
  const res = await fetch(`${API_BASE}/templates/${id}`)
  if (!res.ok) throw new Error('Failed to fetch template')
  return res.json()
}

export async function createTemplate(req: CreateTemplateRequest): Promise<VMTemplate> {
  const res = await fetch(`${API_BASE}/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create template')
  return res.json()
}

export async function updateTemplate(id: string, req: Partial<CreateTemplateRequest>): Promise<VMTemplate> {
  const res = await fetch(`${API_BASE}/templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to update template')
  return res.json()
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/templates/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete template')
}

export async function deployTemplate(id: string, vmName: string): Promise<void> {
  const res = await fetch(`${API_BASE}/templates/${id}/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vm_name: vmName }),
  })
  if (!res.ok) throw new Error('Failed to deploy template')
}
