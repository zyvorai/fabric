// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { Package, Power, Loader2 } from 'lucide-react'
import { apiFetch } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import { PageHeader } from '../components/ui'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

interface Plugin {
  name: string
  version: string
  description: string
  enabled: boolean
  status: 'running' | 'stopped' | 'error'
  author?: string
  type: string
}

function statusColor(status: string): string {
  switch (status) {
    case 'running': return 'bg-green-500/20 text-green-400'
    case 'stopped': return 'bg-slate-500/20 text-slate-400'
    case 'error': return 'bg-red-500/20 text-red-400'
    default: return 'bg-slate-500/20 text-slate-400'
  }
}

function typeColor(type: string): string {
  switch (type?.toLowerCase()) {
    case 'storage': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'network': return 'bg-teal-500/20 text-teal-400 border-teal-500/30'
    case 'security': return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'monitoring': return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    case 'backup': return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30'
  }
}

export default function PluginManager() {
  const toast = useToastContext()
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const fetchPlugins = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiFetch('/api/plugins')
      if (!res.ok) {
        const body = await res.text()
        throw new Error(formatHttpErrorBody(res.status, res.statusText, body))
      }
      const data = await res.json()
      setPlugins(Array.isArray(data) ? data : data.plugins || [])
    } catch (err) {
      setLoadError(formatUserError(err))
      toastFailure(toast, 'Failed to load plugins', err)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchPlugins() }, [fetchPlugins])

  const togglePlugin = async (name: string, enabled: boolean) => {
    setToggling(name)
    try {
      const res = await apiFetch(`/api/plugins/${name}/${enabled ? 'disable' : 'enable'}`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(formatHttpErrorBody(res.status, res.statusText, body))
      }
      setPlugins(prev => prev.map(p => p.name === name ? { ...p, enabled: !enabled, status: !enabled ? 'running' : 'stopped' } : p))
      setActionError(null)
    } catch (err) {
      setActionError(formatUserError(err))
      toastFailure(toast, `Failed to toggle ${name}`, err)
    } finally { setToggling(null) }
  }

  const runningCount = plugins.filter(p => p.status === 'running').length
  const errorCount = plugins.filter(p => p.status === 'error').length

  if (loading && plugins.length === 0 && !loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Plugin Manager" description="Manage server extensions and integrations" />
        <div className="flex items-center justify-center h-64 text-slate-400">
          <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mr-3" />
          Loading plugins…
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plugin Manager"
        description="Manage server extensions and integrations"
        onRefresh={fetchPlugins}
        refreshing={loading}
      />

      {loadError && (
        <ErrorBanner
          title="Could not load plugins"
          headline={loadError}
          hints={hintsForError(loadError)}
          onRetry={fetchPlugins}
        />
      )}
      {actionError && (
        <div className="bg-amber-500/10 rounded-lg border border-amber-500/30 px-4 py-2 text-sm text-amber-400">{actionError}</div>
      )}

      {!loadError && (
      <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card-blue rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{plugins.length}</div>
          <div className="text-xs text-slate-400 mt-1">Total Plugins</div>
        </div>
        <div className="stat-card-green rounded-xl border border-slate-700/50 p-5 card-glow-green transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{runningCount}</div>
          <div className="text-xs text-slate-400 mt-1">Running</div>
        </div>
        <div className="stat-card-red rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{errorCount}</div>
          <div className="text-xs text-slate-400 mt-1">Errors</div>
        </div>
        <div className="stat-card-purple rounded-xl border border-slate-700/50 p-5 card-glow-purple transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{new Set(plugins.map(p => p.type)).size}</div>
          <div className="text-xs text-slate-400 mt-1">Types</div>
        </div>
      </div>

      {plugins.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500"><Package className="w-10 h-10 mx-auto mb-3 opacity-50" /><p className="text-sm">No plugins installed</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plugins.map(plugin => (
            <div key={plugin.name} className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.01]">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-slate-700/50 flex items-center justify-center">
                    <Package className="w-5 h-5 text-pink-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{plugin.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-500">v{plugin.version}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize ${typeColor(plugin.type)}`}>{plugin.type}</span>
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(plugin.status)}`}>{plugin.status}</span>
              </div>

              <p className="text-xs text-slate-400 mb-3">{plugin.description}</p>
              {plugin.author && <p className="text-[10px] text-slate-600 mb-3">by {plugin.author}</p>}

              <div className="flex items-center justify-between pt-3 border-t border-slate-700/30">
                <button onClick={() => togglePlugin(plugin.name, plugin.enabled)} disabled={toggling === plugin.name}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${plugin.enabled ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20'}`}>
                  {toggling === plugin.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                  {plugin.enabled ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  )
}
