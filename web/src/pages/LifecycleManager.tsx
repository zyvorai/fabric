// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, RefreshCw, Play } from 'lucide-react'
import {
  listBaselines,
  createBaseline,
  deleteBaseline,
  getComplianceStatus,
  scanHostCompliance,
  listRemediations,
  listRollingUpdates,
  type Baseline,
  type HostComplianceStatus,
  type RemediationTask,
  type RollingUpdatePlan,
} from '../api/lifecycle'
import { useToastContext } from '../contexts/ToastContext'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import PageLoadBanner from '../components/PageLoadBanner'
import { usePageLoader } from '../hooks/usePageLoader'

export default function LifecycleManager() {
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const [baselines, setBaselines] = useState<Baseline[]>([])
  const [scans, setScans] = useState<HostComplianceStatus[]>([])
  const [tasks, setTasks] = useState<RemediationTask[]>([])
  const [updates, setUpdates] = useState<RollingUpdatePlan[]>([])
  const { loading, loadError, run } = usePageLoader('Failed to load lifecycle data')
  const [activeTab, setActiveTab] = useState<'baselines' | 'compliance' | 'remediation' | 'updates'>('baselines')
  const [showCreateBaseline, setShowCreateBaseline] = useState(false)

  const loadData = useCallback(() => {
    return run(async () => {
      const [b, s, t, u] = await Promise.all([
        listBaselines(),
        getComplianceStatus(),
        listRemediations(),
        listRollingUpdates(),
      ])
      setBaselines(b)
      setScans(s)
      setTasks(t)
      setUpdates(u)
    })
  }, [run])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleDeleteBaseline = async (id: string) => {
    const ok = await confirm('Delete Baseline', 'Delete this baseline?', { variant: 'danger', confirmLabel: 'Delete' })
    if (!ok) return
    try { await deleteBaseline(id); toast.success('Baseline deleted'); loadData() }
    catch { toast.error('Failed to delete baseline') }
  }

  const handleRunScan = async (baselineId: string) => {
    try { await scanHostCompliance(baselineId); toast.success('Compliance scan initiated'); loadData() }
    catch { toast.error('Failed to run scan') }
  }

  const getSeverityColor = (severity: string) => {
    const m: Record<string, string> = {
      critical: 'bg-red-100 text-red-800', important: 'bg-orange-100 text-orange-800',
      moderate: 'bg-yellow-100 text-yellow-800', low: 'bg-blue-100 text-blue-800',
    }
    return m[severity] || 'bg-slate-500/20 text-slate-400'
  }

  const getStatusColor = (status: string) => {
    const m: Record<string, string> = {
      compliant: 'bg-green-100 text-green-800', non_compliant: 'bg-red-100 text-red-800',
      incompatible: 'bg-yellow-100 text-yellow-800', unknown: 'bg-slate-500/20 text-slate-400',
      pending: 'bg-slate-500/20 text-slate-400', pre_check: 'bg-blue-100 text-blue-800',
      maintenance_mode: 'bg-yellow-100 text-yellow-800', remediating: 'bg-blue-100 text-blue-800',
      rebooting: 'bg-orange-100 text-orange-800', completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800', running: 'bg-blue-100 text-blue-800',
      paused: 'bg-yellow-100 text-yellow-800',
    }
    return m[status] || 'bg-slate-500/20 text-slate-400'
  }


  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Lifecycle Manager</h1>
        <button onClick={() => void loadData()} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <PageLoadBanner title="Could not load lifecycle data" headline={loadError} onRetry={() => void loadData()} />

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Baselines</div>
          <div className="text-2xl font-bold">{baselines.length}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Non-Compliant Hosts</div>
          <div className="text-2xl font-bold text-red-400">
            {scans.filter(s => s.status === 'non_compliant').length}
          </div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Active Tasks</div>
          <div className="text-2xl font-bold text-blue-400">
            {tasks.filter(t => t.status !== 'completed' && t.status !== 'failed').length}
          </div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Rolling Updates</div>
          <div className="text-2xl font-bold">{updates.filter(u => u.status === 'running').length} active</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-800/50 rounded-lg p-1">
        {(['baselines', 'compliance', 'remediation', 'updates'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium capitalize ${activeTab === tab ? 'bg-blue-600' : 'hover:bg-white/[0.03]'}`}>
            {tab === 'updates' ? 'Rolling Updates' : tab === 'compliance' ? 'Compliance Scans' : tab}
          </button>
        ))}
      </div>

      {/* Baselines Tab */}
      {activeTab === 'baselines' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateBaseline(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Baseline
            </button>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
            <table className="min-w-full divide-y divide-slate-700/50">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase">
                  <th className="p-4">Name</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Severity</th>
                  <th className="p-4">Release Date</th>
                  <th className="p-4">Hosts</th>
                  <th className="p-4">Compliant</th>
                  <th className="p-4">Compliance</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {baselines.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-slate-400">No baselines configured.</td></tr>
                ) : baselines.map(bl => {
                  const compPct = bl.host_count > 0 ? (bl.compliant_count / bl.host_count * 100) : 0
                  return (
                    <tr key={bl.id} className="hover:bg-slate-900">
                      <td className="p-4">
                        <div className="font-medium">{bl.name}</div>
                        {bl.description && <div className="text-xs text-slate-400">{bl.description}</div>}
                      </td>
                      <td className="p-4 text-sm">{bl.baseline_type}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(bl.severity)}`}>{bl.severity}</span>
                      </td>
                      <td className="p-4 text-sm text-slate-400">{new Date(bl.release_date).toLocaleDateString()}</td>
                      <td className="p-4 text-sm">{bl.host_count}</td>
                      <td className="p-4 text-sm text-green-400">{bl.compliant_count}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-slate-800 rounded-full h-2">
                            <div className={`h-2 rounded-full ${compPct === 100 ? 'bg-green-500' : compPct > 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${compPct}%` }} />
                          </div>
                          <span className="text-xs text-slate-400">{compPct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleRunScan(bl.id)} className="text-blue-400 hover:text-blue-300 p-1" title="Run scan">
                            <Play className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteBaseline(bl.id)} className="text-red-600 hover:text-red-800 p-1">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Compliance Scans Tab */}
      {activeTab === 'compliance' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
          <table className="min-w-full divide-y divide-slate-700/50">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase">
                <th className="p-4">Host</th>
                <th className="p-4">Baseline</th>
                <th className="p-4">Status</th>
                <th className="p-4">Missing Patches</th>
                <th className="p-4">Scanned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {scans.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400">No compliance scan results.</td></tr>
              ) : scans.map(scan => (
                <tr key={scan.id} className="hover:bg-slate-900">
                  <td className="p-4 font-medium">{scan.hostname}</td>
                  <td className="p-4 text-sm text-slate-400">{scan.baseline_name}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(scan.status)}`}>{scan.status.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="p-4 text-sm">
                    {scan.missing_patches.length > 0 ? (
                      <span className="text-red-400">{scan.missing_patches.length} patches</span>
                    ) : <span className="text-green-400">None</span>}
                  </td>
                  <td className="p-4 text-sm text-slate-400">{new Date(scan.last_scanned).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Remediation Tab */}
      {activeTab === 'remediation' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
          <table className="min-w-full divide-y divide-slate-700/50">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase">
                <th className="p-4">Host</th>
                <th className="p-4">Baseline</th>
                <th className="p-4">Status</th>
                <th className="p-4">Progress</th>
                <th className="p-4">Patches</th>
                <th className="p-4">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {tasks.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400">No remediation tasks.</td></tr>
              ) : tasks.map(task => (
                <tr key={task.id} className="hover:bg-slate-900">
                  <td className="p-4 font-medium">{task.hostname}</td>
                  <td className="p-4 text-sm text-slate-400">{task.baseline_name}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(task.status)}`}>{task.status.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-slate-800 rounded-full h-2">
                        <div className="h-2 rounded-full bg-blue-500" style={{ width: `${task.progress}%` }} />
                      </div>
                      <span className="text-xs text-slate-400">{task.progress}%</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm">{task.patches_applied}/{task.patches_total}</td>
                  <td className="p-4 text-sm text-red-400">{task.error || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rolling Updates Tab */}
      {activeTab === 'updates' && (
        <div className="space-y-4">
          {updates.length === 0 ? (
            <div className="text-center py-12 text-slate-400 bg-slate-800/50 rounded-lg">No rolling updates.</div>
          ) : updates.map(update => {
            const updatePct = update.total_hosts > 0 ? (update.completed_hosts / update.total_hosts) * 100 : 0
            return (
            <div key={update.id} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{update.name}</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(update.status)}`}>{update.status}</span>
                </div>
                <span className="text-sm text-slate-400">
                  {update.completed_hosts}/{update.total_hosts} hosts | Parallel: {update.parallel_count}
                </span>
              </div>
              <div className="mb-2">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>{update.current_host ? `Current: ${update.current_host}` : 'Waiting...'}</span>
                  <span>{updatePct.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-3">
                  <div className={`h-3 rounded-full ${update.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${updatePct}%` }} />
                </div>
              </div>
              <div className="text-xs text-slate-500">
                {update.started_at && `Started: ${new Date(update.started_at).toLocaleString()}`}
                {update.completed_at && ` | Completed: ${new Date(update.completed_at).toLocaleString()}`}
                {update.failed_hosts > 0 && <span className="text-red-400"> | {update.failed_hosts} failed</span>}
              </div>
            </div>
          )})}
        </div>
      )}

      {/* Create Baseline Modal */}
      {showCreateBaseline && (
        <CreateBaselineModal onClose={() => setShowCreateBaseline(false)} onCreated={() => { setShowCreateBaseline(false); loadData() }} />
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

function CreateBaselineModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToastContext()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [baselineType, setBaselineType] = useState<'patch' | 'upgrade' | 'extension'>('patch')
  const [severity, setSeverity] = useState<'critical' | 'important' | 'moderate' | 'low'>('moderate')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await createBaseline({ name, description: description || undefined, baseline_type: baselineType, severity }); onCreated() }
    catch { toast.error('Failed to create baseline') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create Baseline</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required /></div>
          <div><label className="block text-sm font-medium mb-1">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" /></div>
          <div><label className="block text-sm font-medium mb-1">Type</label>
            <select value={baselineType} onChange={e => setBaselineType(e.target.value as 'patch' | 'upgrade' | 'extension')} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2">
              <option value="patch">Patch</option><option value="upgrade">Upgrade</option><option value="extension">Extension</option>
            </select></div>
          <div><label className="block text-sm font-medium mb-1">Severity</label>
            <select value={severity} onChange={e => setSeverity(e.target.value as 'critical' | 'important' | 'moderate' | 'low')} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2">
              <option value="critical">Critical</option><option value="important">Important</option><option value="moderate">Moderate</option><option value="low">Low</option>
            </select></div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}
