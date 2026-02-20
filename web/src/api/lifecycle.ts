export interface Baseline {
  id: string
  name: string
  description?: string
  baseline_type: 'patch' | 'upgrade' | 'extension'
  release_date: string
  severity: 'critical' | 'important' | 'moderate' | 'low'
  patches: string[]
  host_count: number
  compliant_count: number
  created: string
  updated?: string
}

export interface HostComplianceStatus {
  id: string
  host_id: string
  hostname: string
  baseline_id: string
  baseline_name: string
  status: 'compliant' | 'non_compliant' | 'incompatible' | 'unknown'
  missing_patches: string[]
  installed_patches: string[]
  last_scanned: string
}

export interface RemediationTask {
  id: string
  host_id: string
  hostname: string
  baseline_id: string
  baseline_name: string
  status: 'pending' | 'pre_check' | 'maintenance_mode' | 'remediating' | 'rebooting' | 'completed' | 'failed'
  progress: number
  patches_applied: number
  patches_total: number
  started_at?: string
  completed_at?: string
  error?: string
}

export interface RollingUpdatePlan {
  id: string
  name: string
  description?: string
  baseline_id: string
  host_ids: string[]
  parallel_count: number
  failure_threshold: number
  pre_check_enabled: boolean
  auto_remediate: boolean
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed'
  completed_hosts: number
  failed_hosts: number
  total_hosts: number
  current_host?: string
  started_at?: string
  completed_at?: string
  error?: string
}

export interface ComplianceSummary {
  total_hosts: number
  compliant: number
  non_compliant: number
  incompatible: number
  unknown: number
  baselines: Array<{
    baseline_id: string
    baseline_name: string
    compliant_hosts: number
    total_hosts: number
  }>
  last_scan?: string
}

const API_BASE = '/api'

// Baselines

export async function listBaselines(): Promise<Baseline[]> {
  const res = await fetch(`${API_BASE}/lifecycle/baselines`)
  if (!res.ok) throw new Error('Failed to fetch baselines')
  return res.json()
}

export async function createBaseline(req: {
  name: string
  description?: string
  baseline_type: 'patch' | 'upgrade' | 'extension'
  severity: 'critical' | 'important' | 'moderate' | 'low'
  patches?: string[]
}): Promise<Baseline> {
  const res = await fetch(`${API_BASE}/lifecycle/baselines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create baseline')
  return res.json()
}

export async function deleteBaseline(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/lifecycle/baselines/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete baseline')
}

// Compliance scanning

export async function scanHostCompliance(baselineId: string, hostIds?: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/lifecycle/compliance/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseline_id: baselineId, host_ids: hostIds }),
  })
  if (!res.ok) throw new Error('Failed to scan host compliance')
}

export async function getComplianceStatus(baselineId?: string, hostId?: string): Promise<HostComplianceStatus[]> {
  const params = new URLSearchParams()
  if (baselineId) params.append('baseline_id', baselineId)
  if (hostId) params.append('host_id', hostId)
  const url = `${API_BASE}/lifecycle/compliance${params.toString() ? `?${params}` : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch compliance status')
  return res.json()
}

// Remediation

export async function listRemediations(): Promise<RemediationTask[]> {
  const res = await fetch(`${API_BASE}/lifecycle/remediations`)
  if (!res.ok) throw new Error('Failed to fetch remediation tasks')
  return res.json()
}

export async function createRemediation(req: {
  host_id: string
  baseline_id: string
}): Promise<RemediationTask> {
  const res = await fetch(`${API_BASE}/lifecycle/remediations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create remediation task')
  return res.json()
}

// Rolling updates

export async function listRollingUpdates(): Promise<RollingUpdatePlan[]> {
  const res = await fetch(`${API_BASE}/lifecycle/rolling-updates`)
  if (!res.ok) throw new Error('Failed to fetch rolling updates')
  return res.json()
}

export async function createRollingUpdate(req: {
  name: string
  description?: string
  baseline_id: string
  host_ids: string[]
  parallel_count?: number
  failure_threshold?: number
  pre_check_enabled?: boolean
  auto_remediate?: boolean
}): Promise<RollingUpdatePlan> {
  const res = await fetch(`${API_BASE}/lifecycle/rolling-updates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create rolling update')
  return res.json()
}

export async function startRollingUpdate(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/lifecycle/rolling-updates/${id}/start`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to start rolling update')
}

export async function pauseRollingUpdate(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/lifecycle/rolling-updates/${id}/pause`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to pause rolling update')
}

export async function advanceRollingUpdate(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/lifecycle/rolling-updates/${id}/advance`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to advance rolling update')
}
