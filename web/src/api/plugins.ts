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
  const res = await fetch(`${API_BASE}/plugins`)
  if (!res.ok) throw new Error('Failed to fetch plugins')
  return res.json()
}
