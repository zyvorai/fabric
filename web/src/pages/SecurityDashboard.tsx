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

function severityColor(severity: string): string {
  const s = (severity || '').toLowerCase()
  if (s === 'critical' || s === 'high') return 'bg-red-500/10 text-red-600'
  if (s === 'warning' || s === 'medium') return 'bg-amber-500/10 text-amber-400'
  if (s === 'info' || s === 'low') return 'bg-blue-500/10 text-[#0066cc]'
  return 'bg-black/[0.04] text-[#6e6e73]'
}

function riskColor(score: number): string {
  if (score >= 80) return 'text-red-600'
  if (score >= 50) return 'text-amber-400'
  return 'text-emerald-600'
}

function riskBg(score: number): string {
  if (score >= 80) return 'border-red-500'
  if (score >= 50) return 'border-amber-500'
  return 'border-emerald-500'
}

export default function SecurityDashboard() {
  const toast = useToastContext()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/system/security')
      if (!res.ok) {
        const body = await res.text()
        throw new Error(formatHttpErrorBody(res.status, res.statusText, body))
      }
      setData(await res.json())
      setLoadError(null)
      setRefreshError(null)
    } catch (err) {
      const msg = formatUserError(err)
      setData((prev: any) => {
        if (prev == null) {
          setLoadError(msg)
          toastFailure(toast, 'Failed to load security data', err)
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
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [fetchData])

  const riskScore = data?.risk_score ?? 0
  const alerts: any[] = data?.alerts || []
  const failedLogins: any[] = data?.failed_logins || []
  const listeningPorts: any[] = data?.listening_ports || []

  if (loading && !data && !loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Security" description="Security posture and threat monitoring" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        description="Security posture and threat monitoring"
        onRefresh={fetchData}
        refreshing={loading}
      />

      {loadError && (
        <ErrorBanner
          title="Could not load security data"
          headline={loadError}
          hints={hintsForError(loadError, 'auth')}
          onRetry={fetchData}
        />
      )}

      {refreshError && !loadError && (
        <div className="bg-amber-500/10 rounded-lg border border-amber-500/30 px-4 py-2 text-xs text-amber-400">
          Refresh failed: {refreshError} — showing last known data
        </div>
      )}

      {!loadError && (
        <>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="stat-card-red rounded-xl border border-[#d2d2d7] p-6 flex flex-col items-center justify-center">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center bg-white border-4 ${riskBg(riskScore)}`}>
            <span className={`text-3xl font-bold ${riskColor(riskScore)}`}>{riskScore}</span>
          </div>
          <span className="text-xs text-[#6e6e73] mt-2">Risk Score</span>
        </div>

        <div className="stat-card-red rounded-xl border border-[#d2d2d7] px-4 py-3 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-[#1d1d1f]">{alerts.filter((a: any) => (a.severity || '').toLowerCase() === 'critical').length}</div>
          <div className="text-xs text-[#6e6e73] mt-1">Critical Alerts</div>
        </div>
        <div className="stat-card-orange rounded-xl border border-[#d2d2d7] px-4 py-3 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-[#1d1d1f]">{alerts.filter((a: any) => (a.severity || '').toLowerCase() === 'warning').length}</div>
          <div className="text-xs text-[#6e6e73] mt-1">Warnings</div>
        </div>
        <div className="stat-card-blue rounded-xl border border-[#d2d2d7] px-4 py-3 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-[#1d1d1f]">{failedLogins.length}</div>
          <div className="text-xs text-[#6e6e73] mt-1">Failed Logins</div>
        </div>
      </div>

      <div className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#d2d2d7] flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#1d1d1f]">Security Alerts</h3>
          <span className="text-xs font-medium text-[#6e6e73] bg-[#e8e8ed] px-2.5 py-1 rounded-full">
            {alerts.length} alerts
          </span>
        </div>
        {alerts.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#6e6e73]">No active alerts</div>
        ) : (
          <div className="divide-y divide-[#d2d2d7]/30">
            {alerts.map((alert: any, i: number) => (
              <div key={i} className="px-5 py-3 table-row-hover flex items-start gap-3">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${severityColor(alert.severity)}`}>
                  {alert.severity || 'unknown'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#1d1d1f]">{alert.message || alert.title || 'No description'}</div>
                  {alert.source && <div className="text-[10px] text-[#6e6e73] mt-0.5">Source: {alert.source}</div>}
                  {alert.timestamp && <div className="text-[10px] text-[#6e6e73]">{new Date(alert.timestamp).toLocaleString()}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {failedLogins.length > 0 && (
        <div className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#d2d2d7]">
            <h3 className="text-base font-semibold text-[#1d1d1f]">Failed Logins</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#d2d2d7]">
                  <th className="text-left px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Time</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">User</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d2d2d7]/30">
                {failedLogins.map((login: any, i: number) => (
                  <tr key={i} className="table-row-hover">
                    <td className="px-5 py-2 text-xs text-[#6e6e73]">
                      {login.timestamp ? new Date(login.timestamp).toLocaleString() : login.time || '-'}
                    </td>
                    <td className="px-5 py-2 text-xs text-[#1d1d1f]">{login.user || login.username || '-'}</td>
                    <td className="px-5 py-2 text-xs text-[#1d1d1f] font-mono">{login.source || login.ip || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {listeningPorts.length > 0 && (
        <div className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#d2d2d7] flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#1d1d1f]">Listening Ports</h3>
            <span className="text-xs font-medium text-[#6e6e73] bg-[#e8e8ed] px-2.5 py-1 rounded-full">
              {listeningPorts.length} ports
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#d2d2d7]">
                  <th className="text-left px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Port</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Protocol</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Process</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">PID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d2d2d7]/30">
                {listeningPorts.map((port: any, i: number) => (
                  <tr key={i} className="table-row-hover">
                    <td className="px-5 py-2 text-xs text-[#1d1d1f] font-mono">{port.port ?? '-'}</td>
                    <td className="px-5 py-2 text-xs text-[#1d1d1f]">{port.protocol || 'tcp'}</td>
                    <td className="px-5 py-2 text-xs text-[#1d1d1f]">{port.process || '-'}</td>
                    <td className="px-5 py-2 text-xs text-[#6e6e73] font-mono">{port.pid ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}
