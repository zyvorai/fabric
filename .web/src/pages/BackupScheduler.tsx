import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api/client'

interface VM { name: string; state?: string }
interface Schedule { id: string; name: string; cron: string; next_run?: string; vms: string[]; enabled: boolean; output_dir: string; retention: number; format: string; compression: boolean }
type Preset = 'daily2am' | 'weeklySunday' | 'every6h' | 'custom'
const presetCrons: Record<Exclude<Preset, 'custom'>, string> = { daily2am: '0 2 * * *', weeklySunday: '0 3 * * 0', every6h: '0 */6 * * *' }

function parseCronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return cron
  const [minute, hour, , , dow] = parts
  if (minute === '0' && hour !== '*' && dow === '*') { const h = parseInt(hour, 10); return `Daily at ${h === 0 ? 12 : h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}` }
  if (minute === '0' && hour !== '*' && dow !== '*') { const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; const h = parseInt(hour, 10); return `Weekly on ${days[parseInt(dow, 10)] || dow} at ${h === 0 ? 12 : h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}` }
  if (hour.startsWith('*/')) return `Every ${hour.replace('*/', '')} hours`
  return cron
}

export default function BackupScheduler() {
  const [vms, setVMs] = useState<VM[]>([])
  const [selectedVMs, setSelectedVMs] = useState<Set<string>>(new Set())
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [preset, setPreset] = useState<Preset>('daily2am')
  const [customCron, setCustomCron] = useState('0 2 * * *')
  const [outputDir, setOutputDir] = useState('/var/lib/vmspawnd/backups')
  const [retention, setRetention] = useState(7)
  const [format, setFormat] = useState('qcow2')
  const [compression, setCompression] = useState(true)
  const [scheduleName, setScheduleName] = useState('')
  const activeCron = preset === 'custom' ? customCron : presetCrons[preset]

  const fetchVMs = useCallback(async () => { try { const resp = await apiFetch('/api/vms'); if (!resp.ok) throw new Error(`HTTP ${resp.status}`); const data = await resp.json(); setVMs(Array.isArray(data) ? data : data.vms || []) } catch (err: any) { setVMs([]); setError(prev => prev || `VMs: ${err.message}`) } }, [])
  const fetchSchedules = useCallback(async () => { try { const resp = await apiFetch('/api/schedules'); if (!resp.ok) throw new Error(`HTTP ${resp.status}`); const data = await resp.json(); setSchedules(Array.isArray(data) ? data : data.schedules || []) } catch (err: any) { setSchedules([]); setError(prev => prev || `Schedules: ${err.message}`) } }, [])

  useEffect(() => { const load = async () => { setLoading(true); await Promise.all([fetchVMs(), fetchSchedules()]); setLoading(false) }; load() }, [fetchVMs, fetchSchedules])

  const toggleVM = (name: string) => { setSelectedVMs((prev) => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next }) }
  const toggleAll = () => { if (selectedVMs.size === vms.length) setSelectedVMs(new Set()); else setSelectedVMs(new Set(vms.map((v) => v.name))) }

  const handleCreate = async () => {
    if (selectedVMs.size === 0) { setError('Select at least one VM'); return }
    if (!scheduleName.trim()) { setError('Enter a schedule name'); return }
    setCreating(true); setError(null); setSuccessMsg(null)
    try {
      const resp = await apiFetch('/api/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: scheduleName, cron: activeCron, vms: Array.from(selectedVMs), output_dir: outputDir, retention, format, compression }) })
      if (!resp.ok) { const body = await resp.json().catch(() => null); throw new Error(body?.error || `HTTP ${resp.status}`) }
      setSuccessMsg('Schedule created successfully'); setScheduleName(''); setSelectedVMs(new Set()); fetchSchedules()
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to create schedule') } finally { setCreating(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold text-white">Backup Scheduler</h2><p className="text-sm text-slate-400 mt-1">Create and manage automated VM backup schedules</p></div>
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
      {successMsg && <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-sm text-green-400">{successMsg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Select VMs</h3>
          {vms.length === 0 ? <p className="text-sm text-slate-500">No VMs available.</p> : (
            <><button onClick={toggleAll} className="text-xs text-blue-400 hover:text-blue-300 mb-3">{selectedVMs.size === vms.length ? 'Deselect All' : 'Select All'}</button>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {vms.map((vm) => (
                <label key={vm.name} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700/30 cursor-pointer transition-colors">
                  <input type="checkbox" checked={selectedVMs.has(vm.name)} onChange={() => toggleVM(vm.name)} className="w-4 h-4 rounded border-slate-600 text-teal-500 focus:ring-teal-500 bg-slate-700" />
                  <span className="text-sm text-slate-300">{vm.name}</span>
                  {vm.state && <span className={`text-xs px-1.5 py-0.5 rounded ${vm.state === 'running' ? 'bg-green-500/20 text-green-400' : 'bg-slate-600/30 text-slate-500'}`}>{vm.state}</span>}
                </label>
              ))}
            </div></>
          )}
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-1">Schedule Configuration</h3>
          <div><label className="block text-xs text-slate-400 mb-1">Schedule Name</label><input type="text" value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} placeholder="e.g. nightly-backup" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Frequency</label>
            <div className="grid grid-cols-2 gap-2">
              {([['daily2am', 'Daily 2 AM'], ['weeklySunday', 'Weekly Sun 3 AM'], ['every6h', 'Every 6h'], ['custom', 'Custom']] as [Preset, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setPreset(id)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${preset === id ? 'bg-teal-600/30 text-teal-300 border border-teal-500/50' : 'bg-slate-700/40 text-slate-400 border border-slate-600/50 hover:bg-slate-700/60'}`}>{label}</button>
              ))}
            </div>
          </div>
          {preset === 'custom' && <div><label className="block text-xs text-slate-400 mb-1">Cron Expression</label><input type="text" value={customCron} onChange={(e) => setCustomCron(e.target.value)} placeholder="0 2 * * *" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:border-teal-500" /></div>}
          <div className="bg-slate-900/40 rounded-lg px-3 py-2 text-xs text-slate-400"><span className="text-slate-500">Schedule:</span> <span className="text-teal-400">{parseCronToHuman(activeCron)}</span></div>
          <div><label className="block text-xs text-slate-400 mb-1">Output Directory</label><input type="text" value={outputDir} onChange={(e) => setOutputDir(e.target.value)} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-teal-500" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-slate-400 mb-1">Retention (keep last N)</label><input type="number" value={retention} onChange={(e) => setRetention(Math.max(1, parseInt(e.target.value, 10) || 1))} min={1} max={365} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Format</label><select value={format} onChange={(e) => setFormat(e.target.value)} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500"><option value="qcow2">QCOW2</option><option value="raw">RAW</option><option value="vmdk">VMDK</option></select></div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={compression} onChange={() => setCompression(!compression)} className="sr-only" /><div className={`relative w-10 h-5 rounded-full transition-colors ${compression ? 'bg-teal-600' : 'bg-slate-600'}`}><div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${compression ? 'translate-x-5' : 'translate-x-0.5'}`} /></div><span className="text-sm text-slate-300">Enable compression</span></label>
          <button onClick={handleCreate} disabled={creating} className="w-full py-2.5 rounded-xl text-sm font-semibold bg-teal-600 hover:bg-teal-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{creating ? 'Creating...' : 'Create Schedule'}</button>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Existing Schedules</h3>
        {schedules.length === 0 ? <p className="text-sm text-slate-500">No backup schedules configured yet.</p> : (
          <div className="space-y-3">
            {schedules.map((sched) => (
              <div key={sched.id} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-900/40 rounded-xl px-4 py-3 border border-slate-700/30">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="text-sm font-medium text-slate-200">{sched.name}</span><span className={`text-xs px-1.5 py-0.5 rounded ${sched.enabled ? 'bg-green-500/20 text-green-400' : 'bg-slate-600/30 text-slate-500'}`}>{sched.enabled ? 'Enabled' : 'Disabled'}</span></div>
                  <div className="text-xs text-slate-500 mt-0.5"><span className="font-mono">{sched.cron}</span><span className="mx-1.5">-</span><span>{parseCronToHuman(sched.cron)}</span></div>
                </div>
                <div className="text-xs text-slate-400 sm:text-right"><div>VMs: {sched.vms?.length || 0}</div>{sched.next_run && <div>Next: {sched.next_run}</div>}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
