// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { FileText } from 'lucide-react'
import { apiFetch } from '../api/client'
import Breadcrumb from '../components/Breadcrumb'
import ErrorBanner from '../components/ErrorBanner'
import { PageHeader, EmptyState } from '../components/ui'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

interface MigrationEntry {
  id: string
  name: string
  vm_name: string
  status: string
  error?: string
  duration?: string
  output_path?: string
}

interface ReportData {
  total: number
  successful: number
  failed: number
  running: number
  avg_duration: string
  migrations: MigrationEntry[]
  timestamp: string
}

function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'bg-green-500/20 text-green-400'
    case 'failed':
      return 'bg-red-500/20 text-red-400'
    case 'running':
      return 'bg-blue-500/20 text-blue-400'
    default:
      return 'bg-slate-500/20 text-slate-400'
  }
}

export default function MigrationReport() {
  const toast = useToastContext()
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const resp = await apiFetch('/api/migrations/report')
      if (!resp.ok) {
        const body = await resp.text()
        throw new Error(formatHttpErrorBody(resp.status, resp.statusText, body))
      }
      setReport(await resp.json())
    } catch (err) {
      const msg = formatUserError(err)
      setLoadError(msg)
      toastFailure(toast, 'Failed to load migration report', err)
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const handleCopy = async () => {
    if (!report) return
    const lines = [
      'vmspawnd Migration Report',
      `Generated: ${new Date(report.timestamp).toLocaleString()}`,
      '',
      `Total: ${report.total}`,
      `Successful: ${report.successful}`,
      `Failed: ${report.failed}`,
      `Running: ${report.running}`,
      `Avg Duration: ${report.avg_duration}`,
      '',
      '--- Migrations ---',
      '',
      ...report.migrations.map(
        (m) =>
          `${m.name} | ${m.status} | ${m.vm_name} | ${m.duration || 'N/A'}${m.error ? `\n  Error: ${m.error}` : ''}`,
      ),
    ]
    await navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <Breadcrumb />
      <PageHeader
        title="Migration Report"
        description="Summary and details for all migration jobs"
        onRefresh={fetchReport}
        refreshing={loading}
        primaryAction={
          report ? (
            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={handleCopy}
                title="Copy report to clipboard"
                className="px-4 py-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors"
              >
                {copied ? 'Copied!' : 'Copy Report'}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                title="Print report"
                className="px-4 py-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors"
              >
                Print
              </button>
            </div>
          ) : undefined
        }
      />

      {loadError && (
        <ErrorBanner
          title="Could not load migration report"
          headline={loadError}
          hints={hintsForError(loadError)}
          onRetry={fetchReport}
        />
      )}

      {loading && !loadError ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 flex flex-col items-center justify-center text-slate-500 gap-3">
          <div className="w-6 h-6 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-sm">Generating migration report…</span>
        </div>
      ) : report && !loadError ? (
        <div className="flex flex-col gap-4 print:gap-2">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">Total</div>
              <div className="text-2xl font-bold text-white">{report.total}</div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-green-700/30">
              <div className="text-xs text-green-400 mb-1">Successful</div>
              <div className="text-2xl font-bold text-green-400">{report.successful}</div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-red-700/30">
              <div className="text-xs text-red-400 mb-1">Failed</div>
              <div className="text-2xl font-bold text-red-400">{report.failed}</div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-blue-700/30">
              <div className="text-xs text-blue-400 mb-1">Running</div>
              <div className="text-2xl font-bold text-blue-400">{report.running}</div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">Avg Duration</div>
              <div className="text-xl font-bold text-white">{report.avg_duration || '--'}</div>
            </div>
          </div>

          {report.migrations.length === 0 ? (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50">
              <EmptyState
                icon={<FileText className="w-12 h-12" />}
                title="No migration data"
                description="Run migrations to populate this report"
              />
            </div>
          ) : (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-700/30 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      <th className="text-left px-4 py-3">Name</th>
                      <th className="text-left px-4 py-3">VM</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Duration</th>
                      <th className="text-left px-4 py-3">Output</th>
                      <th className="text-left px-4 py-3">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {report.migrations.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{m.name || m.id}</td>
                        <td className="px-4 py-3 text-slate-300 font-mono text-xs max-w-[200px] truncate">
                          {m.vm_name || '--'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(m.status)}`}
                          >
                            {m.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{m.duration || '--'}</td>
                        <td className="px-4 py-3 text-slate-400 font-mono text-xs max-w-[200px] truncate">
                          {m.output_path || '--'}
                        </td>
                        <td className="px-4 py-3 text-red-400 text-xs max-w-[200px] truncate">
                          {m.error || '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
