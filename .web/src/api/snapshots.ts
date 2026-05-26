// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { apiGet, apiPost, apiPostVoid, apiDelete } from './client'
import { API_BASE_URL } from './config'

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
  return apiGet<VMSnapshot[]>(`${API_BASE_URL}/vms/${vmName}/snapshots`)
}

export async function createSnapshot(vmName: string, req: CreateSnapshotRequest): Promise<VMSnapshot> {
  return apiPost<VMSnapshot>(`${API_BASE_URL}/vms/${vmName}/snapshots`, req)
}

export async function getSnapshot(vmName: string, id: string): Promise<VMSnapshot> {
  return apiGet<VMSnapshot>(`${API_BASE_URL}/vms/${vmName}/snapshots/${id}`)
}

export async function deleteSnapshot(vmName: string, id: string): Promise<void> {
  return apiDelete(`${API_BASE_URL}/vms/${vmName}/snapshots/${id}`)
}

export async function revertSnapshot(vmName: string, id: string): Promise<void> {
  return apiPostVoid(`${API_BASE_URL}/vms/${vmName}/snapshots/${id}/revert`)
}

export async function getSnapshotTree(vmName: string): Promise<SnapshotTreeNode[]> {
  return apiGet<SnapshotTreeNode[]>(`${API_BASE_URL}/vms/${vmName}/snapshots/tree`)
}
