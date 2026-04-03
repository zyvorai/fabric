import { useState, useEffect, useMemo } from 'react'
import { Search, CheckSquare, Square, Power, Camera, Loader2, AlertTriangle, CheckCircle, Clock, RefreshCw, Monitor, MinusSquare, Play } from 'lucide-react'
import { apiFetch } from '../api/client'

interface VM { name: string; state: string; cpus?: number; memory?: number }
type BulkAction = 'start' | 'stop' | 'restart' | 'snapshot'
type TaskStatus = 'pending' | 'running' | 'done' | 'error'
interface TaskProgress { vmName: string; action: BulkAction; status: TaskStatus; message?: string }

export default function BulkOperations() {
  const [vms, setVMs] = useState<VM[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searchFilter, setSearchFilter] = useState('')
  const [tasks, setTasks] = useState<TaskProgress[]>([])
  const [running, setRunning] = useState(false)

  const fetchVMs = async () => {
    setLoading(true); setError(null)
    try {
      const res = await apiFetch('/api/vms')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setVMs(Array.isArray(data) ? data : data.vms || [])
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to fetch VMs'); setVMs([]) }
    setLoading(false)
  }

  useEffect(() => { fetchVMs() }, [])

  const filtered = useMemo(() => {
    if (!searchFilter.trim()) return vms
    const q = searchFilter.toLowerCase()
    return vms.filter((vm) => vm.name.toLowerCase().includes(q))
  }, [vms, searchFilter])

  const toggleSelect = (name: string) => {
    setSelected((prev) => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next })
  }
  const selectAll = () => setSelected(new Set(filtered.map((vm) => vm.name)))
  const deselectAll = () => setSelected(new Set())
  const allFilteredSelected = filtered.length > 0 && filtered.every((vm) => selected.has(vm.name))
  const someSelected = selected.size > 0

  const runBulkAction = async (action: BulkAction) => {
    const targets = Array.from(selected)
    if (targets.length === 0) return
    setRunning(true)
    setTasks(targets.map((vmName) => ({ vmName, action, status: 'pending' })))

    for (const vmName of targets) {
      setTasks((prev) => prev.map((t) => t.vmName === vmName ? { ...t, status: 'running' } : t))
      try {
        let url = '', body: any = undefined
        const method = 'POST'
        if (action === 'start') { url = `/api/vms/${vmName}/start` }
        else if (action === 'stop') { url = `/api/vms/${vmName}/stop` }
        else if (action === 'restart') { url = `/api/vms/${vmName}/restart` }
        else if (action === 'snapshot') { url = `/api/snapshots`; body = JSON.stringify({ vm_name: vmName, name: `bulk-snap-${Date.now()}` }) }

        const res = await apiFetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body })
        if (res.ok) { setTasks((prev) => prev.map((t) => t.vmName === vmName ? { ...t, status: 'done', message: 'Success' } : t)) }
        else {
          const b = await res.json().catch(() => null)
          setTasks((prev) => prev.map((t) => t.vmName === vmName ? { ...t, status: 'error', message: b?.error || `HTTP ${res.status}` } : t))
        }
      } catch (err) {
        setTasks((prev) => prev.map((t) => t.vmName === vmName ? { ...t, status: 'error', message: err instanceof Error ? err.message : 'Request failed' } : t))
      }
    }
    setRunning(false)
  }

  const statusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4 text-slate-400" />
      case 'running': return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
      case 'done': return <CheckCircle className="w-4 h-4 text-green-400" />
      case 'error': return <AlertTriangle className="w-4 h-4 text-red-400" />
    }
  }

  const stateColor = (state: string) => {
    const s = state?.toLowerCase() || ''
    if (s === 'running') return 'text-green-400'
    if (s === 'paused') return 'text-yellow-400'
    return 'text-slate-400'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Bulk Operations</h2>
        <button onClick={fetchVMs} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {someSelected && (
        <div className="flex items-center gap-3 bg-blue-600/10 border border-blue-500/30 rounded-xl px-4 py-3">
          <span className="text-sm text-blue-400 font-medium">{selected.size} selected</span>
          <div className="flex-1" />
          <button onClick={() => runBulkAction('start')} disabled={running} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-500/20 hover:bg-green-500/30 text-green-400 transition-colors disabled:opacity-50">
            <Play className="w-3.5 h-3.5" /> Start
          </button>
          <button onClick={() => runBulkAction('stop')} disabled={running} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors disabled:opacity-50">
            <Power className="w-3.5 h-3.5" /> Stop
          </button>
          <button onClick={() => runBulkAction('restart')} disabled={running} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 transition-colors disabled:opacity-50">
            <RefreshCw className="w-3.5 h-3.5" /> Restart
          </button>
          <button onClick={() => runBulkAction('snapshot')} disabled={running} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 transition-colors disabled:opacity-50">
            <Camera className="w-3.5 h-3.5" /> Snapshot
          </button>
          <button onClick={deselectAll} className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white transition-colors">Clear</button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} placeholder="Filter VMs..." aria-label="Filter VMs"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={allFilteredSelected ? deselectAll : selectAll} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
          {allFilteredSelected ? <MinusSquare className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
          {allFilteredSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /><span className="ml-3 text-sm text-slate-400">Loading VMs...</span></div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center"><AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" /><p className="text-sm text-red-400">{error}</p></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><Monitor className="w-10 h-10 mx-auto mb-3 opacity-50" /><p className="text-sm">{vms.length === 0 ? 'No VMs found' : 'No VMs match the filter'}</p></div>
      ) : (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-700/50">
              <th className="px-4 py-3 text-left w-10"><span className="sr-only">Select</span></th>
              <th className="px-4 py-3 text-left text-slate-400 font-medium">Name</th>
              <th className="px-4 py-3 text-left text-slate-400 font-medium">State</th>
              <th className="px-4 py-3 text-left text-slate-400 font-medium hidden md:table-cell">CPU</th>
              <th className="px-4 py-3 text-left text-slate-400 font-medium hidden md:table-cell">Memory</th>
            </tr></thead>
            <tbody>
              {filtered.map((vm) => {
                const isSelected = selected.has(vm.name)
                return (
                  <tr key={vm.name} onClick={() => toggleSelect(vm.name)} className={`border-b border-slate-700/30 cursor-pointer transition-colors ${isSelected ? 'bg-blue-600/10' : 'hover:bg-slate-800/50'}`}>
                    <td className="px-4 py-3">{isSelected ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4 text-slate-600" />}</td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><Monitor className="w-4 h-4 text-slate-500" /><span className="text-white font-medium">{vm.name}</span></div></td>
                    <td className="px-4 py-3"><span className={`font-medium ${stateColor(vm.state)}`}>{vm.state || 'unknown'}</span></td>
                    <td className="px-4 py-3 text-slate-400 hidden md:table-cell">{vm.cpus ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-400 hidden md:table-cell">{vm.memory ? `${(vm.memory / 1024 / 1024).toFixed(0)} MB` : '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Batch Progress{running && <Loader2 className="inline-block w-4 h-4 ml-2 text-blue-400 animate-spin" />}</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {tasks.map((t) => (
              <div key={t.vmName} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/50">
                {statusIcon(t.status)}
                <span className="text-sm text-white font-medium flex-1">{t.vmName}</span>
                <span className="text-xs text-slate-400 capitalize">{t.action}</span>
                {t.message && <span className={`text-xs ${t.status === 'error' ? 'text-red-400' : 'text-green-400'}`}>{t.message}</span>}
              </div>
            ))}
          </div>
          {!running && tasks.length > 0 && <button onClick={() => setTasks([])} className="mt-3 text-xs text-slate-500 hover:text-slate-300 transition-colors">Clear results</button>}
        </div>
      )}
    </div>
  )
}
