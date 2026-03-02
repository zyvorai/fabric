import { useState, useEffect } from 'react'
import { Plus, Trash2, RefreshCw, Play, AlertTriangle, CheckCircle } from 'lucide-react'
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

export default function FaultTolerance() {
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const [ftVMs, setFtVMs] = useState<FtConfig[]>([])
  const [events, setEvents] = useState<FailoverResult[]>([])
  const [metrics, setMetrics] = useState<Map<string, FtMetrics>>(new Map())
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'vms' | 'compatibility' | 'events' | 'metrics'>('vms')
  const [showEnableFT, setShowEnableFT] = useState(false)
  const [compatResult, setCompatResult] = useState<FtCompatibility | null>(null)
  const [compatVmId, setCompatVmId] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [vms, evts] = await Promise.all([
        listFtVms(),
        getFtEvents(),
      ])
      setFtVMs(vms)
      setEvents(evts)

      const metricsMap = new Map<string, FtMetrics>()
      for (const vm of vms) {
        try {
          const m = await getFtMetrics(vm.vm_id)
          metricsMap.set(vm.vm_id, m)
        } catch { /* skip */ }
      }
      setMetrics(metricsMap)
    } catch (error) {
      console.error('Failed to load FT data:', error)
    } finally {
      setLoading(false)
    }
  }

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
      not_started: 'bg-gray-100 text-gray-800',
      error: 'bg-red-100 text-red-800',
      success: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    }
    return m[status] || 'bg-gray-100 text-gray-800'
  }

  if (loading) return <div className="text-center py-8">Loading...</div>

  return (
    <div className="p-6">
      <PageHeader
        title="Fault Tolerance"
        actions={
          <>
            <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button onClick={() => setShowEnableFT(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Enable FT
            </button>
          </>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-400 text-sm mb-1">Protected VMs</div>
          <div className="text-3xl font-bold">{ftVMs.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-400 text-sm mb-1">Running</div>
          <div className="text-3xl font-bold text-green-400">{ftVMs.filter(v => v.status === 'running').length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-400 text-sm mb-1">Needs Attention</div>
          <div className="text-3xl font-bold text-yellow-400">{ftVMs.filter(v => v.status !== 'running' && v.enabled).length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-400 text-sm mb-1">Failover Events</div>
          <div className="text-3xl font-bold">{events.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-800 rounded-lg p-1">
        {(['vms', 'compatibility', 'events', 'metrics'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium capitalize ${activeTab === tab ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>
            {tab === 'vms' ? 'Protected VMs' : tab === 'compatibility' ? 'Compatibility Check' : tab}
          </button>
        ))}
      </div>

      {/* Protected VMs Tab */}
      {activeTab === 'vms' && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-700">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase">
                <th className="p-4">VM</th>
                <th className="p-4">Secondary Host</th>
                <th className="p-4">Status</th>
                <th className="p-4">Bandwidth</th>
                <th className="p-4">Checkpoint</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {ftVMs.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-gray-400">No FT-protected VMs.</td></tr>
              ) : ftVMs.map(vm => (
                <tr key={vm.vm_id} className="hover:bg-gray-750">
                  <td className="p-4 font-medium">{vm.vm_name}</td>
                  <td className="p-4 text-sm text-gray-400">{vm.secondary_hostname || 'Not assigned'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(vm.status)}`}>{vm.status}</span>
                  </td>
                  <td className="p-4 text-sm">{vm.logging_bandwidth_mbps} Mbps</td>
                  <td className="p-4 text-sm">{vm.checkpoint_interval_seconds}s</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleTestFailover(vm.vm_id)} className="text-blue-400 hover:text-blue-300 text-sm px-2 py-1" title="Test failover">
                        Test
                      </button>
                      <button onClick={() => handleTriggerFailover(vm.vm_id)} className="text-yellow-400 hover:text-yellow-300 text-sm px-2 py-1" title="Trigger failover">
                        <Play className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDisableFT(vm.vm_id)} className="text-red-600 hover:text-red-800 p-1" title="Disable FT">
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
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">FT Compatibility Checker</h2>
          <div className="flex gap-4 mb-4">
            <input type="text" value={compatVmId} onChange={e => setCompatVmId(e.target.value)}
              placeholder="Enter VM ID" className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2" />
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
                      {issue.resolution && <div className="text-xs text-gray-400 mt-1">Fix: {issue.resolution}</div>}
                    </div>
                  ))}
                </div>
              )}
              {compatResult.recommended_secondary_hosts.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Recommended Secondary Hosts:</div>
                  {compatResult.recommended_secondary_hosts.map((h, i) => (
                    <div key={i} className="text-sm text-gray-300">{h.hostname} (score: {h.score.toFixed(1)})</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Events Tab */}
      {activeTab === 'events' && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold">FT Events Timeline</h2>
          </div>
          {events.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No FT events recorded.</div>
          ) : (
            <div className="divide-y divide-gray-700">
              {events.map(evt => (
                <div key={`${evt.vm_id}-${evt.started_at}`} className="p-4 flex items-start gap-4">
                  <div className={`w-3 h-3 rounded-full mt-1 ${evt.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{evt.vm_name}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(evt.status)}`}>{evt.status}</span>
                      <span className="text-xs px-2 py-0.5 bg-gray-700 rounded">{evt.failover_type}</span>
                    </div>
                    <div className="text-sm text-gray-400">
                      {evt.source_hostname} &rarr; {evt.target_hostname}
                      {evt.downtime_ms > 0 && <span className="ml-2">| Downtime: {evt.downtime_ms}ms</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{new Date(evt.started_at).toLocaleString()}</div>
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
            <div className="text-center py-12 text-gray-400 bg-gray-800 rounded-lg">No FT-protected VMs to show metrics for.</div>
          ) : ftVMs.map(vm => {
            const m = metrics.get(vm.vm_id)
            if (!m) return null
            return (
              <div key={vm.vm_id} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <h3 className="font-semibold mb-3">{vm.vm_name}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-gray-400">Log Bandwidth</div>
                    <div className="text-lg font-bold">{m.log_bandwidth_usage_mbps.toFixed(1)} Mbps</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Checkpoint Latency</div>
                    <div className="text-lg font-bold">{m.checkpoint_latency_ms.toFixed(0)} ms</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Secondary CPU</div>
                    <div className="text-lg font-bold">{m.secondary_cpu_usage_pct.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Secondary Memory</div>
                    <div className="text-lg font-bold">{m.secondary_memory_usage_pct.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Failover Count</div>
                    <div className="text-lg font-bold">{m.failover_count}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Uptime</div>
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
  const [vmId, setVmId] = useState('')
  const [secondaryHostId, setSecondaryHostId] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await enableFt({ vm_id: vmId, secondary_host_id: secondaryHostId || undefined })
      onCreated()
    } catch { alert('Failed to enable FT') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Enable Fault Tolerance</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">VM ID</label>
            <input type="text" value={vmId} onChange={e => setVmId(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Secondary Host ID (optional)</label>
            <input type="text" value={secondaryHostId} onChange={e => setSecondaryHostId(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
              placeholder="Auto-select if empty" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Enable</button>
          </div>
        </form>
      </div>
    </div>
  )
}
