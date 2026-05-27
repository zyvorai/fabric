// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, RefreshCw, Play, AlertTriangle } from 'lucide-react'
import {
  listPlans,
  createPlan,
  deletePlan,
  executePlannedMigration,
  executeDisasterRecovery,
  executeTestFailover,
  listExecutions,
  getDrDashboard,
  type RecoveryPlan,
  type RecoveryExecution,
  type DrDashboard,
} from '../api/siteRecovery'
import { useToastContext } from '../contexts/ToastContext'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import PageLoadBanner from '../components/PageLoadBanner'
import { usePageLoader } from '../hooks/usePageLoader'

export default function SiteRecovery() {
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const [plans, setPlans] = useState<RecoveryPlan[]>([])
  const [executions, setExecutions] = useState<RecoveryExecution[]>([])
  const [dashboard, setDashboard] = useState<DrDashboard | null>(null)
  const { loading, loadError, run } = usePageLoader('Failed to load site recovery data')
  const [activeTab, setActiveTab] = useState<'dashboard' | 'plans' | 'executions'>('dashboard')
  const [showCreatePlan, setShowCreatePlan] = useState(false)
  const [showExecute, setShowExecute] = useState<string | null>(null)

  const loadData = useCallback(() => {
    return run(async () => {
      const [p, e, d] = await Promise.all([
        listPlans(),
        listExecutions(),
        getDrDashboard().catch(() => null),
      ])
      setPlans(p)
      setExecutions(e)
      setDashboard(d)
    })
  }, [run])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleDeletePlan = async (id: string) => {
    const ok = await confirm('Delete Recovery Plan', 'Delete this recovery plan?', { variant: 'danger', confirmLabel: 'Delete' })
    if (!ok) return
    try { await deletePlan(id); toast.success('Plan deleted'); loadData() }
    catch { toast.error('Failed to delete plan') }
  }

  const handleExecute = async (planId: string, type: 'planned_migration' | 'disaster_recovery' | 'test_failover') => {
    const title = type === 'disaster_recovery'
      ? 'Execute Disaster Recovery'
      : type === 'planned_migration'
      ? 'Execute Planned Migration'
      : 'Execute Test Failover'
    const msg = type === 'disaster_recovery'
      ? 'Execute DISASTER RECOVERY? This will failover all VMs to the target site.'
      : type === 'planned_migration'
      ? 'Execute planned migration?'
      : 'Execute test failover?'
    const ok = await confirm(title, msg, { variant: 'danger', confirmLabel: 'Execute' })
    if (!ok) return
    try {
      if (type === 'planned_migration') await executePlannedMigration(planId)
      else if (type === 'disaster_recovery') await executeDisasterRecovery(planId)
      else await executeTestFailover(planId)
      toast.success('Execution started')
      setShowExecute(null)
      loadData()
    } catch { toast.error('Failed to execute plan') }
  }

  const getStatusColor = (status: string) => {
    const m: Record<string, string> = {
      ready: 'bg-green-100 text-green-800', not_ready: 'bg-red-100 text-red-800',
      running: 'bg-blue-100 text-blue-800', completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800', cancelled: 'bg-slate-500/20 text-slate-400',
      rolling_back: 'bg-yellow-100 text-yellow-800', pending: 'bg-slate-500/20 text-slate-400',
      skipped: 'bg-slate-500/20 text-slate-400',
    }
    return m[status] || 'bg-slate-500/20 text-slate-400'
  }


  return (
    <div className="p-6">
      <PageLoadBanner title="Could not load site recovery data" headline={loadError} onRetry={() => void loadData()} />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Site Recovery</h1>
        <div className="flex gap-2">
          <button onClick={() => void loadData()} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => setShowCreatePlan(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create Plan
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-800/50 rounded-lg p-1">
        {(['dashboard', 'plans', 'executions'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium capitalize ${activeTab === tab ? 'bg-blue-600' : 'hover:bg-white/[0.03]'}`}>
            {tab === 'executions' ? 'Execution History' : tab === 'plans' ? 'Recovery Plans' : 'DR Dashboard'}
          </button>
        ))}
      </div>

      {/* DR Dashboard */}
      {activeTab === 'dashboard' && dashboard && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-slate-400 text-sm mb-1">Protected VMs</div>
              <div className="text-2xl font-bold text-green-400">{dashboard.total_protected_vms}</div>
              <div className="text-xs text-slate-400 mt-1">{dashboard.total_unprotected_vms} unprotected</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-slate-400 text-sm mb-1">Avg RTO</div>
              <div className="text-2xl font-bold">{(dashboard.avg_rto_seconds / 60).toFixed(0)} min</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-slate-400 text-sm mb-1">Avg RPO</div>
              <div className="text-2xl font-bold">{dashboard.avg_rpo_minutes.toFixed(0)} min</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-slate-400 text-sm mb-1">Plans Ready</div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-green-400">{dashboard.plans_tested}</span>
                <span className="text-slate-400">/</span>
                <span className="text-xl text-slate-400">{dashboard.total_plans}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">Sites</h3>
              <div className="space-y-2">
                {dashboard.sites.map(site => (
                  <div key={site.site_id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${site.status === 'connected' || site.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="font-medium">{site.site_name}</span>
                    </div>
                    <span className="text-sm text-slate-400">{site.protected_vms} VMs | {site.plans} plans</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">Recent Executions</h3>
              {dashboard.recent_executions.length === 0 ? (
                <div className="text-slate-400 text-sm">No recent executions.</div>
              ) : (
                <div className="space-y-2">
                  {dashboard.recent_executions.slice(0, 5).map(exec => (
                    <div key={exec.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
                      <div>
                        <span className="font-medium">{exec.plan_name}</span>
                        <span className="ml-2 text-xs px-2 py-0.5 bg-slate-800 rounded">{exec.execution_type.replace(/_/g, ' ')}</span>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(exec.status)}`}>{exec.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Plans Tab */}
      {activeTab === 'plans' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
          <table className="min-w-full divide-y divide-slate-700/50">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase">
                <th className="p-4">Plan</th>
                <th className="p-4">VM Groups</th>
                <th className="p-4">Status</th>
                <th className="p-4">Last Test</th>
                <th className="p-4">Last Executed</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {plans.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400">No recovery plans.</td></tr>
              ) : plans.map(plan => (
                <tr key={plan.id} className="hover:bg-slate-900">
                  <td className="p-4">
                    <div className="font-medium">{plan.name}</div>
                    {plan.description && <div className="text-xs text-slate-400">{plan.description}</div>}
                  </td>
                  <td className="p-4 text-sm">
                    {plan.vm_groups.length} groups ({plan.vm_groups.reduce((s, g) => s + g.vm_ids.length, 0)} VMs)
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(plan.status)}`}>
                      {plan.status}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-slate-400">{plan.last_tested ? new Date(plan.last_tested).toLocaleDateString() : 'Never'}</td>
                  <td className="p-4 text-sm text-slate-400">{plan.last_executed ? new Date(plan.last_executed).toLocaleDateString() : 'Never'}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setShowExecute(plan.id)} className="text-blue-400 hover:text-blue-300 p-1" title="Execute">
                        <Play className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeletePlan(plan.id)} className="text-red-600 hover:text-red-800 p-1">
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

      {/* Executions Tab */}
      {activeTab === 'executions' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
          {executions.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No execution history.</div>
          ) : (
            <div className="divide-y divide-slate-700/50">
              {executions.map(exec => (
                <div key={exec.id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{exec.plan_name}</span>
                      <span className="text-xs px-2 py-0.5 bg-slate-800 rounded">{exec.execution_type.replace(/_/g, ' ')}</span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(exec.status)}`}>{exec.status}</span>
                    </div>
                    <div className="text-sm text-slate-400">
                      {exec.vms_recovered}/{exec.vms_total} VMs
                      {exec.rto_actual_seconds && ` | RTO: ${(exec.rto_actual_seconds / 60).toFixed(1)} min`}
                    </div>
                  </div>
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Progress: {exec.current_step}</span>
                      <span>{exec.progress_pct}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2">
                      <div className="h-2 rounded-full bg-blue-500" style={{ width: `${exec.progress_pct}%` }} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {exec.steps.map((step, i) => (
                      <div key={i} className={`text-xs px-2 py-1 rounded ${getStatusColor(step.status)}`}>
                        {step.name}
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-slate-500 mt-2">
                    Started: {new Date(exec.started_at).toLocaleString()}
                    {exec.completed_at && ` | Completed: ${new Date(exec.completed_at).toLocaleString()}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Execute Modal */}
      {showExecute && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Execute Recovery Plan</h2>
            <div className="space-y-3">
              <button onClick={() => handleExecute(showExecute, 'test_failover')}
                className="w-full p-3 bg-blue-600 hover:bg-blue-700 rounded text-left">
                <div className="font-medium">Test Failover</div>
                <div className="text-xs text-blue-200">Non-destructive test using isolated network</div>
              </button>
              <button onClick={() => handleExecute(showExecute, 'planned_migration')}
                className="w-full p-3 bg-yellow-600 hover:bg-yellow-700 rounded text-left">
                <div className="font-medium">Planned Migration</div>
                <div className="text-xs text-yellow-200">Graceful migration with zero data loss</div>
              </button>
              <button onClick={() => handleExecute(showExecute, 'disaster_recovery')}
                className="w-full p-3 bg-red-600 hover:bg-red-700 rounded text-left">
                <div className="font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Disaster Recovery
                </div>
                <div className="text-xs text-red-200">Emergency failover - some data loss possible</div>
              </button>
              <button onClick={() => setShowExecute(null)} className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Plan Modal */}
      {showCreatePlan && (
        <CreatePlanModal onClose={() => setShowCreatePlan(false)} onCreated={() => { setShowCreatePlan(false); loadData() }} />
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

function CreatePlanModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToastContext()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sourceSite, setSourceSite] = useState('')
  const [targetSite, setTargetSite] = useState('')
  const [groupName, setGroupName] = useState('Default')
  const [vmIds, setVmIds] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createPlan({
        name, description: description || undefined,
        source_site_id: sourceSite, target_site_id: targetSite,
        vm_groups: [{ name: groupName, vm_ids: vmIds.split(',').map(s => s.trim()).filter(Boolean), boot_order: 1 }],
      })
      onCreated()
    } catch { toast.error('Failed to create plan') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create Recovery Plan</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Plan Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Source Site ID</label>
              <input type="text" value={sourceSite} onChange={e => setSourceSite(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Target Site ID</label>
              <input type="text" value={targetSite} onChange={e => setTargetSite(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">VM Group Name</label>
            <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">VM IDs (comma-separated)</label>
            <input type="text" value={vmIds} onChange={e => setVmIds(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}
