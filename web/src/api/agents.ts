// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { apiDelete, apiGet, apiPost } from './client'

export interface AgentManifest {
  template: string
  credentials?: string[]
  egress_allow_hosts?: string[]
  allow_private_networks?: boolean
  runtime_port?: number
  ttl_seconds?: number
  max_concurrent_sessions?: number
  idle_hibernate_seconds?: number
}

export interface AgentRecord {
  name: string
  version: string
  digest_sha256: string
  manifest: AgentManifest
  created_at: string
}

export interface SessionView {
  id: string
  agent: string
  agent_version: string
  sandbox_id: string
  status: string
  input?: unknown
  created_at: string
  updated_at: string
  last_event_seq: number
  request_id?: string | null
  error?: string | null
}

export async function listAgents(): Promise<{ items: AgentRecord[] }> {
  return apiGet('/api/agents')
}

export async function getAgent(name: string): Promise<AgentRecord> {
  return apiGet(`/api/agents/${encodeURIComponent(name)}`)
}

export async function deployAgent(body: {
  name: string
  bundle_base64: string
  manifest: AgentManifest
}): Promise<AgentRecord> {
  return apiPost('/api/agents', body)
}

export async function listSessions(): Promise<{ items: SessionView[] }> {
  return apiGet('/api/sessions')
}

export async function getSession(id: string): Promise<SessionView> {
  return apiGet(`/api/sessions/${encodeURIComponent(id)}`)
}

export async function createSession(body: {
  agent: string
  input?: unknown
  ttl_seconds?: number
  request_id?: string
}): Promise<SessionView> {
  return apiPost('/api/sessions', body)
}

export async function deleteSession(id: string): Promise<void> {
  return apiDelete(`/api/sessions/${encodeURIComponent(id)}`)
}

export async function sessionAction(
  id: string,
  action: 'steer' | 'cancel' | 'hibernate' | 'resume',
  body?: unknown,
): Promise<unknown> {
  return apiPost(`/api/sessions/${encodeURIComponent(id)}/${action}`, body ?? {})
}
