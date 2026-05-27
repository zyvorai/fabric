// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { apiGet } from './client'

const API_BASE = '/api'

export interface PluginInfo {
  name: string
  version: string
  description: string
  plugin_type: 'storage_backend' | 'vm_driver' | 'scheduler' | 'event_hook'
  enabled: boolean
  loaded: boolean
}

export async function listPlugins(): Promise<PluginInfo[]> {
  return apiGet<PluginInfo[]>(`${API_BASE}/plugins`)
}
