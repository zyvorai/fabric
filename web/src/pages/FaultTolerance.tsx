// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Play, AlertTriangle, CheckCircle } from 'lucide-react'
import {
  listFtVms,
  enableFt,
  disableFt,
  checkFtCompatibility,
  triggerFailover,
  testFailover,
  getFtMetrics,
  getFtEvents,
  type FtConfig,
  type FtCompatibility,
  type FtMetrics,
  type FailoverResult,
} from '../api/faultTolerance'
import { useToastContext } from '../contexts/ToastContext'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import { PageHeader } from '../components/ui'
import PageLoadBanner from '../components/PageLoadBanner'
import { usePageLoader } from '../hooks/usePageLoader'

export default function FaultTolerance() {
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const [ftVMs, setFtVMs] = useState<FtConfig[]>([])
  const [events, setEvents] = useState<FailoverResult[]>([])
  const [metrics, setMetrics] = useState<Map<string, FtMetrics>>(new Map())
  const { loading, loadError, run } = usePageLoader('Failed to load fault tolerance data')
  const [activeTab, setActiveTab] = useState<'vms' | 'compatibility' | 'events' | 'metrics'>('vms')
  const [showEnableFT, setShowEnableFT] = useState(false)
  const [compatResult, setCompatResult] = useState<FtCompatibility | null>(null)
  const [compatVmId, setCompatVmId] = useState('')

  const loadData = useCallback(() => {
    return run(async () => {
      const [vms, evts] = await Promise.all([listFtVms(), getFtEvents()])
      setFtVMs(vms)
      setEvents(evts)

      const metricsMap = new Map<string, FtMetrics>()
      for (const vm of vms) {
        try {
          const m = await getFtMetrics(vm.vm_name)
          metricsMap.set(vm.vm_name, m)
        } catch { /* skip */ }
      }
      setMetrics(metricsMap)
    })
  }, [run])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleDisableFT = async (vmId: string) => {
    const ok = await confirm('Disable Fault Tolerance', 'Disable fault tolerance for this VM?', { variant: 'danger', confirmLabel: 'Disable' })
    if (!ok) return
    try {
      await disableFt(vmId)
      toast.success('FT disabled')
      loadData()
    } catch { toast.error('Failed to disable FT') }
  }

  const handleTriggerFailover = async (vmId: string) => {
    const ok = await confirm('Trigger Failover', 'Trigger failover for this VM? This will move the VM to the secondary host.', { variant: 'danger', confirmLabel: 'Trigger Failover' })
    if (!ok) return
    try {
      await triggerFailover(vmId)
      toast.success('Failover triggered')
      loadData()
    } catch { toast.error('Failed to trigger failover') }
  }

  const handleTestFailover = async (vmId: string) => {
    try {
      await testFailover(vmId)
      toast.success('Test failover initiated')
      loadData()
    } catch { toast.error('Failed to test failover') }
  }

  const handleCheckCompatibility = async () => {
    if (!compatVmId) return
    try {
      const result = await checkFtCompatibility(compatVmId)
      setCompatResult(result)
    } catch { toast.error('Compatibility check failed') }
  }

  const getStatusColor = (status: string) => {
    const m: Record<string, string> = {
      running: 'bg-green-100 text-green-800',
      needs_secondary: 'bg-yellow-100 text-yellow-800',
      not_started: 'bg-slate-500/20 text-slate-400',
      error: 'bg-red-100 text-red-800',
      success: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    }
    return m[status] || 'bg-slate-500/20 text-slate-400'
  }


  return (
    <div className="p-6">
      <PageHeader
        onRefresh={() => void loadData()}
        refreshing={loading}
        title="Fault Tolerance"
        actions={
          <button onClick={() => setShowEnableFT(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Enable FT
          </button>
        }
      />

      <PageLoadBanner title="Could not load fault tolerance data" headline={loadError} onRetry={() => void loadData()} />

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Protected VMs</div>
          <div className="text-2xl font-bold">{ftVMs.length}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Running</div>
          <div className="text-2xl font-bold text-green-400">{ftVMs.filter(v => v.status === 'running').length}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Needs Attention</div>
          <div className="text-2xl font-bold text-yellow-400">{ftVMs.filter(v => v.status !== 'running').length}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Failover Events</div>
          <div className="text-2xl font-bold">{events.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-800/50 rounded-lg p-1">
        {(['vms', 'compatibility', 'events', 'metrics'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium capitalize ${activeTab === tab ? 'bg-blue-600' : 'hover:bg-white/[0.03]'}`}>
            {tab === 'vms' ? 'Protected VMs' : tab === 'compatibility' ? 'Compatibility Check' : tab}
          </button>
        ))}
      </div>

      {/* Protected VMs Tab */}
      {activeTab === 'vms' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
          <table className="min-w-full divide-y divide-slate-700/50">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase">
                <th className="p-4">VM</th>
                <th className="p-4">Secondary Host</th>
                <th className="p-4">Status</th>
                <th className="p-4">Bandwidth</th>
                <th className="p-4">Checkpoint</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {ftVMs.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400">No FT-protected VMs.</td></tr>
              ) : ftVMs.map(vm => (
                <tr key={vm.vm_name} className="hover:bg-slate-900">
                  <td className="p-4 font-medium">{vm.vm_name}</td>
                  <td className="p-4 text-sm text-slate-400">{vm.secondary_host_id || 'Not assigned'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(vm.status)}`}>{vm.status}</span>
                  </td>
                  <td className="p-4 text-sm">{vm.bandwidth_limit_mbps ?? '—'} Mbps</td>
                  <td className="p-4 text-sm">—</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleTestFailover(vm.vm_name)} className="text-blue-400 hover:text-blue-300 text-sm px-2 py-1" title="Test failover">
                        Test
                      </button>
                      <button onClick={() => handleTriggerFailover(vm.vm_name)} className="text-yellow-400 hover:text-yellow-300 text-sm px-2 py-1" title="Trigger failover">
                        <Play className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDisableFT(vm.vm_name)} className="text-red-600 hover:text-red-800 p-1" title="Disable FT">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Compatibility Check Tab */}
      {activeTab === 'compatibility' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">FT Compatibility Checker</h2>
          <div className="flex gap-4 mb-4">
            <input type="text" value={compatVmId} onChange={e => setCompatVmId(e.target.value)}
              placeholder="Enter VM ID" className="flex-1 bg-slate-800 border border-slate-700/50 rounded px-3 py-2" />
            <button onClick={handleCheckCompatibility} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">
              Check
            </button>
          </div>
          {compatResult && (
            <div className={`p-4 rounded border ${compatResult.compatible ? 'border-green-500 bg-green-500/10' : 'border-red-500 bg-red-500/10'}`}>
              <div className="flex items-center gap-2 mb-3">
                {compatResult.compatible ? <CheckCircle className="w-5 h-5 text-green-500" /> : <AlertTriangle className="w-5 h-5 text-red-500" />}
                <span className="font-semibold">{compatResult.vm_name}: {compatResult.compatible ? 'Compatible' : 'Not Compatible'}</span>
              </div>
              {compatResult.issues.length > 0 && (
                <div className="space-y-2 mb-3">
                  <div className="text-sm font-medium">Issues:</div>
                  {compatResult.issues.map((issue, i) => (
                    <div key={i} className={`text-sm p-2 rounded ${issue.severity === 'error' ? 'bg-red-500/10 text-red-300' : 'bg-yellow-500/10 text-yellow-300'}`}>
                      {issue.message}
                      {issue.resolution && <div className="text-xs text-slate-400 mt-1">Fix: {issue.resolution}</div>}
                    </div>
                  ))}
                </div>
              )}
              {compatResult.recommended_secondary_hosts.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Recommended Secondary Hosts:</div>
                  {compatResult.recommended_secondary_hosts.map((h, i) => (
                    <div key={i} className="text-sm text-slate-300">{h.hostname} (score: {h.score.toFixed(1)})</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Events Tab */}
      {activeTab === 'events' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
          <div className="p-4 border-b border-slate-700/50">
            <h2 className="text-lg font-semibold">FT Events Timeline</h2>
          </div>
          {events.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No FT events recorded.</div>
          ) : (
            <div className="divide-y divide-slate-700/50">
              {events.map(evt => (
                <div key={`${evt.vm_name}-${evt.started_at}`} className="p-4 flex items-start gap-4">
                  <div className={`w-3.5 h-3.5 rounded-full mt-1 ${evt.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{evt.vm_name}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(evt.status)}`}>{evt.status}</span>
                      <span className="text-xs px-2 py-0.5 bg-slate-800 rounded">{evt.failover_type}</span>
                    </div>
                    <div className="text-sm text-slate-400">
                      {evt.source_host_id} &rarr; {evt.target_host_id}
                      {evt.downtime_ms > 0 && <span className="ml-2">| Downtime: {evt.downtime_ms}ms</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{new Date(evt.started_at).toLocaleString()}</div>
                    {evt.error && <div className="text-sm text-red-400 mt-1">{evt.error}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Metrics Tab */}
      {activeTab === 'metrics' && (
        <div className="space-y-4">
          {ftVMs.length === 0 ? (
            <div className="text-center py-12 text-slate-400 bg-slate-800/50 rounded-lg">No FT-protected VMs to show metrics for.</div>
          ) : ftVMs.map(vm => {
            const m = metrics.get(vm.vm_name)
            if (!m) return null
            return (
              <div key={vm.vm_name} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                <h3 className="font-semibold mb-3">{vm.vm_name}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-slate-400">Log Bandwidth</div>
                    <div className="text-lg font-bold">{m.log_bandwidth_usage_mbps.toFixed(1)} Mbps</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Checkpoint Latency</div>
                    <div className="text-lg font-bold">{m.checkpoint_latency_ms.toFixed(0)} ms</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Secondary CPU</div>
                    <div className="text-lg font-bold">{m.secondary_cpu_usage_pct.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Secondary Memory</div>
                    <div className="text-lg font-bold">{m.secondary_memory_usage_pct.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Failover Count</div>
                    <div className="text-lg font-bold">{m.failover_count}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Uptime</div>
                    <div className="text-lg font-bold">{m.uptime_pct.toFixed(2)}%</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Enable FT Modal */}
      {showEnableFT && (
        <EnableFTModal onClose={() => setShowEnableFT(false)} onCreated={() => { setShowEnableFT(false); loadData() }} />
      )}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          variant={confirmState.variant}
          onConfirm={confirmState.onConfirm}
          onCancel={cancel}
        />
      )}
    </div>
  )
}

function EnableFTModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToastContext()
  const [vmName, setVmName] = useState('')
  const [primaryHostId, setPrimaryHostId] = useState('local')
  const [secondaryHostId, setSecondaryHostId] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await enableFt({
        vm_name: vmName,
        primary_host_id: primaryHostId,
        secondary_host_id: secondaryHostId || 'auto',
      })
      onCreated()
    } catch { toast.error('Failed to enable FT') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Enable Fault Tolerance</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">VM name</label>
            <input type="text" value={vmName} onChange={e => setVmName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Primary host ID</label>
            <input type="text" value={primaryHostId} onChange={e => setPrimaryHostId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Secondary host ID</label>
            <input type="text" value={secondaryHostId} onChange={e => setSecondaryHostId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2"
              placeholder="Auto-select if empty" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Enable</button>
          </div>
        </form>
      </div>
    </div>
  )
}
