import { apiFetch } from "./client"
export interface Backup {
  id: string
  vm_name: string
  backup_type: 'full' | 'incremental'
  size_bytes: number
  compressed: boolean
  created: string
  status: 'completed' | 'in_progress' | 'failed'
  storage_location: string
  retention_days: number
  expires_at?: string
  metadata?: Record<string, any>
}

export interface CreateBackupRequest {
  vm_name: string
  backup_type: 'full' | 'incremental'
  compress?: boolean
  retention_days?: number
  description?: string
}

export interface RestoreOptions {
  backup_id: string
  target_vm_name?: string
  restore_config?: boolean
  restore_disks?: boolean
  restore_state?: boolean
}

export interface BackupJob {
  id: string
  backup_id?: string
  vm_name: string
  operation: 'backup' | 'restore'
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress: number
  started_at?: string
  completed_at?: string
  error?: string
}

export interface BackupPolicy {
  id: string
  name: string
  vm_tags?: string[]
  schedule_type: 'daily' | 'weekly' | 'monthly'
  backup_type: 'full' | 'incremental'
  retention_days: number
  enabled: boolean
  last_run?: string
  next_run?: string
}

const API_BASE = '/api'

export async function listBackups(vmName?: string): Promise<Backup[]> {
  const url = vmName ? `${API_BASE}/backups?vm=${vmName}` : `${API_BASE}/backups`
  const res = await apiFetch(url)
  if (!res.ok) throw new Error('Failed to fetch backups')
  return res.json()
}

export async function getBackup(id: string): Promise<Backup> {
  const res = await apiFetch(`${API_BASE}/backups/${id}`)
  if (!res.ok) throw new Error('Failed to fetch backup')
  return res.json()
}

export async function createBackup(req: CreateBackupRequest): Promise<BackupJob> {
  const res = await apiFetch(`${API_BASE}/backups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create backup')
  return res.json()
}

export async function deleteBackup(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/backups/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete backup')
}

export async function restoreBackup(options: RestoreOptions): Promise<BackupJob> {
  const res = await apiFetch(`${API_BASE}/backups/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  if (!res.ok) throw new Error('Failed to restore backup')
  return res.json()
}

export async function getBackupJobs(): Promise<BackupJob[]> {
  const res = await apiFetch(`${API_BASE}/backups/jobs`)
  if (!res.ok) throw new Error('Failed to fetch backup jobs')
  return res.json()
}

export async function getBackupJob(id: string): Promise<BackupJob> {
  const res = await apiFetch(`${API_BASE}/backups/jobs/${id}`)
  if (!res.ok) throw new Error('Failed to fetch backup job')
  return res.json()
}

export async function listBackupPolicies(): Promise<BackupPolicy[]> {
  const res = await apiFetch(`${API_BASE}/backups/policies`)
  if (!res.ok) throw new Error('Failed to fetch backup policies')
  return res.json()
}

export async function createBackupPolicy(policy: Omit<BackupPolicy, 'id' | 'last_run' | 'next_run'>): Promise<BackupPolicy> {
  const res = await apiFetch(`${API_BASE}/backups/policies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(policy),
  })
  if (!res.ok) throw new Error('Failed to create backup policy')
  return res.json()
}

export async function deleteBackupPolicy(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/backups/policies/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete backup policy')
}

export async function enableBackupPolicy(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/backups/policies/${id}/enable`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to enable backup policy')
}

export async function disableBackupPolicy(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/backups/policies/${id}/disable`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to disable backup policy')
}

export interface BackupStats {
  total_backups: number
  total_size_bytes: number
  by_type: Record<string, number>
  by_vm: Record<string, number>
  oldest_backup: string
  newest_backup: string
}

export async function getBackupStats(): Promise<BackupStats> {
  const res = await apiFetch(`${API_BASE}/backups/stats`)
  if (!res.ok) throw new Error('Failed to fetch backup stats')
  return res.json()
}
