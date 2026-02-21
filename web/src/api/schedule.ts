import { apiFetch } from "./client"
export interface Schedule {
  id: string
  name: string
  vm_name: string
  action: 'start' | 'stop' | 'restart' | 'snapshot'
  schedule_type: 'once' | 'daily' | 'weekly'
  time: string // HH:MM format
  days_of_week?: number[] // 0-6, Sunday = 0 (for weekly schedules)
  enabled: boolean
  created: string
  last_run?: string
  next_run?: string
}

export interface CreateScheduleRequest {
  name: string
  vm_name: string
  action: 'start' | 'stop' | 'restart' | 'snapshot'
  schedule_type: 'once' | 'daily' | 'weekly'
  time: string
  days_of_week?: number[]
  enabled?: boolean
}

export interface ScheduleHistory {
  schedule_id: string
  schedule_name: string
  vm_name: string
  action: string
  executed_at: string
  status: 'success' | 'failed'
  error?: string
}

const API_BASE = '/api'

export async function listSchedules(): Promise<Schedule[]> {
  const res = await apiFetch(`${API_BASE}/schedules`)
  if (!res.ok) throw new Error('Failed to fetch schedules')
  return res.json()
}

export async function getSchedule(id: string): Promise<Schedule> {
  const res = await apiFetch(`${API_BASE}/schedules/${id}`)
  if (!res.ok) throw new Error('Failed to fetch schedule')
  return res.json()
}

export async function createSchedule(req: CreateScheduleRequest): Promise<Schedule> {
  const res = await apiFetch(`${API_BASE}/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create schedule')
  return res.json()
}

export async function updateSchedule(id: string, req: Partial<CreateScheduleRequest>): Promise<Schedule> {
  const res = await apiFetch(`${API_BASE}/schedules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to update schedule')
  return res.json()
}

export async function deleteSchedule(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/schedules/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete schedule')
}

export async function enableSchedule(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/schedules/${id}/enable`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to enable schedule')
}

export async function disableSchedule(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/schedules/${id}/disable`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to disable schedule')
}

export async function getScheduleHistory(scheduleId?: string): Promise<ScheduleHistory[]> {
  const url = scheduleId
    ? `${API_BASE}/schedules/${scheduleId}/history`
    : `${API_BASE}/schedules/history`
  const res = await apiFetch(url)
  if (!res.ok) throw new Error('Failed to fetch schedule history')
  return res.json()
}

export async function runScheduleNow(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/schedules/${id}/run`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to run schedule')
}
