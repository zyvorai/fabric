import { API_BASE_URL } from './config'
import { apiFetch } from './client'

export interface VMSnapshot {
  id: string
  vm_name: string
  name: string
  description: string | null
  snapshot_type: 'Disk' | 'Full'
  parent_id: string | null
  size_bytes: number
  created: string
}

export interface SnapshotTreeNode {
  snapshot: VMSnapshot
  children: SnapshotTreeNode[]
}

export interface CreateSnapshotRequest {
  name: string
  description?: string
  snapshot_type?: 'Disk' | 'Full'
}

export async function listSnapshots(vmName: string): Promise<VMSnapshot[]> {
  const res = await apiFetch(`${API_BASE_URL}/vms/${vmName}/snapshots`)
  if (!res.ok) throw new Error('Failed to list snapshots')
  return res.json()
}

export async function createSnapshot(vmName: string, req: CreateSnapshotRequest): Promise<VMSnapshot> {
  const res = await apiFetch(`${API_BASE_URL}/vms/${vmName}/snapshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create snapshot')
  return res.json()
}

export async function getSnapshot(vmName: string, id: string): Promise<VMSnapshot> {
  const res = await apiFetch(`${API_BASE_URL}/vms/${vmName}/snapshots/${id}`)
  if (!res.ok) throw new Error('Failed to get snapshot')
  return res.json()
}

export async function deleteSnapshot(vmName: string, id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/vms/${vmName}/snapshots/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete snapshot')
}

export async function revertSnapshot(vmName: string, id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/vms/${vmName}/snapshots/${id}/revert`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to revert snapshot')
}

export async function getSnapshotTree(vmName: string): Promise<SnapshotTreeNode[]> {
  const res = await apiFetch(`${API_BASE_URL}/vms/${vmName}/snapshots/tree`)
  if (!res.ok) throw new Error('Failed to get snapshot tree')
  return res.json()
}
