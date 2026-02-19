export interface NotificationChannel {
  id: string
  name: string
  type: 'email' | 'slack' | 'webhook' | 'teams'
  config: Record<string, any>
  enabled: boolean
  created: string
  last_test?: string
}

export interface NotificationRule {
  id: string
  name: string
  description?: string
  event_types: string[]
  severity_levels: ('info' | 'warning' | 'critical')[]
  channels: string[]
  vm_tags?: string[]
  enabled: boolean
  created: string
  triggered_count: number
  last_triggered?: string
}

export interface NotificationHistory {
  id: string
  rule_id: string
  rule_name: string
  event_type: string
  severity: 'info' | 'warning' | 'critical'
  channel: string
  vm_name?: string
  message: string
  sent_at: string
  status: 'sent' | 'failed'
  error?: string
}

export interface CreateChannelRequest {
  name: string
  type: 'email' | 'slack' | 'webhook' | 'teams'
  config: Record<string, any>
  enabled?: boolean
}

export interface CreateRuleRequest {
  name: string
  description?: string
  event_types: string[]
  severity_levels: ('info' | 'warning' | 'critical')[]
  channels: string[]
  vm_tags?: string[]
  enabled?: boolean
}

const API_BASE = '/api'

// Channels
export async function listChannels(): Promise<NotificationChannel[]> {
  const res = await fetch(`${API_BASE}/notifications/channels`)
  if (!res.ok) throw new Error('Failed to fetch channels')
  return res.json()
}

export async function createChannel(req: CreateChannelRequest): Promise<NotificationChannel> {
  const res = await fetch(`${API_BASE}/notifications/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create channel')
  return res.json()
}

export async function updateChannel(id: string, req: Partial<CreateChannelRequest>): Promise<NotificationChannel> {
  const res = await fetch(`${API_BASE}/notifications/channels/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to update channel')
  return res.json()
}

export async function deleteChannel(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/notifications/channels/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete channel')
}

export async function testChannel(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/notifications/channels/${id}/test`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to test channel')
}

// Rules
export async function listRules(): Promise<NotificationRule[]> {
  const res = await fetch(`${API_BASE}/notifications/rules`)
  if (!res.ok) throw new Error('Failed to fetch rules')
  return res.json()
}

export async function createRule(req: CreateRuleRequest): Promise<NotificationRule> {
  const res = await fetch(`${API_BASE}/notifications/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create rule')
  return res.json()
}

export async function updateRule(id: string, req: Partial<CreateRuleRequest>): Promise<NotificationRule> {
  const res = await fetch(`${API_BASE}/notifications/rules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to update rule')
  return res.json()
}

export async function deleteRule(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/notifications/rules/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete rule')
}

export async function enableRule(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/notifications/rules/${id}/enable`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to enable rule')
}

export async function disableRule(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/notifications/rules/${id}/disable`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to disable rule')
}

// History
export async function getHistory(limit: number = 50): Promise<NotificationHistory[]> {
  const res = await fetch(`${API_BASE}/notifications/history?limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch notification history')
  return res.json()
}

// Event types for reference
export const EVENT_TYPES = [
  'vm.created',
  'vm.deleted',
  'vm.started',
  'vm.stopped',
  'vm.failed',
  'quota.exceeded',
  'backup.completed',
  'backup.failed',
  'schedule.failed',
  'resource.high_usage',
]
