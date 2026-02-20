export interface RecoveryPlan {
  id: string
  name: string
  description?: string
  source_site_id: string
  target_site_id: string
  vm_groups: Array<{
    name: string
    vm_ids: string[]
    boot_order: number
    boot_delay_seconds: number
    pre_power_on_script?: string
    post_power_on_script?: string
  }>
  network_mappings: Array<{
    source_network: string
    target_network: string
  }>
  storage_mappings: Array<{
    source_datastore: string
    target_datastore: string
  }>
  test_network?: string
  status: string
  last_tested?: string
  last_executed?: string
  created: string
  updated?: string
}

export interface RecoveryExecution {
  id: string
  plan_id: string
  plan_name: string
  execution_type: 'planned_migration' | 'disaster_recovery' | 'test_failover'
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'rolling_back'
  progress_pct: number
  current_step: string
  steps: Array<{
    name: string
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
    started_at?: string
    completed_at?: string
    error?: string
  }>
  vms_recovered: number
  vms_total: number
  rto_actual_seconds?: number
  started_at: string
  completed_at?: string
  error?: string
}

export interface DrDashboard {
  total_plans: number
  plans_tested: number
  plans_untested: number
  last_test_date?: string
  active_executions: number
  total_protected_vms: number
  total_unprotected_vms: number
  avg_rto_seconds: number
  avg_rpo_minutes: number
  sites: Array<{
    site_id: string
    site_name: string
    status: string
    protected_vms: number
    plans: number
  }>
  recent_executions: RecoveryExecution[]
}

const API_BASE = '/api'

// Recovery plans

export async function listPlans(): Promise<RecoveryPlan[]> {
  const res = await fetch(`${API_BASE}/site-recovery/plans`)
  if (!res.ok) throw new Error('Failed to fetch recovery plans')
  return res.json()
}

export async function createPlan(req: {
  name: string
  description?: string
  source_site_id: string
  target_site_id: string
  vm_groups: Array<{
    name: string
    vm_ids: string[]
    boot_order: number
    boot_delay_seconds?: number
    pre_power_on_script?: string
    post_power_on_script?: string
  }>
  network_mappings?: Array<{
    source_network: string
    target_network: string
  }>
  storage_mappings?: Array<{
    source_datastore: string
    target_datastore: string
  }>
  test_network?: string
}): Promise<RecoveryPlan> {
  const res = await fetch(`${API_BASE}/site-recovery/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create recovery plan')
  return res.json()
}

export async function getPlan(id: string): Promise<RecoveryPlan> {
  const res = await fetch(`${API_BASE}/site-recovery/plans/${id}`)
  if (!res.ok) throw new Error('Failed to fetch recovery plan')
  return res.json()
}

export async function updatePlan(id: string, req: Partial<RecoveryPlan>): Promise<RecoveryPlan> {
  const res = await fetch(`${API_BASE}/site-recovery/plans/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to update recovery plan')
  return res.json()
}

export async function deletePlan(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/site-recovery/plans/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete recovery plan')
}

// Plan executions

export async function executePlannedMigration(planId: string): Promise<RecoveryExecution> {
  const res = await fetch(`${API_BASE}/site-recovery/plans/${planId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ execution_type: 'planned_migration' }),
  })
  if (!res.ok) throw new Error('Failed to execute planned migration')
  return res.json()
}

export async function executeDisasterRecovery(planId: string): Promise<RecoveryExecution> {
  const res = await fetch(`${API_BASE}/site-recovery/plans/${planId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ execution_type: 'disaster_recovery' }),
  })
  if (!res.ok) throw new Error('Failed to execute disaster recovery')
  return res.json()
}

export async function executeTestFailover(planId: string): Promise<RecoveryExecution> {
  const res = await fetch(`${API_BASE}/site-recovery/plans/${planId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ execution_type: 'test_failover' }),
  })
  if (!res.ok) throw new Error('Failed to execute test failover')
  return res.json()
}

export async function listExecutions(planId?: string): Promise<RecoveryExecution[]> {
  const url = planId
    ? `${API_BASE}/site-recovery/executions?plan_id=${planId}`
    : `${API_BASE}/site-recovery/executions`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch recovery executions')
  return res.json()
}

export async function getExecution(id: string): Promise<RecoveryExecution> {
  const res = await fetch(`${API_BASE}/site-recovery/executions/${id}`)
  if (!res.ok) throw new Error('Failed to fetch recovery execution')
  return res.json()
}

export async function cancelExecution(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/site-recovery/executions/${id}/cancel`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to cancel recovery execution')
}

// Dashboard

export async function getDrDashboard(): Promise<DrDashboard> {
  const res = await fetch(`${API_BASE}/site-recovery/dashboard`)
  if (!res.ok) throw new Error('Failed to fetch DR dashboard')
  return res.json()
}
