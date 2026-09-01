// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { apiGet, apiPost } from './client'

const API_BASE = '/api'

export type MigrationType = 'live' | 'offline' | 'storage'
export type MigrationState = 'pending' | 'precheck' | 'syncing' | 'switching' | 'completed' | 'failed' | 'cancelled'

export interface MigrationRequest {
  vm_name: string
  target_host: string
  migration_type: MigrationType
  compress?: boolean
  bandwidth_mbps?: number
}

export interface MigrationStatus {
  id: string
  vm_name: string
  target_host: string
  migration_type: MigrationType
  state: MigrationState
  progress_percent: number
  bytes_transferred: number
  started: string
  completed?: string
  error?: string
}

export async function startMigration(req: MigrationRequest): Promise<MigrationStatus> {
  return apiPost<MigrationStatus>(`${API_BASE}/migrations`, req)
}

export async function listMigrations(): Promise<MigrationStatus[]> {
  return apiGet<MigrationStatus[]>(`${API_BASE}/migrations`)
}

export async function getMigration(id: string): Promise<MigrationStatus> {
  return apiGet<MigrationStatus>(`${API_BASE}/migrations/${id}`)
}

export async function cancelMigration(id: string): Promise<MigrationStatus> {
  return apiPost<MigrationStatus>(`${API_BASE}/migrations/${id}/cancel`)
}
