// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { History } from 'lucide-react'
import { apiFetch } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import { PageHeader, EmptyState } from '../components/ui'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

interface HistoryEntry {
  id: string
  name: string
  vm_name: string
  status: string
  error?: string
  started_at?: string
  completed_at?: string
  duration?: string
  output_path?: string
}

const statusBadge: Record<string, string> = {
  completed: 'bg-green-500/20 text-emerald-600',
  failed: 'bg-red-500/20 text-red-600',
  running: 'bg-blue-500/20 text-[#0066cc]',
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function MigrationHistory() {
  const toast = useToastContext()
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const resp = await apiFetch('/api/migrations/history')
      if (!resp.ok) {
        const body = await resp.text()
        throw new Error(formatHttpErrorBody(resp.status, resp.statusText, body))
      }
      const data = await resp.json()
      setHistory(data.history || data.migrations || [])
    } catch (err) {
      const msg = formatUserError(err)
      setLoadError(msg)
      toastFailure(toast, 'Failed to load migration history', err)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Migration History"
        description="Completed and failed migration jobs"
        onRefresh={fetchHistory}
        refreshing={loading}
      />

      {loadError && (
        <ErrorBanner
          title="Could not load migration history"
          headline={loadError}
          hints={hintsForError(loadError)}
          onRetry={fetchHistory}
        />
      )}

      {loading && !loadError ? (
        <div className="bg-[#f5f5f7] rounded-xl p-10 border border-[#d2d2d7] flex flex-col items-center justify-center text-[#6e6e73] gap-3">
          <div className="w-6 h-6 border-2 border-[#d2d2d7] border-t-[#0066cc] rounded-full animate-spin" />
          <span className="text-sm">Loading migration history…</span>
        </div>
      ) : !loadError && history.length === 0 ? (
        <div className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7]">
          <EmptyState
            icon={<History className="w-12 h-12" />}
            title="No migration history yet"
            description="Completed and failed migrations will appear here"
          />
        </div>
      ) : !loadError ? (
        <div className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#d2d2d7]">
                <th className="text-left p-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Name</th>
                <th className="text-left p-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">VM</th>
                <th className="text-left p-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Status</th>
                <th className="text-left p-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Started</th>
                <th className="text-left p-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Duration</th>
                <th className="text-left p-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Output</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d2d2d7]/30">
              {history.map((entry, idx) => (
                <tr key={`${entry.id}-${idx}`} className="hover:bg-black/[0.04] transition-colors">
                  <td className="p-3">
                    <div className="font-medium text-[#1d1d1f]">{entry.name || entry.id}</div>
                  </td>
                  <td className="p-3 text-[#6e6e73] text-xs truncate max-w-xs">{entry.vm_name || '-'}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        statusBadge[entry.status] || 'bg-black/[0.06] text-[#6e6e73]'
                      }`}
                    >
                      {entry.status}
                    </span>
                    {entry.error && (
                      <div className="text-xs text-red-600 mt-1 truncate max-w-xs" title={entry.error}>
                        {entry.error}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-[#6e6e73] whitespace-nowrap text-xs">{formatTime(entry.started_at)}</td>
                  <td className="p-3 text-[#1d1d1f] whitespace-nowrap text-xs">{entry.duration || '-'}</td>
                  <td className="p-3 text-[#6e6e73] text-xs truncate max-w-xs">{entry.output_path || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
