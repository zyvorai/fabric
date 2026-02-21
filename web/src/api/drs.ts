import { apiFetch } from "./client"
export interface DrsConfig {
  cluster_id: string
  enabled: boolean
  automation_level: 'manual' | 'partially_automated' | 'fully_automated'
  migration_threshold: number
  balance_cpu_weight: number
  balance_memory_weight: number
  check_interval_seconds: number
  min_improvement_pct: number
  updated?: string
}

export interface PlacementRequest {
  cluster_id: string
  vm_cpus: number
  vm_memory_mb: number
  affinity_rules?: string[]
  anti_affinity_rules?: string[]
  preferred_hosts?: string[]
}

export interface PlacementResult {
  host_id: string
  hostname: string
  score: number
  reason: string
  cpu_after_pct: number
  memory_after_pct: number
  alternatives: Array<{
    host_id: string
    hostname: string
    score: number
  }>
}

export interface MigrationRecommendation {
  id: string
  cluster_id: string
  vm_id: string
  vm_name: string
  source_host_id: string
  source_hostname: string
  target_host_id: string
  target_hostname: string
  reason: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  estimated_benefit_pct: number
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed'
  created: string
  executed_at?: string
}

export interface AffinityRule {
  id: string
  cluster_id: string
  name: string
  rule_type: 'affinity' | 'anti_affinity'
  mandatory: boolean
  vm_ids: string[]
  host_ids?: string[]
  enabled: boolean
  created: string
  updated?: string
}

export interface ClusterBalance {
  cluster_id: string
  cpu_imbalance_pct: number
  memory_imbalance_pct: number
  overall_score: number
  hosts: Array<{
    host_id: string
    hostname: string
    cpu_usage_pct: number
    memory_usage_pct: number
    vm_count: number
    deviation_from_mean_cpu: number
    deviation_from_mean_memory: number
  }>
  recommendation_count: number
  last_analyzed: string
}

const API_BASE = '/api'

// DRS configuration

export async function configureDrs(req: Partial<DrsConfig> & { cluster_id: string }): Promise<DrsConfig> {
  const res = await apiFetch(`${API_BASE}/drs/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to configure DRS')
  return res.json()
}

export async function getDrsConfig(clusterId: string): Promise<DrsConfig> {
  const res = await apiFetch(`${API_BASE}/drs/config?cluster_id=${clusterId}`)
  if (!res.ok) throw new Error('Failed to fetch DRS config')
  return res.json()
}

// Placement

export async function computePlacement(req: PlacementRequest): Promise<PlacementResult> {
  const res = await apiFetch(`${API_BASE}/drs/placement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to compute placement')
  return res.json()
}

// Balance analysis

export async function analyzeBalance(clusterId: string): Promise<ClusterBalance> {
  const res = await apiFetch(`${API_BASE}/drs/balance?cluster_id=${clusterId}`)
  if (!res.ok) throw new Error('Failed to analyze cluster balance')
  return res.json()
}

// Migration recommendations

export async function generateRecommendations(clusterId: string): Promise<MigrationRecommendation[]> {
  const res = await apiFetch(`${API_BASE}/drs/recommendations/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cluster_id: clusterId }),
  })
  if (!res.ok) throw new Error('Failed to generate recommendations')
  return res.json()
}

export async function listRecommendations(clusterId?: string): Promise<MigrationRecommendation[]> {
  const url = clusterId
    ? `${API_BASE}/drs/recommendations?cluster_id=${clusterId}`
    : `${API_BASE}/drs/recommendations`
  const res = await apiFetch(url)
  if (!res.ok) throw new Error('Failed to fetch recommendations')
  return res.json()
}

export async function approveRecommendation(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/drs/recommendations/${id}/approve`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to approve recommendation')
}

export async function rejectRecommendation(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/drs/recommendations/${id}/reject`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to reject recommendation')
}

// Affinity rules

export async function listAffinityRules(clusterId?: string): Promise<AffinityRule[]> {
  const url = clusterId
    ? `${API_BASE}/drs/affinity-rules?cluster_id=${clusterId}`
    : `${API_BASE}/drs/affinity-rules`
  const res = await apiFetch(url)
  if (!res.ok) throw new Error('Failed to fetch affinity rules')
  return res.json()
}

export async function createAffinityRule(req: {
  cluster_id: string
  name: string
  rule_type: 'affinity' | 'anti_affinity'
  mandatory: boolean
  vm_ids: string[]
  host_ids?: string[]
  enabled?: boolean
}): Promise<AffinityRule> {
  const res = await apiFetch(`${API_BASE}/drs/affinity-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create affinity rule')
  return res.json()
}

export async function updateAffinityRule(id: string, req: Partial<AffinityRule>): Promise<AffinityRule> {
  const res = await apiFetch(`${API_BASE}/drs/affinity-rules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to update affinity rule')
  return res.json()
}

export async function deleteAffinityRule(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/drs/affinity-rules/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete affinity rule')
}
