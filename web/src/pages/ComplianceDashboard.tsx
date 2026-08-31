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
  if (score >= 90) return 'text-emerald-600'
  if (score >= 70) return 'text-amber-400'
  return 'text-red-600'
}

function scoreBorder(score: number): string {
  if (score >= 90) return 'border-emerald-500'
  if (score >= 70) return 'border-amber-500'
  return 'border-red-500'
}

function statusIcon(status: string) {
  switch (status) {
    case 'pass': return <CheckCircle className="w-5 h-5 text-emerald-600" />
    case 'warning': return <AlertTriangle className="w-5 h-5 text-amber-400" />
    case 'fail': return <XCircle className="w-5 h-5 text-red-600" />
    default: return null
  }
}

function statusBadge(status: string): string {
  switch (status) {
    case 'pass': return 'bg-green-500/20 text-emerald-600'
    case 'warning': return 'bg-amber-500/20 text-amber-400'
    case 'fail': return 'bg-red-500/20 text-red-600'
    default: return 'bg-black/[0.06] text-[#6e6e73]'
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
      const res = await apiFetch('/api/system/compliance/scan', { method: 'POST' })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(formatHttpErrorBody(res.status, res.statusText, body))
      }
      await fetchCompliance()
    } catch (err) {
      toastFailure(toast, 'Compliance scan failed', err)
    } finally { setScanning(false) }
  }

  if (loading && !data && !loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compliance Dashboard" description="Security and configuration compliance posture" />
        <div className="flex items-center justify-center h-64 text-[#6e6e73]">
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
          <button onClick={runScan} disabled={scanning} title="Run compliance scan" className="flex items-center gap-2 px-4 py-2 bg-[#0066cc] hover:bg-[#0077ed] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] p-6 flex flex-col items-center justify-center">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 ${scoreBorder(summary.score)} bg-white`}>
            <span className={`text-3xl font-bold ${scoreColor(summary.score)}`}>{summary.score}</span>
          </div>
          <span className="text-xs text-[#6e6e73] mt-2">Compliance Score</span>
        </div>
        <div className="stat-card-green rounded-xl border border-[#d2d2d7] px-4 py-3 card-glow-green transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-[#1d1d1f]">{summary.passed}</div>
          <div className="text-xs text-[#6e6e73] mt-1">Passed</div>
        </div>
        <div className="stat-card-orange rounded-xl border border-[#d2d2d7] px-4 py-3 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-[#1d1d1f]">{summary.warnings}</div>
          <div className="text-xs text-[#6e6e73] mt-1">Warnings</div>
        </div>
        <div className="stat-card-red rounded-xl border border-[#d2d2d7] px-4 py-3 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-[#1d1d1f]">{summary.failed}</div>
          <div className="text-xs text-[#6e6e73] mt-1">Failed</div>
        </div>
        <div className="stat-card-blue rounded-xl border border-[#d2d2d7] px-4 py-3 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-[#1d1d1f]">{summary.total}</div>
          <div className="text-xs text-[#6e6e73] mt-1">Total Checks</div>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {categories.map(cat => (
          <button key={cat} onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap capitalize ${selectedCategory === cat ? 'bg-[#0066cc]/20 text-[#0066cc] border border-blue-500/30' : 'text-[#6e6e73] hover:text-[#1d1d1f] bg-[#f5f5f7] border border-[#d2d2d7] hover:border-[#d2d2d7]'}`}>
            {cat}
          </button>
        ))}
      </div>

      {filteredChecks.length === 0 ? (
        <div className="bg-[#f5f5f7] rounded-xl p-10 border border-[#d2d2d7] text-center text-[#6e6e73] text-sm">No checks in this category</div>
      ) : (
        <div className="space-y-2">
          {filteredChecks.map((check) => (
            <div key={check.id} className={`bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] p-4 flex items-start gap-4 ${check.status === 'fail' ? 'border-l-4 border-l-red-500' : check.status === 'warning' ? 'border-l-4 border-l-amber-500' : ''}`}>
              {statusIcon(check.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-[#1d1d1f]">{check.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(check.status)}`}>{check.status}</span>
                  <span className="text-xs text-[#6e6e73] capitalize">{check.category}</span>
                </div>
                <p className="text-xs text-[#6e6e73]">{check.description}</p>
                {check.remediation && check.status !== 'pass' && (
                  <div className="mt-2 bg-white rounded-lg p-2 text-xs text-[#1d1d1f]">
                    <span className="text-[#6e6e73]">Fix: </span>{check.remediation}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {summary.last_scan && <div className="text-xs text-[#6e6e73] text-right">Last scan: {new Date(summary.last_scan).toLocaleString()}</div>}
    </div>
  )
}
