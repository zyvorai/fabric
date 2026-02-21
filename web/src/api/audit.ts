import { apiFetch } from "./client"
export interface AuditLog {
  id: string
  timestamp: string
  user: string
  action: string
  resource_type: string
  resource_name: string
  status: 'success' | 'failed'
  ip_address?: string
  details?: string
  error?: string
}

export interface AuditLogFilters {
  action?: string
  user?: string
  resource_type?: string
  resource_name?: string
  status?: 'success' | 'failed'
  start_time?: string
  end_time?: string
  search?: string
}

const API_BASE = '/api'

export async function listAuditLogs(filters?: AuditLogFilters): Promise<AuditLog[]> {
  const params = new URLSearchParams()
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value.toString())
    })
  }

  const url = `${API_BASE}/audit/logs${params.toString() ? `?${params}` : ''}`
  const res = await apiFetch(url)
  if (!res.ok) throw new Error('Failed to fetch audit logs')
  return res.json()
}

export async function getAuditLog(id: string): Promise<AuditLog> {
  const res = await apiFetch(`${API_BASE}/audit/logs/${id}`)
  if (!res.ok) throw new Error('Failed to fetch audit log')
  return res.json()
}

export async function exportAuditLogs(filters?: AuditLogFilters, format: 'json' | 'csv' = 'json'): Promise<Blob> {
  const params = new URLSearchParams()
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value.toString())
    })
  }
  params.append('format', format)

  const url = `${API_BASE}/audit/logs/export?${params}`
  const res = await apiFetch(url)
  if (!res.ok) throw new Error('Failed to export audit logs')
  return res.blob()
}

export interface AuditStats {
  total_logs: number
  by_action: Record<string, number>
  by_user: Record<string, number>
  by_status: Record<string, number>
  recent_failures: number
}

export async function getAuditStats(): Promise<AuditStats> {
  const res = await apiFetch(`${API_BASE}/audit/stats`)
  if (!res.ok) throw new Error('Failed to fetch audit stats')
  return res.json()
}
