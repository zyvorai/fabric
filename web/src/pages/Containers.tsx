// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { Box } from 'lucide-react'
import { apiFetch } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import { PageHeader, EmptyState } from '../components/ui'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i]
}

function stateColor(state: string): string {
  const s = (state || '').toLowerCase()
  if (s === 'running') return 'bg-emerald-500/10 text-emerald-400'
  if (s === 'exited' || s === 'stopped') return 'bg-red-500/10 text-red-400'
  if (s === 'paused') return 'bg-amber-500/10 text-amber-400'
  if (s === 'restarting') return 'bg-blue-500/10 text-blue-400'
  return 'bg-slate-500/10 text-slate-400'
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div className="h-1.5 rounded-full bg-slate-700 w-full">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

export default function Containers() {
  const toast = useToastContext()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/system/containers')
      if (!res.ok) {
        const body = await res.text()
        throw new Error(formatHttpErrorBody(res.status, res.statusText, body))
      }
      const json = await res.json()
      setData(json)
      setLoadError(null)
      setRefreshError(null)
    } catch (err) {
      const msg = formatUserError(err)
      setData((prev: any) => {
        if (prev == null) {
          setLoadError(msg)
          toastFailure(toast, 'Failed to load containers', err)
        } else {
          setRefreshError(msg)
        }
        return prev
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 3000)
    return () => clearInterval(interval)
  }, [fetchData])

  const containers: any[] = data?.containers || []
  const summary = data?.summary
  const totalContainers = summary?.total ?? containers.length
  const runningCount = summary?.running ?? containers.filter((c: any) => (c.state || '').toLowerCase() === 'running').length
  const totalCpu = summary?.total_cpu ?? containers.reduce((acc: number, c: any) => acc + (c.cpu_percent ?? 0), 0)
  const totalMem = summary?.total_memory ?? containers.reduce((acc: number, c: any) => acc + (c.memory_bytes ?? 0), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Containers"
        description="Container runtime monitoring"
        onRefresh={fetchData}
        refreshing={loading}
      />

      {loadError && (
        <ErrorBanner
          title="Could not load containers"
          headline={loadError}
          hints={hintsForError(loadError)}
          onRetry={fetchData}
        />
      )}

      {refreshError && !loadError && (
        <div className="bg-amber-500/10 rounded-lg border border-amber-500/30 px-4 py-2 text-xs text-amber-400">
          Refresh failed: {refreshError} — showing last known data
        </div>
      )}

      {loading && !data && !loadError ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !loadError ? (
        <>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card-cyan rounded-xl border border-slate-700/50 p-5 card-glow-cyan transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{totalContainers}</div>
          <div className="text-xs text-slate-400 mt-1">Total Containers</div>
        </div>
        <div className="stat-card-green rounded-xl border border-slate-700/50 p-5 card-glow-green transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{runningCount}</div>
          <div className="text-xs text-slate-400 mt-1">Running</div>
        </div>
        <div className="stat-card-blue rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{totalCpu.toFixed(1)}%</div>
          <div className="text-xs text-slate-400 mt-1">Total CPU</div>
        </div>
        <div className="stat-card-purple rounded-xl border border-slate-700/50 p-5 card-glow-purple transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{formatBytes(totalMem)}</div>
          <div className="text-xs text-slate-400 mt-1">Total Memory</div>
        </div>
      </div>

      {containers.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-12 text-center">
          <div className="text-slate-500 text-sm">No containers found</div>
          <p className="text-xs text-slate-600 mt-1">Containers will appear here when detected</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {containers.map((c: any, i: number) => (
            <div key={c.id || i} className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 transition-all hover:scale-[1.01] card-glow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-white truncate mr-2">{c.name || c.id?.slice(0, 12) || 'unknown'}</span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${stateColor(c.state)}`}>
                  {c.state || 'unknown'}
                </span>
              </div>

              {c.image && (
                <div className="text-[10px] text-slate-500 truncate mb-3 font-mono">{c.image}</div>
              )}

              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500">CPU</span>
                  <span className="text-[10px] font-medium text-slate-300">{(c.cpu_percent ?? 0).toFixed(1)}%</span>
                </div>
                <ProgressBar pct={c.cpu_percent ?? 0} color="bg-blue-500" />
              </div>

              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500">Memory</span>
                  <span className="text-[10px] font-medium text-slate-300">
                    {c.memory_bytes ? formatBytes(c.memory_bytes) : `${(c.memory_percent ?? 0).toFixed(1)}%`}
                  </span>
                </div>
                <ProgressBar pct={c.memory_percent ?? (c.memory_limit ? (c.memory_bytes / c.memory_limit) * 100 : 0)} color="bg-purple-500" />
              </div>

              {(c.net_rx !== undefined || c.net_tx !== undefined) && (
                <div className="flex gap-4 text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-700/30">
                  <span>RX: {formatBytes(c.net_rx ?? 0)}</span>
                  <span>TX: {formatBytes(c.net_tx ?? 0)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {containers.length === 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50">
          <EmptyState icon={<Box className="w-10 h-10" />} title="No containers" description="No container workloads detected on this host" />
        </div>
      )}
        </>
      ) : null}
    </div>
  )
}
