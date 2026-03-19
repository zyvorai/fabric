import { useState, useEffect } from 'react'
import { Plus, Check, X, Trash2, RefreshCw } from 'lucide-react'
import {
  getDrsConfig,
  configureDrs,
  analyzeBalance,
  listRecommendations,
  approveRecommendation,
  rejectRecommendation,
  listAffinityRules,
  createAffinityRule,
  deleteAffinityRule,
  computePlacement,
  type DrsConfig,
  type ClusterBalance,
  type MigrationRecommendation,
  type AffinityRule,
  type PlacementResult,
} from '../api/drs'
import { useToastContext } from '../contexts/ToastContext'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'

export default function DRS() {
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const [clusterId] = useState('default')
  const [config, setConfig] = useState<DrsConfig | null>(null)
  const [balance, setBalance] = useState<ClusterBalance | null>(null)
  const [recommendations, setRecommendations] = useState<MigrationRecommendation[]>([])
  const [rules, setRules] = useState<AffinityRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateRule, setShowCreateRule] = useState(false)
  const [placementResult, setPlacementResult] = useState<PlacementResult | null>(null)
  const [activeTab, setActiveTab] = useState<'balance' | 'recommendations' | 'rules' | 'placement'>('balance')

  useEffect(() => {
    loadData()
  }, [clusterId])

  const loadData = async () => {
    try {
      const [cfg, bal, recs, rls] = await Promise.all([
        getDrsConfig(clusterId).catch(() => null),
        analyzeBalance(clusterId).catch(() => null),
        listRecommendations(clusterId).catch(() => []),
        listAffinityRules(clusterId).catch(() => []),
      ])
      setConfig(cfg)
      setBalance(bal)
      setRecommendations(recs)
      setRules(rls)
    } catch (error) {
      console.error('Failed to load DRS data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleConfigUpdate = async (updates: Partial<DrsConfig>) => {
    try {
      const updated = await configureDrs({ cluster_id: clusterId, ...updates })
      setConfig(updated)
      toast.success('DRS configuration updated')
    } catch { toast.error('Failed to update DRS config') }
  }

  const handleApprove = async (id: string) => {
    try {
      await approveRecommendation(id)
      toast.success('Migration approved')
      loadData()
    } catch { toast.error('Failed to approve migration') }
  }

  const handleReject = async (id: string) => {
    try {
      await rejectRecommendation(id)
      toast.success('Migration rejected')
      loadData()
    } catch { toast.error('Failed to reject migration') }
  }

  const handleDeleteRule = async (id: string) => {
    const ok = await confirm('Delete Affinity Rule', 'Delete this affinity rule?', { variant: 'danger', confirmLabel: 'Delete' })
    if (!ok) return
    try {
      await deleteAffinityRule(id)
      toast.success('Affinity rule deleted')
      loadData()
    } catch { toast.error('Failed to delete rule') }
  }

  const handlePlacementTest = async (vmCpus: number, vmMemoryMb: number) => {
    try {
      const result = await computePlacement({ cluster_id: clusterId, vm_cpus: vmCpus, vm_memory_mb: vmMemoryMb })
      setPlacementResult(result)
    } catch { toast.error('Placement test failed') }
  }

  const getPriorityColor = (p: string) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-blue-100 text-blue-800',
    }
    return colors[p] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Distributed Resource Scheduler</h1>
        <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-600 rounded">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* DRS Configuration */}
      {config && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold mb-4">DRS Configuration</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Enabled</label>
              <button
                onClick={() => handleConfigUpdate({ enabled: !config.enabled })}
                className={`px-3 py-1 rounded text-sm ${config.enabled ? 'bg-green-600' : 'bg-gray-600'}`}
              >{config.enabled ? 'On' : 'Off'}</button>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Automation Level</label>
              <select value={config.automation_level}
                onChange={e => handleConfigUpdate({ automation_level: e.target.value as DrsConfig['automation_level'] })}
                className="bg-gray-800 border border-gray-800 rounded px-3 py-1 text-sm">
                <option value="manual">Manual</option>
                <option value="partially_automated">Semi-Auto</option>
                <option value="fully_automated">Fully Auto</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Migration Threshold</label>
              <input type="range" min={1} max={5} value={config.migration_threshold}
                onChange={e => handleConfigUpdate({ migration_threshold: Number(e.target.value) })}
                className="w-full" />
              <span className="text-xs text-gray-400">{config.migration_threshold}/5</span>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Check Interval</label>
              <span className="text-sm">{config.check_interval_seconds}s</span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-900 rounded-lg p-1">
        {(['balance', 'recommendations', 'rules', 'placement'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium capitalize ${activeTab === tab ? 'bg-blue-600' : 'hover:bg-white/[0.03]'}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Balance Tab */}
      {activeTab === 'balance' && balance && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Cluster Balance</h2>
            <div className="text-sm text-gray-400">
              Score: <span className="font-bold text-white">{balance.overall_score.toFixed(1)}</span> |
              CPU Imbalance: {balance.cpu_imbalance_pct.toFixed(1)}% |
              Memory Imbalance: {balance.memory_imbalance_pct.toFixed(1)}%
            </div>
          </div>
          <div className="space-y-3">
            {balance.hosts.map(host => (
              <div key={host.host_id} className="p-3 bg-gray-900 rounded">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{host.hostname}</span>
                  <span className="text-sm text-gray-400">{host.vm_count} VMs</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>CPU</span>
                      <span>{host.cpu_usage_pct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-4">
                      <div className={`h-4 rounded-full text-xs text-center leading-4 ${host.cpu_usage_pct > 80 ? 'bg-red-500' : host.cpu_usage_pct > 60 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min(host.cpu_usage_pct, 100)}%` }}>
                        {host.cpu_usage_pct > 20 ? `${host.cpu_usage_pct.toFixed(0)}%` : ''}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Memory</span>
                      <span>{host.memory_usage_pct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-4">
                      <div className={`h-4 rounded-full text-xs text-center leading-4 ${host.memory_usage_pct > 80 ? 'bg-red-500' : host.memory_usage_pct > 60 ? 'bg-yellow-500' : 'bg-purple-500'}`}
                        style={{ width: `${Math.min(host.memory_usage_pct, 100)}%` }}>
                        {host.memory_usage_pct > 20 ? `${host.memory_usage_pct.toFixed(0)}%` : ''}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations Tab */}
      {activeTab === 'recommendations' && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg">
          <table className="min-w-full divide-y divide-gray-800">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase">
                <th className="p-4">VM</th>
                <th className="p-4">From</th>
                <th className="p-4">To</th>
                <th className="p-4">Reason</th>
                <th className="p-4">Priority</th>
                <th className="p-4">Benefit</th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {recommendations.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-400">No migration recommendations.</td></tr>
              ) : recommendations.map(rec => (
                <tr key={rec.id} className="hover:bg-gray-900">
                  <td className="p-4 font-medium">{rec.vm_name}</td>
                  <td className="p-4 text-sm text-gray-400">{rec.source_hostname}</td>
                  <td className="p-4 text-sm text-gray-400">{rec.target_hostname}</td>
                  <td className="p-4 text-sm">{rec.reason}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(rec.priority)}`}>
                      {rec.priority}
                    </span>
                  </td>
                  <td className="p-4 text-sm">{rec.estimated_benefit_pct.toFixed(1)}%</td>
                  <td className="p-4 text-sm">{rec.status}</td>
                  <td className="p-4">
                    {rec.status === 'pending' && (
                      <div className="flex gap-2">
                        <button onClick={() => handleApprove(rec.id)} className="p-1 text-green-500 hover:text-green-400">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleReject(rec.id)} className="p-1 text-red-500 hover:text-red-400">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateRule(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Rule
            </button>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg">
            <table className="min-w-full divide-y divide-gray-800">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase">
                  <th className="p-4">Name</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">VMs</th>
                  <th className="p-4">Mandatory</th>
                  <th className="p-4">Enabled</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {rules.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-400">No affinity rules configured.</td></tr>
                ) : rules.map(rule => (
                  <tr key={rule.id} className="hover:bg-gray-900">
                    <td className="p-4 font-medium">{rule.name}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${rule.rule_type === 'affinity' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {rule.rule_type}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-400">{rule.vm_ids.length} VMs</td>
                    <td className="p-4 text-sm">{rule.mandatory ? 'Yes' : 'No'}</td>
                    <td className="p-4 text-sm">{rule.enabled ? 'Yes' : 'No'}</td>
                    <td className="p-4">
                      <button onClick={() => handleDeleteRule(rule.id)} className="text-red-600 hover:text-red-800">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Placement Tab */}
      {activeTab === 'placement' && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Placement Calculator</h2>
          <PlacementForm clusterId={clusterId} result={placementResult} onTest={handlePlacementTest} />
        </div>
      )}

      {/* Create Rule Modal */}
      {showCreateRule && (
        <CreateRuleModal
          clusterId={clusterId}
          onClose={() => setShowCreateRule(false)}
          onCreated={() => { setShowCreateRule(false); loadData() }}
        />
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

function PlacementForm({ result, onTest }: { clusterId: string; result: PlacementResult | null; onTest: (cpu: number, mem: number) => void }) {
  const [cpus, setCpus] = useState(2)
  const [memory, setMemory] = useState(4096)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">VM CPUs (MHz)</label>
          <input type="number" value={cpus} onChange={e => setCpus(Number(e.target.value))}
            className="w-full bg-gray-800 border border-gray-800 rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">VM Memory (MB)</label>
          <input type="number" value={memory} onChange={e => setMemory(Number(e.target.value))}
            className="w-full bg-gray-800 border border-gray-800 rounded px-3 py-2" />
        </div>
      </div>
      <button onClick={() => onTest(cpus, memory)}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Test Placement</button>
      {result && (
        <div className="p-4 bg-gray-900 rounded border border-gray-800">
          <div className="font-medium mb-2">Recommended: {result.hostname}</div>
          <div className="text-sm text-gray-400">Score: {result.score.toFixed(2)} | Reason: {result.reason}</div>
          <div className="text-sm text-gray-400">After placement: CPU {result.cpu_after_pct.toFixed(1)}% | Memory {result.memory_after_pct.toFixed(1)}%</div>
          {result.alternatives.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-gray-500">Alternatives:</div>
              {result.alternatives.map((alt, i) => (
                <div key={i} className="text-xs text-gray-400">{alt.hostname} (score: {alt.score.toFixed(2)})</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CreateRuleModal({ clusterId, onClose, onCreated }: { clusterId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [ruleType, setRuleType] = useState<'affinity' | 'anti_affinity'>('affinity')
  const [vmIds, setVmIds] = useState('')
  const [mandatory, setMandatory] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createAffinityRule({
        cluster_id: clusterId,
        name,
        rule_type: ruleType,
        mandatory,
        vm_ids: vmIds.split(',').map(s => s.trim()).filter(Boolean),
      })
      onCreated()
    } catch { alert('Failed to create rule') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create Affinity Rule</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-800 rounded px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select value={ruleType} onChange={e => setRuleType(e.target.value as 'affinity' | 'anti_affinity')}
              className="w-full bg-gray-800 border border-gray-800 rounded px-3 py-2">
              <option value="affinity">Affinity (keep together)</option>
              <option value="anti_affinity">Anti-Affinity (keep apart)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">VM IDs (comma-separated)</label>
            <input type="text" value={vmIds} onChange={e => setVmIds(e.target.value)}
              className="w-full bg-gray-800 border border-gray-800 rounded px-3 py-2" required />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={mandatory} onChange={e => setMandatory(e.target.checked)} />
            <span className="text-sm">Mandatory</span>
          </label>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-600 rounded">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}
