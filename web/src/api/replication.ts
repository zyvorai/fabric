export interface ReplicationSite {
  id: string
  name: string
  description?: string
  endpoint: string
  site_type: 'primary' | 'secondary' | 'bidirectional'
  status: string
  replication_count: number
  last_sync?: string
  created: string
  updated?: string
}

export interface ReplicationConfig {
  id: string
  vm_id: string
  vm_name: string
  source_site_id: string
  target_site_id: string
  rpo_minutes: number
  quiesce: boolean
  compression_enabled: boolean
  encryption_enabled: boolean
  bandwidth_limit_mbps?: number
  status: 'active' | 'paused' | 'error' | 'initial_sync' | 'disabled'
  last_sync?: string
  next_sync?: string
  sync_progress_pct?: number
  created: string
  updated?: string
}

export interface ReplicationMetrics {
  replication_id: string
  vm_id: string
  vm_name: string
  avg_sync_time_seconds: number
  last_sync_size_bytes: number
  total_bytes_transferred: number
  sync_count: number
  failure_count: number
  current_rpo_minutes: number
  rpo_target_minutes: number
  rpo_compliant: boolean
  bandwidth_usage_mbps: number
  collected_at: string
}

export interface ReplicationHealthSummary {
  total_replications: number
  active: number
  paused: number
  error: number
  rpo_violations: number
  avg_rpo_minutes: number
  total_bytes_transferred_24h: number
  sites: Array<{
    site_id: string
    site_name: string
    replication_count: number
    health: string
  }>
}

const API_BASE = '/api'

// Sites

export async function listSites(): Promise<ReplicationSite[]> {
  const res = await fetch(`${API_BASE}/replication/sites`)
  if (!res.ok) throw new Error('Failed to fetch replication sites')
  return res.json()
}

export async function registerSite(req: {
  name: string
  description?: string
  endpoint: string
  site_type: 'primary' | 'secondary' | 'bidirectional'
}): Promise<ReplicationSite> {
  const res = await fetch(`${API_BASE}/replication/sites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to register replication site')
  return res.json()
}

export async function removeSite(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/replication/sites/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to remove replication site')
}

// Replication configurations

export async function listReplications(siteId?: string): Promise<ReplicationConfig[]> {
  const url = siteId
    ? `${API_BASE}/replication/configs?site_id=${siteId}`
    : `${API_BASE}/replication/configs`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch replications')
  return res.json()
}

export async function configureReplication(req: {
  vm_id: string
  source_site_id: string
  target_site_id: string
  rpo_minutes: number
  quiesce?: boolean
  compression_enabled?: boolean
  encryption_enabled?: boolean
  bandwidth_limit_mbps?: number
}): Promise<ReplicationConfig> {
  const res = await fetch(`${API_BASE}/replication/configs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to configure replication')
  return res.json()
}

export async function pauseReplication(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/replication/configs/${id}/pause`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to pause replication')
}

export async function resumeReplication(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/replication/configs/${id}/resume`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to resume replication')
}

// Metrics

export async function getReplicationMetrics(replicationId: string): Promise<ReplicationMetrics> {
  const res = await fetch(`${API_BASE}/replication/configs/${replicationId}/metrics`)
  if (!res.ok) throw new Error('Failed to fetch replication metrics')
  return res.json()
}

export async function checkRpoViolations(): Promise<ReplicationMetrics[]> {
  const res = await fetch(`${API_BASE}/replication/rpo-violations`)
  if (!res.ok) throw new Error('Failed to check RPO violations')
  return res.json()
}

// Health

export async function getReplicationHealth(): Promise<ReplicationHealthSummary> {
  const res = await fetch(`${API_BASE}/replication/health`)
  if (!res.ok) throw new Error('Failed to fetch replication health')
  return res.json()
}
