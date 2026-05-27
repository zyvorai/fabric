// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import { PageHeader } from '../components/ui'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

function stateBadge(state: string): { label: string; classes: string } {
  switch (state) {
    case 'R': return { label: 'Running', classes: 'bg-emerald-500/20 text-emerald-400' }
    case 'S': return { label: 'Sleeping', classes: 'bg-blue-500/20 text-blue-400' }
    case 'D': return { label: 'Disk Wait', classes: 'bg-amber-500/20 text-amber-400' }
    case 'Z': return { label: 'Zombie', classes: 'bg-red-500/20 text-red-400' }
    case 'T': return { label: 'Stopped', classes: 'bg-slate-500/20 text-slate-400' }
    default: return { label: state, classes: 'bg-slate-500/20 text-slate-400' }
  }
}

function cpuBarColor(cpu: number): string {
  if (cpu >= 80) return 'bg-red-500'
  if (cpu >= 50) return 'bg-amber-500'
  if (cpu >= 20) return 'bg-blue-500'
  return 'bg-emerald-500'
}

export default function Processes() {
  const toast = useToastContext()
  const [processes, setProcesses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedPid, setSelectedPid] = useState<number | null>(null)
  const [detail, setDetail] = useState<any | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchProcesses = useCallback(async () => {
    try {
      const res = await apiFetch('/api/system/processes')
      if (!res.ok) {
        const body = await res.text()
        throw new Error(formatHttpErrorBody(res.status, res.statusText, body))
      }
      const data = await res.json()
      setProcesses(Array.isArray(data) ? data : data.processes ?? [])
      setLoadError(null)
    } catch (err) {
      const msg = formatUserError(err)
      setLoadError(msg)
      toastFailure(toast, 'Failed to load processes', err)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchProcesses()
    const interval = setInterval(fetchProcesses, 3000)
    return () => clearInterval(interval)
  }, [fetchProcesses])

  const fetchDetail = useCallback(async (pid: number) => {
    setSelectedPid(pid)
    setDetailLoading(true)
    setDetail(null)
    try {
      const res = await apiFetch(`/api/system/process?pid=${pid}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setDetail(data)
    } catch (err) {
      setDetail({ error: formatUserError(err) })
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const filtered = processes.filter((p: any) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      String(p.pid).includes(q) ||
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.state && p.state.toLowerCase().includes(q))
    )
  })

  const totalCount = processes.length
  const runningCount = processes.filter((p: any) => p.state === 'R').length
  const sleepingCount = processes.filter((p: any) => p.state === 'S').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Processes"
        description="System process monitor (auto-refresh 3s)"
        onRefresh={fetchProcesses}
        refreshing={loading}
      />

      {loadError && (
        <ErrorBanner
          title="Could not load processes"
          headline={loadError}
          hints={hintsForError(loadError)}
          onRetry={fetchProcesses}
        />
      )}

      {loading && !loadError ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mr-3" />
          Loading processes…
        </div>
      ) : !loadError ? (
        <>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="text-xs text-slate-400 mb-1">Total Processes</div>
          <div className="text-2xl font-bold text-white">{totalCount}</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="text-xs text-slate-400 mb-1">Running</div>
          <div className="text-2xl font-bold text-emerald-400">{runningCount}</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="text-xs text-slate-400 mb-1">Sleeping</div>
          <div className="text-2xl font-bold text-blue-400">{sleepingCount}</div>
        </div>
      </div>

      <div>
        <input
          type="text"
          placeholder="Filter by PID, name, or state..."
          aria-label="Filter processes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500 text-sm">
          No processes match your filter
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">PID</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">CPU %</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Memory MB</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">State</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Threads</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((proc: any) => {
                  const badge = stateBadge(proc.state)
                  const cpuPct = Math.min(proc.cpu_percent ?? 0, 100)
                  return (
                    <tr
                      key={proc.pid}
                      onClick={() => fetchDetail(proc.pid)}
                      className={`border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors cursor-pointer ${selectedPid === proc.pid ? 'bg-slate-700/30' : ''}`}
                    >
                      <td className="px-4 py-3 text-slate-300 font-mono">{proc.pid}</td>
                      <td className="px-4 py-3 text-white font-medium">{proc.name}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${cpuBarColor(cpuPct)}`}
                              style={{ width: `${cpuPct}%` }}
                            />
                          </div>
                          <span className="text-slate-300 text-xs w-12">{cpuPct.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{(proc.memory_mb ?? (proc.memory_bytes ? (proc.memory_bytes / 1024 / 1024).toFixed(1) : 0))}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.classes}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{proc.threads ?? proc.num_threads ?? '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedPid !== null && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white">Process Detail - PID {selectedPid}</h3>
            <button
              onClick={() => { setSelectedPid(null); setDetail(null) }}
              className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
          {detailLoading ? (
            <div className="flex items-center text-slate-400 text-sm">
              <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full mr-2" />
              Loading...
            </div>
          ) : detail?.error ? (
            <div className="text-red-400 text-sm">{detail.error}</div>
          ) : detail ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {detail.cmdline && (
                <div className="col-span-full bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Command Line</div>
                  <div className="text-sm text-slate-300 font-mono break-all">{detail.cmdline}</div>
                </div>
              )}
              {detail.io_read_bytes !== undefined && (
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">IO Read Bytes</div>
                  <div className="text-sm font-semibold text-white">{Number(detail.io_read_bytes).toLocaleString()}</div>
                </div>
              )}
              {detail.io_write_bytes !== undefined && (
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">IO Write Bytes</div>
                  <div className="text-sm font-semibold text-white">{Number(detail.io_write_bytes).toLocaleString()}</div>
                </div>
              )}
              {detail.fds !== undefined && (
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">File Descriptors</div>
                  <div className="text-sm font-semibold text-white">{detail.fds}</div>
                </div>
              )}
              {detail.voluntary_ctx_switches !== undefined && (
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Voluntary Ctx Switches</div>
                  <div className="text-sm font-semibold text-white">{Number(detail.voluntary_ctx_switches).toLocaleString()}</div>
                </div>
              )}
              {detail.involuntary_ctx_switches !== undefined && (
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Involuntary Ctx Switches</div>
                  <div className="text-sm font-semibold text-white">{Number(detail.involuntary_ctx_switches).toLocaleString()}</div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
        </>
      ) : null}
    </div>
  )
}
