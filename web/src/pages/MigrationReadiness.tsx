// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api/client'
import Breadcrumb from '../components/Breadcrumb'
import ErrorBanner from '../components/ErrorBanner'
import { PageHeader } from '../components/ui'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

interface ReadinessCheck {
  name: string
  status: string
  message: string
  detail?: string
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'ok') {
    return (
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-xs">
        &#10003;
      </span>
    )
  }
  if (status === 'warning') {
    return (
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-400 text-xs">
        &#9888;
      </span>
    )
  }
  return (
    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-500/20 text-red-400 text-xs">
      &#10007;
    </span>
  )
}

export default function MigrationReadiness() {
  const toast = useToastContext()
  const [checks, setChecks] = useState<ReadinessCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchReadiness = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const resp = await apiFetch('/api/migrations/readiness')
      if (!resp.ok) {
        const body = await resp.text()
        throw new Error(formatHttpErrorBody(resp.status, resp.statusText, body))
      }
      const data = await resp.json()
      setChecks(data.checks || [])
    } catch (err) {
      const msg = formatUserError(err)
      setLoadError(msg)
      toastFailure(toast, 'Failed to check migration readiness', err)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchReadiness()
  }, [fetchReadiness])

  const hasIssues = checks.some((c) => c.status !== 'ok')
  const errorCount = checks.filter((c) => c.status === 'error').length
  const warningCount = checks.filter((c) => c.status === 'warning').length

  return (
    <div className="space-y-6">
      <Breadcrumb />
      <PageHeader
        title="Migration Readiness"
        description="Pre-flight checks before starting a migration"
        onRefresh={fetchReadiness}
        refreshing={loading}
      />

      {loadError && (
        <ErrorBanner
          title="Could not run readiness checks"
          headline={loadError}
          hints={hintsForError(loadError)}
          onRetry={fetchReadiness}
        />
      )}

      {loading && !loadError ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 flex flex-col items-center justify-center text-slate-500 gap-3">
          <div className="w-6 h-6 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-sm">Checking migration readiness…</span>
        </div>
      ) : !loadError ? (
        <div className="flex flex-col gap-4">
          <div
            className={`rounded-xl p-4 border flex items-center justify-between ${
              hasIssues ? 'bg-yellow-500/10 border-yellow-700/50' : 'bg-green-500/10 border-green-700/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  hasIssues ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'
                }`}
              >
                {hasIssues ? '\u26A0' : '\u2713'}
              </div>
              <div>
                <div className="text-sm font-semibold text-white">
                  {hasIssues ? 'Issues Found' : 'Ready for Migration'}
                </div>
                <div className="text-xs text-slate-400">
                  {hasIssues
                    ? `${errorCount} error${errorCount !== 1 ? 's' : ''}, ${warningCount} warning${warningCount !== 1 ? 's' : ''}`
                    : `All ${checks.length} checks passed`}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 divide-y divide-slate-700/50">
            {checks.map((check, idx) => (
              <div key={idx} className="flex items-start gap-3 p-4">
                <StatusIcon status={check.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{check.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{check.message}</div>
                  {check.detail && (
                    <div className="text-xs text-slate-500 mt-1 font-mono truncate">{check.detail}</div>
                  )}
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    check.status === 'ok'
                      ? 'bg-green-500/20 text-green-400'
                      : check.status === 'warning'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {check.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
