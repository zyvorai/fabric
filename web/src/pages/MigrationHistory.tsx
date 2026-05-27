// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api/client'
import Breadcrumb from '../components/Breadcrumb'

interface HistoryEntry { id: string; name: string; vm_name: string; status: string; error?: string; started_at?: string; completed_at?: string; duration?: string; output_path?: string }

const statusBadge: Record<string, string> = { completed: 'bg-green-500/20 text-green-400', failed: 'bg-red-500/20 text-red-400', running: 'bg-blue-500/20 text-blue-400' }

function formatTime(dateStr?: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function MigrationHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const resp = await apiFetch('/api/migrations/history')
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setHistory(data.history || data.migrations || [])
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to fetch history') } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  if (loading) return (
    <div className="space-y-6">
      <Breadcrumb />
      <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 flex flex-col items-center justify-center text-slate-500 gap-3"><div className="w-6 h-6 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" /><span className="text-sm">Loading migration history...</span></div>
    </div>
  )
  if (error) return (
    <div className="space-y-6">
      <Breadcrumb />
      <div className="bg-slate-800/50 rounded-xl p-6 border border-red-700/50"><div className="text-red-400 text-sm mb-3">Failed to load history: {error}</div><button onClick={fetchHistory} title="Retry" className="px-4 py-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors">Retry</button></div>
    </div>
  )
  if (history.length === 0) return (
    <div className="space-y-6">
      <Breadcrumb />
      <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 flex flex-col items-center justify-center text-slate-500 gap-3"><span className="text-sm">No migration history yet</span><span className="text-xs text-slate-600">Completed and failed migrations will appear here</span></div>
    </div>
  )

  return (
    <div className="space-y-6">
      <Breadcrumb />
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-700/50">
          <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
          <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase tracking-wider">VM</th>
          <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
          <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Started</th>
          <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Duration</th>
          <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Output</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-700/30">
          {history.map((entry, idx) => (
            <tr key={`${entry.id}-${idx}`} className="hover:bg-slate-700/30 transition-colors">
              <td className="p-3"><div className="font-medium text-white">{entry.name || entry.id}</div></td>
              <td className="p-3 text-slate-400 text-xs truncate max-w-xs">{entry.vm_name || '-'}</td>
              <td className="p-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[entry.status] || 'bg-slate-500/20 text-slate-400'}`}>{entry.status}</span>
                {entry.error && <div className="text-xs text-red-400 mt-1 truncate max-w-xs" title={entry.error}>{entry.error}</div>}
              </td>
              <td className="p-3 text-slate-400 whitespace-nowrap text-xs">{formatTime(entry.started_at)}</td>
              <td className="p-3 text-slate-300 whitespace-nowrap text-xs">{entry.duration || '-'}</td>
              <td className="p-3 text-slate-500 text-xs truncate max-w-xs">{entry.output_path || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  )
}
