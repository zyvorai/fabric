import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api/client'

interface VMOption { name: string; state?: string }
interface CompareField { label: string; source: string; target: string; match: boolean }
interface CompareResult { source_name: string; target_name: string; fields: CompareField[]; timestamp: string }

export default function VMCompare() {
  const [vms, setVMs] = useState<VMOption[]>([])
  const [sourceVM, setSourceVM] = useState('')
  const [targetVM, setTargetVM] = useState('')
  const [result, setResult] = useState<CompareResult | null>(null)
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
        setVMs(vmList.map((vm: any) => ({ name: vm.name || vm.Name || '', state: vm.state })))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch VMs')
    } finally { setLoadingVMs(false) }
  }, [])

  useEffect(() => { fetchVMs() }, [fetchVMs])

  const handleCompare = async () => {
    if (!sourceVM || !targetVM) return
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await apiFetch(`/api/vms/compare?source=${encodeURIComponent(sourceVM)}&target=${encodeURIComponent(targetVM)}`)
      if (!res.ok) { const body = await res.json().catch(() => null); throw new Error(body?.error || `HTTP ${res.status}`) }
      setResult(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed')
    } finally { setLoading(false) }
  }

  if (loadingVMs) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 flex flex-col items-center justify-center text-slate-500 gap-3">
        <div className="w-6 h-6 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
        <span className="text-sm">Loading VM lists...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-white">VM Comparison</h2>
        <p className="text-xs text-slate-400 mt-0.5">Compare two VM configurations side-by-side</p>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Source VM</label>
            <select value={sourceVM} onChange={(e) => setSourceVM(e.target.value)}
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Select source VM...</option>
              {vms.map((vm) => (<option key={vm.name} value={vm.name}>{vm.name} {vm.state ? `(${vm.state})` : ''}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Target VM</label>
            <select value={targetVM} onChange={(e) => setTargetVM(e.target.value)}
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Select target VM...</option>
              {vms.filter(v => v.name !== sourceVM).map((vm) => (<option key={vm.name} value={vm.name}>{vm.name} {vm.state ? `(${vm.state})` : ''}</option>))}
            </select>
          </div>
          <div>
            <button onClick={handleCompare} disabled={!sourceVM || !targetVM || loading}
              className="w-full px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:text-slate-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed">
              {loading ? 'Comparing...' : 'Compare'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="bg-slate-800/50 rounded-xl p-4 border border-red-700/50"><div className="text-red-400 text-sm">{error}</div></div>}

      {result && (
        <div className="flex flex-col gap-4">
          {(() => {
            const allMatch = result.fields.every((f) => f.match)
            return (
              <div className={`rounded-xl p-4 border flex items-center gap-3 ${allMatch ? 'bg-green-500/10 border-green-700/50' : 'bg-amber-500/10 border-amber-700/50'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${allMatch ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  {allMatch ? '\u2713' : '\u26A0'}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{allMatch ? 'VMs Match' : 'Differences Found'}</div>
                  <div className="text-xs text-slate-400">{result.fields.filter((f) => f.match).length} of {result.fields.length} fields match</div>
                </div>
              </div>
            )
          })()}

          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="grid grid-cols-4 gap-0 bg-slate-700/30 px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <div>Property</div>
              <div>Source ({result.source_name})</div>
              <div>Target ({result.target_name})</div>
              <div className="text-center">Status</div>
            </div>
            <div className="divide-y divide-slate-700/50">
              {result.fields.map((field, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-0 px-4 py-3 items-center">
                  <div className="text-sm font-medium text-white">{field.label}</div>
                  <div className="text-sm text-slate-300 font-mono">{field.source || '--'}</div>
                  <div className="text-sm text-slate-300 font-mono">{field.target || '--'}</div>
                  <div className="flex justify-center">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${field.match ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {field.match ? '\u2713' : '\u2717'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!result && !error && !loading && (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 flex flex-col items-center justify-center text-slate-500 gap-2">
          <span className="text-sm">Select source and target VMs to compare</span>
        </div>
      )}
    </div>
  )
}
