import { apiFetch } from "./client"
const API_BASE = '/api'

export interface ImageBuildRequest {
  name: string
  distribution: string
  packages?: string[]
  autologin?: boolean
}

export interface ImageBuildStatus {
  id: string
  name: string
  distribution: string
  state: 'pending' | 'building' | 'completed' | 'failed'
  output_path?: string
  error?: string
  started: string
  completed?: string
}

export interface ImageInfo {
  name: string
  path: string
  format: string
  size_bytes: number
}

export async function buildImage(req: ImageBuildRequest): Promise<ImageBuildStatus> {
  const res = await apiFetch(`${API_BASE}/images/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to start image build')
  return res.json()
}

export async function listBuilds(): Promise<ImageBuildStatus[]> {
  const res = await apiFetch(`${API_BASE}/images/builds`)
  if (!res.ok) throw new Error('Failed to list builds')
  return res.json()
}

export async function listImages(): Promise<ImageInfo[]> {
  const res = await apiFetch(`${API_BASE}/images`)
  if (!res.ok) throw new Error('Failed to list images')
  return res.json()
}
