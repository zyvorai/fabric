import { apiGet, apiPost, apiPostVoid } from './client'

export interface FtConfig {
  vm_id: string
  vm_name: string
  enabled: boolean
  secondary_host_id?: string
  secondary_hostname?: string
  logging_bandwidth_mbps: number
  checkpoint_interval_seconds: number
  wake_on_lan: boolean
  status: string
  last_failover?: string
  created: string
  updated?: string
}

export interface FtCompatibility {
  vm_id: string
  vm_name: string
  compatible: boolean
  issues: Array<{
    severity: 'warning' | 'error'
    message: string
    resolution?: string
  }>
  recommended_secondary_hosts: Array<{
    host_id: string
    hostname: string
    score: number
  }>
}

export interface FailoverResult {
  vm_id: string
  vm_name: string
  failover_type: 'automatic' | 'manual' | 'test'
  source_host_id: string
  source_hostname: string
  target_host_id: string
  target_hostname: string
  status: 'success' | 'failed'
  downtime_ms: number
  started_at: string
  completed_at: string
  error?: string
}

export interface FtMetrics {
  vm_id: string
  vm_name: string
  log_bandwidth_usage_mbps: number
  checkpoint_latency_ms: number
  secondary_cpu_usage_pct: number
  secondary_memory_usage_pct: number
  failover_count: number
  last_failover?: string
  uptime_pct: number
  collected_at: string
}

const API_BASE = '/api'

// FT configuration

export async function enableFt(req: {
  vm_id: string
  secondary_host_id?: string
  logging_bandwidth_mbps?: number
  checkpoint_interval_seconds?: number
}): Promise<FtConfig> {
  return apiPost<FtConfig>(`${API_BASE}/fault-tolerance/enable`, req)
}

export async function disableFt(vmId: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/fault-tolerance/${vmId}/disable`)
}

export async function getFtConfig(vmId: string): Promise<FtConfig> {
  return apiGet<FtConfig>(`${API_BASE}/fault-tolerance/${vmId}/config`)
}

export async function listFtVms(): Promise<FtConfig[]> {
  return apiGet<FtConfig[]>(`${API_BASE}/fault-tolerance/vms`)
}

// Compatibility check

export async function checkFtCompatibility(vmId: string): Promise<FtCompatibility> {
  return apiGet<FtCompatibility>(`${API_BASE}/fault-tolerance/${vmId}/compatibility`)
}

// Failover operations

export async function triggerFailover(vmId: string): Promise<FailoverResult> {
  return apiPost<FailoverResult>(`${API_BASE}/fault-tolerance/${vmId}/failover`)
}

export async function testFailover(vmId: string): Promise<FailoverResult> {
  return apiPost<FailoverResult>(`${API_BASE}/fault-tolerance/${vmId}/test-failover`)
}

// Metrics and events

export async function getFtMetrics(vmId: string): Promise<FtMetrics> {
  return apiGet<FtMetrics>(`${API_BASE}/fault-tolerance/${vmId}/metrics`)
}

export async function getFtEvents(vmId?: string): Promise<FailoverResult[]> {
  const url = vmId
    ? `${API_BASE}/fault-tolerance/events?vm_id=${vmId}`
    : `${API_BASE}/fault-tolerance/events`
  return apiGet<FailoverResult[]>(url)
}
