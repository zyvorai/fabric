import { API_BASE_URL } from './config'
import { apiFetch } from './client'

export interface Volume {
  id: string
  pool_name: string
  name: string
  size: string
  vm_attached: string | null
  created: string
  updated: string
}

export interface CreateVolumeRequest {
  name: string
  size: string
}

export interface ResizeVolumeRequest {
  size: string
}

export interface AttachVolumeRequest {
  vm_name: string
}

export async function listVolumes(poolName: string): Promise<Volume[]> {
  const res = await apiFetch(`${API_BASE_URL}/storage/pools/${poolName}/volumes`)
  if (!res.ok) throw new Error('Failed to list volumes')
  return res.json()
}

export async function createVolume(poolName: string, req: CreateVolumeRequest): Promise<Volume> {
  const res = await apiFetch(`${API_BASE_URL}/storage/pools/${poolName}/volumes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create volume')
  return res.json()
}

export async function getVolume(poolName: string, id: string): Promise<Volume> {
  const res = await apiFetch(`${API_BASE_URL}/storage/pools/${poolName}/volumes/${id}`)
  if (!res.ok) throw new Error('Failed to get volume')
  return res.json()
}

export async function deleteVolume(poolName: string, id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/storage/pools/${poolName}/volumes/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete volume')
}

export async function resizeVolume(poolName: string, id: string, req: ResizeVolumeRequest): Promise<Volume> {
  const res = await apiFetch(`${API_BASE_URL}/storage/pools/${poolName}/volumes/${id}/resize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to resize volume')
  return res.json()
}

export async function attachVolume(poolName: string, id: string, req: AttachVolumeRequest): Promise<Volume> {
  const res = await apiFetch(`${API_BASE_URL}/storage/pools/${poolName}/volumes/${id}/attach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to attach volume')
  return res.json()
}

export async function detachVolume(poolName: string, id: string): Promise<Volume> {
  const res = await apiFetch(`${API_BASE_URL}/storage/pools/${poolName}/volumes/${id}/detach`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to detach volume')
  return res.json()
}
