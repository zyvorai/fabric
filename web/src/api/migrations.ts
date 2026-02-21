const API_BASE = '/api'

export type MigrationType = 'live' | 'offline' | 'storage'
export type MigrationState = 'pending' | 'precheck' | 'syncing' | 'switching' | 'completed' | 'failed' | 'cancelled'

export interface MigrationRequest {
  vm_name: string
  target_host: string
  migration_type: MigrationType
  compress?: boolean
  bandwidth_mbps?: number
}

export interface MigrationStatus {
  id: string
  vm_name: string
  target_host: string
  migration_type: MigrationType
  state: MigrationState
  progress_percent: number
  bytes_transferred: number
  started: string
  completed?: string
  error?: string
}

export async function startMigration(req: MigrationRequest): Promise<MigrationStatus> {
  const res = await fetch(`${API_BASE}/migrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to start migration')
  return res.json()
}

export async function listMigrations(): Promise<MigrationStatus[]> {
  const res = await fetch(`${API_BASE}/migrations`)
  if (!res.ok) throw new Error('Failed to fetch migrations')
  return res.json()
}

export async function getMigration(id: string): Promise<MigrationStatus> {
  const res = await fetch(`${API_BASE}/migrations/${id}`)
  if (!res.ok) throw new Error('Failed to fetch migration')
  return res.json()
}

export async function cancelMigration(id: string): Promise<MigrationStatus> {
  const res = await fetch(`${API_BASE}/migrations/${id}/cancel`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to cancel migration')
  return res.json()
}
