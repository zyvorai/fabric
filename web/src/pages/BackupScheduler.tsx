// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api/client'
import { listVMs } from '../api/vm'
import ErrorBanner from '../components/ErrorBanner'
import { PageHeader } from '../components/ui'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

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
  const toast = useToastContext()
  const [vms, setVMs] = useState<VM[]>([])
  const [selectedVMs, setSelectedVMs] = useState<Set<string>>(new Set())
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [preset, setPreset] = useState<Preset>('daily2am')
  const [customCron, setCustomCron] = useState('0 2 * * *')
  const [outputDir, setOutputDir] = useState('/var/lib/zyvor-fabricd/backups')
  const [retention, setRetention] = useState(7)
  const [format, setFormat] = useState('qcow2')
  const [compression, setCompression] = useState(true)
  const [scheduleName, setScheduleName] = useState('')
  const activeCron = preset === 'custom' ? customCron : presetCrons[preset]

  const fetchVMs = useCallback(async () => {
    try {
      setVMs(await listVMs())
    } catch (err) {
      setVMs([])
      throw err
    }
  }, [])

  const fetchSchedules = useCallback(async () => {
    try {
      const resp = await apiFetch('/api/schedules')
      if (!resp.ok) {
        const body = await resp.text()
        throw new Error(formatHttpErrorBody(resp.status, resp.statusText, body))
      }
      const data = await resp.json()
      setSchedules(Array.isArray(data) ? data : data.schedules || [])
    } catch (err) {
      setSchedules([])
      throw err
    }
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      await Promise.all([fetchVMs(), fetchSchedules()])
    } catch (err) {
      const msg = formatUserError(err)
      setLoadError(msg)
      toastFailure(toast, 'Failed to load backup scheduler data', err)
    } finally {
      setLoading(false)
    }
  }, [fetchVMs, fetchSchedules, toast])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const toggleVM = (name: string) => { setSelectedVMs((prev) => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next }) }
  const toggleAll = () => { if (selectedVMs.size === vms.length) setSelectedVMs(new Set()); else setSelectedVMs(new Set(vms.map((v) => v.name))) }

  const handleCreate = async () => {
    if (selectedVMs.size === 0) { setActionError('Select at least one VM'); return }
    if (!scheduleName.trim()) { setActionError('Enter a schedule name'); return }
    setCreating(true); setActionError(null); setSuccessMsg(null)
    try {
      const resp = await apiFetch('/api/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: scheduleName, cron: activeCron, vms: Array.from(selectedVMs), output_dir: outputDir, retention, format, compression }) })
      if (!resp.ok) {
        const body = await resp.text()
        throw new Error(formatHttpErrorBody(resp.status, resp.statusText, body))
      }
      setSuccessMsg('Schedule created successfully')
      toast.success('Backup schedule created')
      setScheduleName('')
      setSelectedVMs(new Set())
      fetchSchedules()
    } catch (err) {
      const msg = formatUserError(err)
      setActionError(msg)
      toastFailure(toast, 'Failed to create schedule', err)
    } finally { setCreating(false) }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backup Scheduler"
        description="Create and manage automated VM backup schedules"
        onRefresh={loadAll}
        refreshing={loading}
      />
      {loadError && (
        <ErrorBanner
          title="Could not load scheduler data"
          headline={loadError}
          hints={hintsForError(loadError, 'storage')}
          onRetry={loadAll}
        />
      )}
      {actionError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-600">{actionError}</div>
      )}
      {successMsg && <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-sm text-emerald-600">{successMsg}</div>}

      {loading && !loadError && (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && !loadError && (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#1d1d1f] mb-3">Select VMs</h3>
          {vms.length === 0 ? <p className="text-sm text-[#6e6e73]">No VMs available.</p> : (
            <><button onClick={toggleAll} className="text-xs text-[#0066cc] hover:text-blue-300 mb-3">{selectedVMs.size === vms.length ? 'Deselect All' : 'Select All'}</button>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {vms.map((vm) => (
                <label key={vm.name} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-black/[0.04] cursor-pointer transition-colors">
                  <input type="checkbox" checked={selectedVMs.has(vm.name)} onChange={() => toggleVM(vm.name)} className="w-4 h-4 rounded border-[#d2d2d7] text-teal-500 focus:ring-teal-500 bg-[#e8e8ed]" />
                  <span className="text-sm text-[#1d1d1f]">{vm.name}</span>
                  {vm.state && <span className={`text-xs px-1.5 py-0.5 rounded ${vm.state === 'running' ? 'bg-green-500/20 text-emerald-600' : 'bg-[#e8e8ed]/30 text-[#6e6e73]'}`}>{vm.state}</span>}
                </label>
              ))}
            </div></>
          )}
        </div>

        <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[#1d1d1f] mb-1">Schedule Configuration</h3>
          <div><label className="block text-xs text-[#6e6e73] mb-1">Schedule Name</label><input type="text" value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} placeholder="e.g. nightly-backup" className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] placeholder-[#6e6e73] focus:outline-none focus:border-teal-500" /></div>
          <div><label className="block text-xs text-[#6e6e73] mb-1">Frequency</label>
            <div className="grid grid-cols-2 gap-2">
              {([['daily2am', 'Daily 2 AM'], ['weeklySunday', 'Weekly Sun 3 AM'], ['every6h', 'Every 6h'], ['custom', 'Custom']] as [Preset, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setPreset(id)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${preset === id ? 'bg-[#0066cc]/10 text-[#0066cc] border border-[#0066cc]/30' : 'bg-[#f5f5f7] text-[#6e6e73] border border-[#d2d2d7] hover:bg-black/[0.04]'}`}>{label}</button>
              ))}
            </div>
          </div>
          {preset === 'custom' && <div><label className="block text-xs text-[#6e6e73] mb-1">Cron Expression</label><input type="text" value={customCron} onChange={(e) => setCustomCron(e.target.value)} placeholder="0 2 * * *" className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] font-mono placeholder-[#6e6e73] focus:outline-none focus:border-teal-500" /></div>}
          <div className="bg-[#f5f5f7] rounded-lg px-3 py-2 text-xs text-[#6e6e73]"><span className="text-[#6e6e73]">Schedule:</span> <span className="text-teal-400">{parseCronToHuman(activeCron)}</span></div>
          <div><label className="block text-xs text-[#6e6e73] mb-1">Output Directory</label><input type="text" value={outputDir} onChange={(e) => setOutputDir(e.target.value)} className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] font-mono focus:outline-none focus:border-teal-500" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-[#6e6e73] mb-1">Retention (keep last N)</label><input type="number" value={retention} onChange={(e) => setRetention(Math.max(1, parseInt(e.target.value, 10) || 1))} min={1} max={365} className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:outline-none focus:border-teal-500" /></div>
            <div><label className="block text-xs text-[#6e6e73] mb-1">Format</label><select value={format} onChange={(e) => setFormat(e.target.value)} className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:outline-none focus:border-teal-500"><option value="qcow2">QCOW2</option><option value="raw">RAW</option><option value="vmdk">VMDK</option></select></div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={compression} onChange={() => setCompression(!compression)} className="sr-only" /><div className={`relative w-10 h-5 rounded-full transition-colors ${compression ? 'bg-teal-600' : 'bg-[#e8e8ed]'}`}><div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${compression ? 'translate-x-5' : 'translate-x-0.5'}`} /></div><span className="text-sm text-[#1d1d1f]">Enable compression</span></label>
          <button onClick={handleCreate} disabled={creating} className="w-full py-2.5 rounded-xl text-sm font-semibold bg-teal-600 hover:bg-teal-500 text-[#1d1d1f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{creating ? 'Creating...' : 'Create Schedule'}</button>
        </div>
      </div>

      <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#1d1d1f] mb-4">Existing Schedules</h3>
        {schedules.length === 0 ? <p className="text-sm text-[#6e6e73]">No backup schedules configured yet.</p> : (
          <div className="space-y-3">
            {schedules.map((sched) => (
              <div key={sched.id} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-[#f5f5f7] rounded-xl px-4 py-3 border border-[#d2d2d7]/60">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="text-sm font-medium text-[#1d1d1f]">{sched.name}</span><span className={`text-xs px-1.5 py-0.5 rounded ${sched.enabled ? 'bg-green-500/20 text-emerald-600' : 'bg-[#e8e8ed]/30 text-[#6e6e73]'}`}>{sched.enabled ? 'Enabled' : 'Disabled'}</span></div>
                  <div className="text-xs text-[#6e6e73] mt-0.5"><span className="font-mono">{sched.cron}</span><span className="mx-1.5">-</span><span>{parseCronToHuman(sched.cron)}</span></div>
                </div>
                <div className="text-xs text-[#6e6e73] sm:text-right"><div>VMs: {sched.vms?.length || 0}</div>{sched.next_run && <div>Next: {sched.next_run}</div>}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  )
}
