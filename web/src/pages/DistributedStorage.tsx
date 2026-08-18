// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import {
  listDistributedPools,
  createDistributedPool,
  deleteDistributedPool,
  listStoragePolicies,
  createStoragePolicy,
  deleteStoragePolicy,
  listStorageMigrations,
  listDatastoreClusters,
  createDatastoreCluster,
  type DistributedStoragePool,
  type StoragePolicy,
  type StorageMigration,
  type DatastoreCluster,
} from '../api/distributedStorage'
import { useToastContext } from '../contexts/ToastContext'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import PageLoadBanner from '../components/PageLoadBanner'
import { usePageLoader } from '../hooks/usePageLoader'

export default function DistributedStorage() {
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const [pools, setPools] = useState<DistributedStoragePool[]>([])
  const [policies, setPolicies] = useState<StoragePolicy[]>([])
  const [migrations, setMigrations] = useState<StorageMigration[]>([])
  const [dsClusters, setDsClusters] = useState<DatastoreCluster[]>([])
  const { loading, loadError, run } = usePageLoader('Failed to load distributed storage')
  const [activeTab, setActiveTab] = useState<'pools' | 'policies' | 'migrations' | 'clusters'>('pools')
  const [showCreatePool, setShowCreatePool] = useState(false)
  const [showCreatePolicy, setShowCreatePolicy] = useState(false)
  const [showCreateCluster, setShowCreateCluster] = useState(false)

  const loadData = useCallback(() => {
    return run(async () => {
      const [p, pol, mig, cl] = await Promise.all([
        listDistributedPools(),
        listStoragePolicies(),
        listStorageMigrations(),
        listDatastoreClusters(),
      ])
      setPools(p)
      setPolicies(pol)
      setMigrations(mig)
      setDsClusters(cl)
    })
  }, [run])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleDeletePool = async (id: string) => {
    const ok = await confirm('Delete Pool', 'Delete this storage pool?', { variant: 'danger', confirmLabel: 'Delete' })
    if (!ok) return
    try {
      await deleteDistributedPool(id)
      toast.success('Storage pool deleted')
      loadData()
    } catch { toast.error('Failed to delete storage pool') }
  }

  const handleDeletePolicy = async (id: string) => {
    const ok = await confirm('Delete Policy', 'Delete this storage policy?', { variant: 'danger', confirmLabel: 'Delete' })
    if (!ok) return
    try {
      await deleteStoragePolicy(id)
      toast.success('Storage policy deleted')
      loadData()
    } catch { toast.error('Failed to delete storage policy') }
  }

  const formatGB = (gb: number) => gb >= 1024 ? `${(gb / 1024).toFixed(1)} TB` : `${gb.toFixed(1)} GB`
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      online: 'bg-green-100 text-green-800',
      healthy: 'bg-green-100 text-green-800',
      degraded: 'bg-yellow-100 text-yellow-800',
      offline: 'bg-red-100 text-red-800',
      compliant: 'bg-green-100 text-green-800',
      non_compliant: 'bg-red-100 text-red-800',
      completed: 'bg-green-100 text-green-800',
      in_progress: 'bg-blue-100 text-blue-800',
      pending: 'bg-slate-500/20 text-slate-400',
      failed: 'bg-red-100 text-red-800',
    }
    return colors[status] || 'bg-slate-500/20 text-slate-400'
  }


  return (
    <div className="p-6">
      <PageLoadBanner title="Could not load distributed storage" headline={loadError} onRetry={() => void loadData()} />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Distributed Storage</h1>
        <button onClick={() => void loadData()} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-slate-400 text-sm mb-1">Storage Pools</div>
          <div className="text-2xl font-bold">{pools.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-slate-400 text-sm mb-1">Total Capacity</div>
          <div className="text-2xl font-bold">{formatGB(pools.reduce((s, p) => s + p.total_capacity_gb, 0))}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-slate-400 text-sm mb-1">Policies</div>
          <div className="text-2xl font-bold">{policies.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-slate-400 text-sm mb-1">Active Migrations</div>
          <div className="text-2xl font-bold text-blue-400">
            {migrations.filter(m => m.status === 'in_progress').length}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-800/50 rounded-lg p-1">
        {(['pools', 'policies', 'migrations', 'clusters'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium capitalize ${activeTab === tab ? 'bg-blue-600' : 'hover:bg-white/[0.03]'}`}>
            {tab === 'clusters' ? 'Datastore Clusters' : tab}
          </button>
        ))}
      </div>

      {/* Pools Tab */}
      {activeTab === 'pools' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreatePool(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Pool
            </button>
          </div>
          <div className="space-y-4">
            {pools.length === 0 ? (
              <div className="text-center py-12 text-slate-400 bg-slate-800/50 rounded-lg">No storage pools configured.</div>
            ) : pools.map(pool => {
              const usedPct = pool.total_capacity_gb > 0 ? (pool.used_capacity_gb / pool.total_capacity_gb * 100) : 0
              return (
                <div key={pool.id} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-lg">{pool.name}</span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(pool.status)}`}>
                        {pool.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-400">{pool.hosts.length} hosts | RF: {pool.replication_factor}</span>
                      <button onClick={() => handleDeletePool(pool.id)} className="text-red-600 hover:text-red-800 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mb-2">
                    <div className="flex justify-between text-sm text-slate-400 mb-1">
                      <span>Used: {formatGB(pool.used_capacity_gb)}</span>
                      <span>Total: {formatGB(pool.total_capacity_gb)}</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-3">
                      <div className={`h-3 rounded-full ${usedPct > 90 ? 'bg-red-500' : usedPct > 75 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min(usedPct, 100)}%` }} />
                    </div>
                    <div className="text-right text-xs text-slate-400 mt-1">
                      {formatGB(pool.available_capacity_gb)} free ({(100 - usedPct).toFixed(1)}%)
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Policies Tab */}
      {activeTab === 'policies' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreatePolicy(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Policy
            </button>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
            <table className="min-w-full divide-y divide-slate-700/50">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase">
                  <th className="p-4">Name</th>
                  <th className="p-4">Tier</th>
                  <th className="p-4">RF</th>
                  <th className="p-4">FTT</th>
                  <th className="p-4">Encryption</th>
                  <th className="p-4">Dedup</th>
                  <th className="p-4">Compression</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {policies.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-slate-400">No storage policies.</td></tr>
                ) : policies.map(pol => (
                  <tr key={pol.id} className="hover:bg-slate-900">
                    <td className="p-4">
                      <div className="font-medium">{pol.name}</div>
                      {pol.description && <div className="text-xs text-slate-400">{pol.description}</div>}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        pol.tier === 'performance' ? 'bg-purple-100 text-purple-800' :
                        pol.tier === 'archive' ? 'bg-slate-500/20 text-slate-400' : 'bg-blue-100 text-blue-800'
                      }`}>{pol.tier}</span>
                    </td>
                    <td className="p-4 text-sm">{pol.replication_factor}</td>
                    <td className="p-4 text-sm">{pol.failure_tolerance}</td>
                    <td className="p-4 text-sm">{pol.encryption_enabled ? 'Yes' : 'No'}</td>
                    <td className="p-4 text-sm">{pol.deduplication_enabled ? 'Yes' : 'No'}</td>
                    <td className="p-4 text-sm">{pol.compression_enabled ? 'Yes' : 'No'}</td>
                    <td className="p-4">
                      <button onClick={() => handleDeletePolicy(pol.id)} className="text-red-600 hover:text-red-800">
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

      {/* Migrations Tab */}
      {activeTab === 'migrations' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
          <table className="min-w-full divide-y divide-slate-700/50">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase">
                <th className="p-4">VM</th>
                <th className="p-4">From</th>
                <th className="p-4">To</th>
                <th className="p-4">Progress</th>
                <th className="p-4">Transferred</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {migrations.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400">No storage migrations.</td></tr>
              ) : migrations.map(mig => (
                <tr key={mig.id} className="hover:bg-slate-900">
                  <td className="p-4 font-medium">{mig.vm_name}</td>
                  <td className="p-4 text-sm text-slate-400">{mig.source_pool_name}</td>
                  <td className="p-4 text-sm text-slate-400">{mig.target_pool_name}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-slate-800 rounded-full h-2">
                        <div className="h-2 rounded-full bg-blue-500" style={{ width: `${mig.progress_pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-400">{mig.progress_pct}%</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm">{formatBytes(mig.bytes_migrated)} / {formatBytes(mig.bytes_total)}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(mig.status)}`}>
                      {mig.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Datastore Clusters Tab */}
      {activeTab === 'clusters' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateCluster(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Cluster
            </button>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
            <table className="min-w-full divide-y divide-slate-700/50">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase">
                  <th className="p-4">Name</th>
                  <th className="p-4">Datastores</th>
                  <th className="p-4">SDRS</th>
                  <th className="p-4">Space Threshold</th>
                  <th className="p-4">Capacity</th>
                  <th className="p-4">VMs</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {dsClusters.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-400">No datastore clusters.</td></tr>
                ) : dsClusters.map(cl => (
                  <tr key={cl.id} className="hover:bg-slate-900">
                    <td className="p-4 font-medium">{cl.name}</td>
                    <td className="p-4 text-sm">{cl.storage_pool_ids.length}</td>
                    <td className="p-4 text-sm">{cl.sdrs_enabled ? 'Enabled' : 'Disabled'}</td>
                    <td className="p-4 text-sm">{cl.space_threshold_pct}%</td>
                    <td className="p-4 text-sm">{formatGB(cl.total_capacity_gb)}</td>
                    <td className="p-4 text-sm">{cl.vm_count}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(cl.status)}`}>
                        {cl.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Pool Modal */}
      {showCreatePool && (
        <ModalForm title="Create Storage Pool" onClose={() => setShowCreatePool(false)}
          onSubmit={async (data) => {
            const hosts = String(data.hosts || '').split(',').map((h: string) => h.trim()).filter(Boolean)
            if (hosts.length === 0) { toast.error('At least one host is required'); return }
            await createDistributedPool({ ...data, hosts } as any)
            toast.success('Pool created')
            setShowCreatePool(false)
            loadData()
          }}
          fields={[
            { name: 'name', label: 'Pool Name', type: 'text', required: true },
            { name: 'pool_type', label: 'Type', type: 'text', required: true },
            { name: 'hosts', label: 'Hosts (comma-separated)', type: 'text', required: true },
            { name: 'replication_factor', label: 'Replication Factor', type: 'number', defaultValue: 2 },
          ]}
        />
      )}

      {/* Create Policy Modal */}
      {showCreatePolicy && (
        <ModalForm title="Create Storage Policy" onClose={() => setShowCreatePolicy(false)}
          onSubmit={async (data) => { await createStoragePolicy(data as any); toast.success('Policy created'); setShowCreatePolicy(false); loadData() }}
          fields={[
            { name: 'name', label: 'Policy Name', type: 'text', required: true },
            { name: 'description', label: 'Description', type: 'text' },
            { name: 'replication_factor', label: 'Replication Factor', type: 'number', defaultValue: 2 },
            { name: 'stripe_width', label: 'Stripe Width', type: 'number', defaultValue: 1 },
            { name: 'failure_tolerance', label: 'Failures to Tolerate', type: 'number', defaultValue: 1 },
            { name: 'tier', label: 'Tier', type: 'select', options: ['performance', 'standard', 'archive'], defaultValue: 'standard' },
          ]}
        />
      )}

      {/* Create Cluster Modal */}
      {showCreateCluster && (
        <ModalForm title="Create Datastore Cluster" onClose={() => setShowCreateCluster(false)}
          onSubmit={async (data) => { await createDatastoreCluster(data as any); toast.success('Cluster created'); setShowCreateCluster(false); loadData() }}
          fields={[
            { name: 'name', label: 'Cluster Name', type: 'text', required: true },
            {
              name: 'storage_pool_ids', label: 'Storage Pools', type: 'multiselect', required: true,
              options: pools.map(p => p.id),
              optionLabels: Object.fromEntries(pools.map(p => [p.id, p.name])),
            },
            { name: 'space_threshold_pct', label: 'Space Threshold (%)', type: 'number', defaultValue: 80 },
            { name: 'io_latency_threshold_ms', label: 'IO Latency Threshold (ms)', type: 'number', defaultValue: 15 },
          ]}
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

interface FieldDef {
  name: string
  label: string
  type: 'text' | 'number' | 'select' | 'multiselect'
  required?: boolean
  defaultValue?: string | number | string[]
  options?: string[]
  optionLabels?: Record<string, string>
}

function ModalForm({ title, fields, onClose, onSubmit }: {
  title: string; fields: FieldDef[]; onClose: () => void; onSubmit: (data: Record<string, any>) => Promise<void>
}) {
  const toast = useToastContext()
  const [values, setValues] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {}
    fields.forEach(f => { init[f.name] = f.defaultValue ?? (f.type === 'multiselect' ? [] : '') })
    return init
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    for (const f of fields) {
      if (f.required && f.type === 'multiselect' && (values[f.name] as string[]).length === 0) {
        toast.error(`${f.label} requires at least one selection`)
        return
      }
    }
    try {
      await onSubmit(values)
    } catch { toast.error(`Failed: ${title}`) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">{title}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map(f => (
            <div key={f.name}>
              <label className="block text-sm font-medium mb-1">{f.label}</label>
              {f.type === 'select' ? (
                <select value={values[f.name]} onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2">
                  {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === 'multiselect' ? (
                f.options && f.options.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {f.options.map(o => {
                      const selected: string[] = values[f.name]
                      const isSel = selected.includes(o)
                      return (
                        <button type="button" key={o}
                          onClick={() => setValues(v => ({
                            ...v,
                            [f.name]: isSel ? selected.filter(x => x !== o) : [...selected, o],
                          }))}
                          className={`px-2.5 py-1 rounded text-xs transition ${isSel ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700/50'}`}>
                          {f.optionLabels?.[o] ?? o}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Nothing available to select yet.</p>
                )
              ) : (
                <input type={f.type} value={values[f.name]}
                  onChange={e => setValues(v => ({ ...v, [f.name]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required={f.required} />
              )}
            </div>
          ))}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}
