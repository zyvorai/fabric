import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api/client'

interface VMOption { name: string; state?: string }
interface HealthCheck { name: string; status: string; message: string; detail?: string }
interface HealthCheckResult { vm: string; overall: string; checks: HealthCheck[]; timestamp: string }

function StatusIcon({ status }: { status: string }) {
  if (status === 'pass') return <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-xs">&#10003;</span>
  if (status === 'warning') return <span className="flex items-center justify-center w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-400 text-xs">&#9888;</span>
  return <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-500/20 text-red-400 text-xs">&#10007;</span>
}

export default function VMHealthCheck() {
  const [vms, setVMs] = useState<VMOption[]>([])
  const [selectedVM, setSelectedVM] = useState('')
  const [result, setResult] = useState<HealthCheckResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingVMs, setLoadingVMs] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchVMs = useCallback(async () => {
    setLoadingVMs(true)
    try {
      const res = await apiFetch('/api/vms')
      if (res.ok) {
        const data = await res.json()
        const vmList = Array.isArray(data) ? data : data.vms || []
        setVMs(vmList.map((vm: any) => ({ name: vm.name, state: vm.state })))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch VMs')
    } finally { setLoadingVMs(false) }
  }, [])

  useEffect(() => { fetchVMs() }, [fetchVMs])

  const runHealthCheck = async () => {
    if (!selectedVM) return
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await apiFetch(`/api/vms/${encodeURIComponent(selectedVM)}/healthcheck`)
      if (!res.ok) { const body = await res.json().catch(() => null); throw new Error(body?.error || `HTTP ${res.status}`) }
      setResult(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed')
    } finally { setLoading(false) }
  }

  if (loadingVMs) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 flex flex-col items-center justify-center text-slate-500 gap-3">
        <div className="w-6 h-6 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
        <span className="text-sm">Loading VMs...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-white">VM Health Check</h2>
        <p className="text-xs text-slate-400 mt-0.5">Run health verification checks on a VM</p>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Select VM</label>
            <select value={selectedVM} onChange={(e) => setSelectedVM(e.target.value)}
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Select a VM...</option>
              {vms.map((vm) => (<option key={vm.name} value={vm.name}>{vm.name} {vm.state ? `(${vm.state})` : ''}</option>))}
            </select>
          </div>
          <div>
            <button onClick={runHealthCheck} disabled={!selectedVM || loading}
              className="w-full px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:text-slate-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed">
              {loading ? 'Checking...' : 'Run Health Check'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="bg-slate-800/50 rounded-xl p-4 border border-red-700/50"><div className="text-red-400 text-sm">{error}</div></div>}

      {loading && (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 flex flex-col items-center justify-center text-slate-500 gap-3">
          <div className="w-6 h-6 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-sm">Running health checks on {selectedVM}...</span>
        </div>
      )}

      {result && !loading && (
        <div className="flex flex-col gap-4">
          <div className={`rounded-xl p-4 border flex items-center gap-3 ${result.overall === 'healthy' ? 'bg-green-500/10 border-green-700/50' : 'bg-red-500/10 border-red-700/50'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${result.overall === 'healthy' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {result.overall === 'healthy' ? '\u2713' : '\u26A0'}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">{result.overall === 'healthy' ? 'Healthy' : 'Issues Found'}</div>
              <div className="text-xs text-slate-400">{result.checks.filter((c) => c.status === 'pass').length} of {result.checks.length} checks passed for {result.vm}</div>
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 divide-y divide-slate-700/50">
            {result.checks.map((check, idx) => (
              <div key={idx} className="flex items-start gap-3 p-4">
                <StatusIcon status={check.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{check.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{check.message}</div>
                  {check.detail && <div className="text-xs text-slate-500 mt-1 font-mono truncate">{check.detail}</div>}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${check.status === 'pass' ? 'bg-green-500/20 text-green-400' : check.status === 'warning' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                  {check.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!result && !error && !loading && (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 flex flex-col items-center justify-center text-slate-500 gap-2">
          <span className="text-sm">Select a VM and run a health check</span>
        </div>
      )}
    </div>
  )
}
