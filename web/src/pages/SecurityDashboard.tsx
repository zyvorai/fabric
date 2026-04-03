import { useState, useEffect } from 'react'
import { apiFetch } from '../api/client'

function severityColor(severity: string): string {
  const s = (severity || '').toLowerCase()
  if (s === 'critical' || s === 'high') return 'bg-red-500/10 text-red-400'
  if (s === 'warning' || s === 'medium') return 'bg-amber-500/10 text-amber-400'
  if (s === 'info' || s === 'low') return 'bg-blue-500/10 text-blue-400'
  return 'bg-slate-500/10 text-slate-400'
}

function riskColor(score: number): string {
  if (score >= 80) return 'text-red-400'
  if (score >= 50) return 'text-amber-400'
  return 'text-emerald-400'
}

function riskBg(score: number): string {
  if (score >= 80) return 'border-red-500'
  if (score >= 50) return 'border-amber-500'
  return 'border-emerald-500'
}

export default function SecurityDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const fetchData = () => {
      apiFetch('/api/system/security')
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then((json) => {
          if (active) {
            setData(json)
            setError(null)
            setLoading(false)
          }
        })
        .catch((err) => {
          if (active) {
            setError(err.message)
            setLoading(false)
          }
        })
    }

    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="bg-red-500/10 rounded-xl border border-red-500/30 p-6 text-center">
        <p className="text-sm font-semibold text-red-400">Failed to load security data</p>
        <p className="text-xs text-red-400/70 mt-1">{error}</p>
        <button onClick={() => { setLoading(true); setError(null) }} className="mt-3 px-4 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors">Retry</button>
      </div>
    )
  }

  const riskScore = data?.risk_score ?? 0
  const alerts: any[] = data?.alerts || []
  const failedLogins: any[] = data?.failed_logins || []
  const listeningPorts: any[] = data?.listening_ports || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gradient-purple">Security</h1>
        <p className="text-sm text-slate-400 mt-1">Security posture and threat monitoring</p>
      </div>

      {error && (
        <div className="bg-amber-500/10 rounded-lg border border-amber-500/30 px-4 py-2 text-xs text-amber-400">
          Connection issue: {error} - showing last known data
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="stat-card-red rounded-xl border border-slate-700/50 p-6 flex flex-col items-center justify-center">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center bg-slate-900/50 border-4 ${riskBg(riskScore)}`}>
            <span className={`text-3xl font-bold ${riskColor(riskScore)}`}>{riskScore}</span>
          </div>
          <span className="text-xs text-slate-400 mt-2">Risk Score</span>
        </div>

        <div className="stat-card-red rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{alerts.filter((a: any) => (a.severity || '').toLowerCase() === 'critical').length}</div>
          <div className="text-xs text-slate-400 mt-1">Critical Alerts</div>
        </div>
        <div className="stat-card-orange rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{alerts.filter((a: any) => (a.severity || '').toLowerCase() === 'warning').length}</div>
          <div className="text-xs text-slate-400 mt-1">Warnings</div>
        </div>
        <div className="stat-card-blue rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{failedLogins.length}</div>
          <div className="text-xs text-slate-400 mt-1">Failed Logins</div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Security Alerts</h3>
          <span className="text-xs font-medium text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">
            {alerts.length} alerts
          </span>
        </div>
        {alerts.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No active alerts</div>
        ) : (
          <div className="divide-y divide-slate-700/30">
            {alerts.map((alert: any, i: number) => (
              <div key={i} className="px-5 py-3 table-row-hover flex items-start gap-3">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${severityColor(alert.severity)}`}>
                  {alert.severity || 'unknown'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white">{alert.message || alert.title || 'No description'}</div>
                  {alert.source && <div className="text-[10px] text-slate-500 mt-0.5">Source: {alert.source}</div>}
                  {alert.timestamp && <div className="text-[10px] text-slate-500">{new Date(alert.timestamp).toLocaleString()}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {failedLogins.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50">
            <h3 className="text-base font-semibold text-white">Failed Logins</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Time</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {failedLogins.map((login: any, i: number) => (
                  <tr key={i} className="table-row-hover">
                    <td className="px-5 py-2 text-xs text-slate-400">
                      {login.timestamp ? new Date(login.timestamp).toLocaleString() : login.time || '-'}
                    </td>
                    <td className="px-5 py-2 text-xs text-white">{login.user || login.username || '-'}</td>
                    <td className="px-5 py-2 text-xs text-slate-300 font-mono">{login.source || login.ip || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {listeningPorts.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Listening Ports</h3>
            <span className="text-xs font-medium text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">
              {listeningPorts.length} ports
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Port</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Protocol</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Process</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">PID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {listeningPorts.map((port: any, i: number) => (
                  <tr key={i} className="table-row-hover">
                    <td className="px-5 py-2 text-xs text-white font-mono">{port.port ?? '-'}</td>
                    <td className="px-5 py-2 text-xs text-slate-300">{port.protocol || 'tcp'}</td>
                    <td className="px-5 py-2 text-xs text-slate-300">{port.process || '-'}</td>
                    <td className="px-5 py-2 text-xs text-slate-400 font-mono">{port.pid ?? '-'}</td>
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
