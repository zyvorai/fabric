// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { apiGet, apiPost, apiDelete } from './client'

const API_BASE = '/api'

export interface FloatingIp {
  id: string
  address: string
  interface: string
  assigned_vm?: string | null
  managed?: boolean
  created: string
}

export interface CreateFloatingIpRequest {
  address: string
  interface: string
}

export async function listFloatingIps(): Promise<FloatingIp[]> {
  return apiGet<FloatingIp[]>(`${API_BASE}/floating-ips`)
}

export async function createFloatingIp(req: CreateFloatingIpRequest): Promise<FloatingIp> {
  return apiPost<FloatingIp>(`${API_BASE}/floating-ips`, req)
}

export async function deleteFloatingIp(id: string): Promise<void> {
  return apiDelete(`${API_BASE}/floating-ips/${id}`)
}

export async function adoptFloatingIp(hostId: string): Promise<FloatingIp> {
  return apiPost<FloatingIp>(`${API_BASE}/floating-ips/adopt`, { host_id: hostId })
}
