// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { Shield, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { apiFetch } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import { PageHeader } from '../components/ui'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

interface ComplianceCheck {
  id: string
  category: string
  name: string
  status: 'pass' | 'warning' | 'fail'
  description: string
  remediation?: string
}

interface ComplianceSummary {
  score: number
  total: number
  passed: number
  warnings: number
  failed: number
  categories: string[]
  checks: ComplianceCheck[]
  last_scan: string
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-400'
  if (score >= 70) return 'text-amber-400'
  return 'text-red-400'
}

function scoreBorder(score: number): string {
  if (score >= 90) return 'border-emerald-500'
  if (score >= 70) return 'border-amber-500'
  return 'border-red-500'
}

function statusIcon(status: string) {
  switch (status) {
    case 'pass': return <CheckCircle className="w-5 h-5 text-green-400" />
    case 'warning': return <AlertTriangle className="w-5 h-5 text-amber-400" />
    case 'fail': return <XCircle className="w-5 h-5 text-red-400" />
    default: return null
  }
}

function statusBadge(status: string): string {
  switch (status) {
    case 'pass': return 'bg-green-500/20 text-green-400'
    case 'warning': return 'bg-amber-500/20 text-amber-400'
    case 'fail': return 'bg-red-500/20 text-red-400'
    default: return 'bg-slate-500/20 text-slate-400'
  }
}

export default function ComplianceDashboard() {
  const toast = useToastContext()
  const [data, setData] = useState<ComplianceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [scanning, setScanning] = useState(false)

  const fetchCompliance = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/system/compliance')
      if (!res.ok) {
        const body = await res.text()
        throw new Error(formatHttpErrorBody(res.status, res.statusText, body))
      }
      setData(await res.json())
      setLoadError(null)
      setRefreshError(null)
    } catch (err) {
      const msg = formatUserError(err)
      setData((prev) => {
        if (prev == null) {
          setLoadError(msg)
          toastFailure(toast, 'Failed to load compliance data', err)
        } else {
          setRefreshError(msg)
        }
        return prev
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchCompliance() }, [fetchCompliance])

  const runScan = async () => {
    setScanning(true)
    try {
      await apiFetch('/api/system/compliance/scan', { method: 'POST' })
      await fetchCompliance()
    } catch (err) { console.error('Compliance scan failed:', err) } finally { setScanning(false) }
  }

  if (loading && !data && !loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compliance Dashboard" description="Security and configuration compliance posture" />
        <div className="flex items-center justify-center h-64 text-slate-400">
          <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mr-3" />
          Running compliance checks…
        </div>
      </div>
    )
  }

  const summary = data || { score: 0, total: 0, passed: 0, warnings: 0, failed: 0, categories: [], checks: [], last_scan: '' }
  const categories = ['all', ...summary.categories]
  const filteredChecks = selectedCategory === 'all' ? summary.checks : summary.checks.filter(c => c.category === selectedCategory)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance Dashboard"
        description="Security and configuration compliance posture"
        onRefresh={fetchCompliance}
        refreshing={loading}
        actions={
          <button onClick={runScan} disabled={scanning} title="Run compliance scan" className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            <Shield className={`w-4 h-4 ${scanning ? 'animate-pulse' : ''}`} /> {scanning ? 'Scanning…' : 'Run Scan'}
          </button>
        }
      />

      {loadError && (
        <ErrorBanner
          title="Could not load compliance data"
          headline={loadError}
          hints={hintsForError(loadError)}
          onRetry={fetchCompliance}
        />
      )}
      {refreshError && !loadError && (
        <div className="bg-amber-500/10 rounded-lg border border-amber-500/30 px-4 py-2 text-xs text-amber-400">
          {refreshError} — showing last known data
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 flex flex-col items-center justify-center">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 ${scoreBorder(summary.score)} bg-slate-900/50`}>
            <span className={`text-3xl font-bold ${scoreColor(summary.score)}`}>{summary.score}</span>
          </div>
          <span className="text-xs text-slate-400 mt-2">Compliance Score</span>
        </div>
        <div className="stat-card-green rounded-xl border border-slate-700/50 p-5 card-glow-green transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{summary.passed}</div>
          <div className="text-xs text-slate-400 mt-1">Passed</div>
        </div>
        <div className="stat-card-orange rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{summary.warnings}</div>
          <div className="text-xs text-slate-400 mt-1">Warnings</div>
        </div>
        <div className="stat-card-red rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{summary.failed}</div>
          <div className="text-xs text-slate-400 mt-1">Failed</div>
        </div>
        <div className="stat-card-blue rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{summary.total}</div>
          <div className="text-xs text-slate-400 mt-1">Total Checks</div>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {categories.map(cat => (
          <button key={cat} onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap capitalize ${selectedCategory === cat ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:text-slate-200 bg-slate-800/50 border border-slate-700 hover:border-slate-600'}`}>
            {cat}
          </button>
        ))}
      </div>

      {filteredChecks.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500 text-sm">No checks in this category</div>
      ) : (
        <div className="space-y-2">
          {filteredChecks.map((check) => (
            <div key={check.id} className={`bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 flex items-start gap-4 ${check.status === 'fail' ? 'border-l-4 border-l-red-500' : check.status === 'warning' ? 'border-l-4 border-l-amber-500' : ''}`}>
              {statusIcon(check.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-white">{check.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(check.status)}`}>{check.status}</span>
                  <span className="text-xs text-slate-600 capitalize">{check.category}</span>
                </div>
                <p className="text-xs text-slate-400">{check.description}</p>
                {check.remediation && check.status !== 'pass' && (
                  <div className="mt-2 bg-slate-900/50 rounded-lg p-2 text-xs text-slate-300">
                    <span className="text-slate-500">Fix: </span>{check.remediation}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {summary.last_scan && <div className="text-xs text-slate-600 text-right">Last scan: {new Date(summary.last_scan).toLocaleString()}</div>}
    </div>
  )
}
