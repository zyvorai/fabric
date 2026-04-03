import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api/client'

function severityBorderClass(severity: string): string {
  switch (severity) {
    case 'critical': return 'border-l-red-500'
    case 'warning': return 'border-l-amber-500'
    default: return 'border-l-blue-500'
  }
}

function severityBadgeClasses(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-red-500/20 text-red-400'
    case 'warning': return 'bg-amber-500/20 text-amber-400'
    default: return 'bg-blue-500/20 text-blue-400'
  }
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<any[]>([])
  const [rules, setRules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await apiFetch('/api/system/alerts')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setAlerts(Array.isArray(data) ? data : data.alerts ?? [])
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchRules = useCallback(async () => {
    try {
      const res = await apiFetch('/api/system/alerts/rules')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setRules(Array.isArray(data) ? data : data.rules ?? [])
    } catch {
      // rules are non-critical
    }
  }, [])

  useEffect(() => {
    fetchAlerts()
    fetchRules()
    const interval = setInterval(fetchAlerts, 5000)
    return () => clearInterval(interval)
  }, [fetchAlerts, fetchRules])

  const activeCount = alerts.length
  const criticalCount = alerts.filter((a: any) => a.severity === 'critical').length
  const warningCount = alerts.filter((a: any) => a.severity === 'warning').length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mr-3" />
        Loading alerts...
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-500/10 rounded-xl border border-red-500/30 p-6 text-center">
        <p className="text-red-400 font-medium">Failed to load alerts</p>
        <p className="text-red-400/70 text-sm mt-1">{error}</p>
        <button
          onClick={fetchAlerts}
          title="Retry"
          className="mt-3 px-4 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Alerts</h1>
        <p className="text-sm text-slate-400 mt-1">System alerts and notification rules</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="text-xs text-slate-400 mb-1">Active Alerts</div>
          <div className="text-2xl font-bold text-white">{activeCount}</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="text-xs text-slate-400 mb-1">Critical</div>
          <div className="text-2xl font-bold text-red-400">{criticalCount}</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="text-xs text-slate-400 mb-1">Warning</div>
          <div className="text-2xl font-bold text-amber-400">{warningCount}</div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Active Alerts</h2>
        {alerts.length === 0 ? (
          <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 flex flex-col items-center justify-center text-slate-500 gap-3">
            <span className="text-sm">No active alerts</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {alerts.map((alert: any, idx: number) => (
              <div
                key={alert.id ?? idx}
                className={`bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 border-l-4 ${severityBorderClass(alert.severity)}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${severityBadgeClasses(alert.severity)}`}>
                    {alert.severity}
                  </span>
                  <span className="text-xs text-slate-500">
                    {alert.timestamp ? new Date(alert.timestamp).toLocaleString() : ''}
                  </span>
                </div>
                <div className="text-sm font-semibold text-white mb-1">{alert.title ?? alert.name ?? 'Alert'}</div>
                <div className="text-sm text-slate-400">{alert.message}</div>
                {alert.value !== undefined && (
                  <div className="text-xs text-slate-500 mt-2">Value: {alert.value}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {rules.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Alert Rules</h2>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Condition</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Threshold</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Severity</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule: any, idx: number) => (
                  <tr key={rule.name ?? idx} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{rule.name}</td>
                    <td className="px-4 py-3 text-slate-300">{rule.condition}</td>
                    <td className="px-4 py-3 text-slate-300">{rule.threshold}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${severityBadgeClasses(rule.severity)}`}>
                        {rule.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${rule.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {rule.enabled ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
