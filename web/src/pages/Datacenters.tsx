// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { Plus, ChevronRight, ChevronDown, Trash2, Server, Wrench } from 'lucide-react'
import {
  listDatacenters,
  createDatacenter,
  deleteDatacenter,
  getDatacenterSummary,
  listClusters,
  createCluster,
  deleteCluster,
  listHosts,
  registerHost,
  removeHost,
  hostEnterMaintenance,
  hostExitMaintenance,
  type Datacenter,
  type Cluster,
  type HostInfo,
  type DatacenterSummary,
} from '../api/datacenter'
import { useToastContext } from '../contexts/ToastContext'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import { PageHeader } from '../components/ui'
import PageLoadBanner from '../components/PageLoadBanner'
import { usePageLoader } from '../hooks/usePageLoader'

export default function Datacenters() {
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const [datacenters, setDatacenters] = useState<Datacenter[]>([])
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [hosts, setHosts] = useState<HostInfo[]>([])
  const [summaries, setSummaries] = useState<Map<string, DatacenterSummary>>(new Map())
  const { loading, loadError, run } = usePageLoader('Failed to load datacenters')
  const [expandedDCs, setExpandedDCs] = useState<Set<string>>(new Set())
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set())
  const [showCreateDC, setShowCreateDC] = useState(false)
  const [showCreateCluster, setShowCreateCluster] = useState<string | null>(null)
  const [showRegisterHost, setShowRegisterHost] = useState<string | null>(null)

  const loadData = useCallback(() => {
    return run(async () => {
      const [dcs, cls, hs] = await Promise.all([
        listDatacenters(),
        listClusters(),
        listHosts(),
      ])
      setDatacenters(dcs)
      setClusters(cls)
      setHosts(hs)

      const sums = new Map<string, DatacenterSummary>()
      for (const dc of dcs) {
        try {
          const s = await getDatacenterSummary(dc.id)
          sums.set(dc.id, s)
        } catch { /* skip */ }
      }
      setSummaries(sums)
    })
  }, [run])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const toggleDC = (id: string) => {
    setExpandedDCs(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleCluster = (id: string) => {
    setExpandedClusters(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDeleteDC = async (id: string) => {
    if (!await confirm('Delete Datacenter', 'Delete this datacenter?')) return
    try {
      await deleteDatacenter(id)
      toast.success('Datacenter deleted')
      loadData()
    } catch { toast.error('Failed to delete datacenter') }
  }

  const handleDeleteCluster = async (id: string) => {
    if (!await confirm('Delete Cluster', 'Delete this cluster?')) return
    try {
      await deleteCluster(id)
      toast.success('Cluster deleted')
      loadData()
    } catch { toast.error('Failed to delete cluster') }
  }

  const handleRemoveHost = async (id: string) => {
    if (!await confirm('Remove Host', 'Remove this host?')) return
    try {
      await removeHost(id)
      toast.success('Host removed')
      loadData()
    } catch { toast.error('Failed to remove host') }
  }

  const handleToggleMaintenance = async (host: HostInfo) => {
    try {
      if (host.status === 'Maintenance') {
        await hostExitMaintenance(host.id)
        toast.success('Host exited maintenance mode')
      } else {
        await hostEnterMaintenance(host.id)
        toast.success('Host entering maintenance mode')
      }
      loadData()
    } catch { toast.error('Failed to toggle maintenance mode') }
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      Connected: 'bg-green-100 text-green-800',
      Disconnected: 'bg-red-100 text-red-800',
      Maintenance: 'bg-yellow-100 text-yellow-800',
      Active: 'bg-green-100 text-green-800',
    }
    return colors[status] || 'bg-slate-500/20 text-slate-400'
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Datacenters"
        onRefresh={() => void loadData()}
        refreshing={loading}
        actions={
          <button
            onClick={() => setShowCreateDC(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Datacenter
          </button>
        }
      />
      <PageLoadBanner
        title="Could not load datacenters"
        headline={loadError}
        onRetry={() => void loadData()}
      />

      {loading && !loadError ? (
        <div className="text-center py-8 text-slate-400">Loading…</div>
      ) : !loadError ? (
      <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Datacenters</div>
          <div className="text-2xl font-bold">{datacenters.length}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Clusters</div>
          <div className="text-2xl font-bold">{clusters.length}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Hosts</div>
          <div className="text-2xl font-bold">{hosts.length}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Total VMs</div>
          <div className="text-2xl font-bold">
            {hosts.reduce((s, h) => s + h.vm_count, 0)}
          </div>
        </div>
      </div>

      {/* Tree View */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
        {datacenters.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            No datacenters configured. Create one to get started.
          </div>
        ) : (
          datacenters.map(dc => {
            const dcClusters = clusters.filter(c => c.datacenter_id === dc.id)
            const summary = summaries.get(dc.id)
            const isExpanded = expandedDCs.has(dc.id)

            return (
              <div key={dc.id} className="border-b border-slate-700/50 last:border-b-0">
                <div
                  className="flex items-center justify-between p-4 hover:bg-slate-900 cursor-pointer"
                  onClick={() => toggleDC(dc.id)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {isExpanded ? <ChevronDown className="w-5 h-5 shrink-0" /> : <ChevronRight className="w-5 h-5 shrink-0" />}
                    <Server className="w-5 h-5 text-blue-400 shrink-0" />
                    <span className="font-semibold text-lg truncate">{dc.name}</span>
                    {summary && (
                      <span className="text-sm text-slate-400 ml-2 truncate">
                        {summary.cluster_count} clusters, {summary.host_count} hosts, {summary.vm_count} VMs
                        {summary.total_cpus > 0 && ` | ${summary.total_cpus} CPUs`}
                        {summary.total_memory_mb > 0 && ` | ${(summary.total_memory_mb / 1024).toFixed(1)} GB RAM`}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setShowCreateCluster(dc.id)}
                      className="text-blue-400 hover:text-blue-300 text-sm px-2 py-1"
                    >
                      + Cluster
                    </button>
                    <button
                      onClick={() => handleDeleteDC(dc.id)}
                      className="text-red-600 hover:text-red-800 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isExpanded && dcClusters.map(cl => {
                  const clHosts = hosts.filter(h => h.cluster_id === cl.id)
                  const clExpanded = expandedClusters.has(cl.id)

                  return (
                    <div key={cl.id} className="ml-8">
                      <div
                        className="flex items-center justify-between p-3 hover:bg-slate-900 cursor-pointer border-t border-slate-700/50"
                        onClick={() => toggleCluster(cl.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {clExpanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                          <span className="font-medium truncate">{cl.name}</span>
                          <span className="text-xs text-slate-400 truncate">
                            {clHosts.length} hosts |
                            HA: {cl.ha_enabled ? 'On' : 'Off'} |
                            DRS: {cl.drs_enabled ? cl.drs_mode : 'Off'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setShowRegisterHost(cl.id)}
                            className="text-blue-400 hover:text-blue-300 text-sm px-2 py-1"
                          >
                            + Host
                          </button>
                          <button
                            onClick={() => handleDeleteCluster(cl.id)}
                            className="text-red-600 hover:text-red-800 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {clExpanded && clHosts.length > 0 && (
                        <div className="ml-8 border-t border-slate-700/50">
                          <table className="min-w-full divide-y divide-slate-700/50">
                            <thead>
                              <tr className="text-left text-xs text-slate-400">
                                <th className="p-2">Hostname</th>
                                <th className="p-2">Address</th>
                                <th className="p-2">CPUs</th>
                                <th className="p-2">Memory</th>
                                <th className="p-2">CPU Usage</th>
                                <th className="p-2">Mem Usage</th>
                                <th className="p-2">VMs</th>
                                <th className="p-2">Status</th>
                                <th className="p-2">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                              {clHosts.map(host => (
                                <tr key={host.id} className="hover:bg-slate-900">
                                  <td className="p-2 font-medium">{host.hostname}</td>
                                  <td className="p-2 font-mono text-sm text-slate-400">{host.address}</td>
                                  <td className="p-2 text-sm">{host.cpus}</td>
                                  <td className="p-2 text-sm">{(host.memory_mb / 1024).toFixed(1)} GB</td>
                                  <td className="p-2">
                                    <div className="flex items-center gap-2">
                                      <div className="w-16 bg-slate-800 rounded-full h-2">
                                        <div
                                          className={`h-2 rounded-full ${host.cpu_usage_pct > 80 ? 'bg-red-500' : host.cpu_usage_pct > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                          style={{ width: `${host.cpu_usage_pct}%` }}
                                        />
                                      </div>
                                      <span className="text-xs text-slate-400">{host.cpu_usage_pct}%</span>
                                    </div>
                                  </td>
                                  <td className="p-2">
                                    <div className="flex items-center gap-2">
                                      <div className="w-16 bg-slate-800 rounded-full h-2">
                                        <div
                                          className={`h-2 rounded-full ${host.memory_usage_pct > 80 ? 'bg-red-500' : host.memory_usage_pct > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                          style={{ width: `${host.memory_usage_pct}%` }}
                                        />
                                      </div>
                                      <span className="text-xs text-slate-400">{host.memory_usage_pct}%</span>
                                    </div>
                                  </td>
                                  <td className="p-2 text-sm">{host.vm_count}</td>
                                  <td className="p-2">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(host.status)}`}>
                                      {host.status}
                                    </span>
                                  </td>
                                  <td className="p-2">
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => handleToggleMaintenance(host)}
                                        className="p-1 hover:bg-white/[0.03] rounded"
                                        title={host.status === 'Maintenance' ? 'Exit maintenance' : 'Enter maintenance'}
                                      >
                                        <Wrench className={`w-4 h-4 ${host.status === 'Maintenance' ? 'text-yellow-500' : 'text-slate-400'}`} />
                                      </button>
                                      <button
                                        onClick={() => handleRemoveHost(host.id)}
                                        className="text-red-600 hover:text-red-800 p-1"
                                      >
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

                      {clExpanded && clHosts.length === 0 && (
                        <div className="ml-8 p-4 text-slate-500 text-sm">No hosts registered in this cluster.</div>
                      )}
                    </div>
                  )
                })}

                {isExpanded && dcClusters.length === 0 && (
                  <div className="ml-8 p-4 text-slate-500 text-sm">No clusters in this datacenter.</div>
                )}
              </div>
            )
          })
        )}
      </div>
      </>
      ) : null}

      {/* Create Datacenter Modal */}
      {showCreateDC && (
        <CreateDCModal
          onClose={() => setShowCreateDC(false)}
          onCreated={() => { setShowCreateDC(false); loadData() }}
        />
      )}

      {/* Create Cluster Modal */}
      {showCreateCluster && (
        <CreateClusterModal
          datacenterId={showCreateCluster}
          onClose={() => setShowCreateCluster(null)}
          onCreated={() => { setShowCreateCluster(null); loadData() }}
        />
      )}

      {/* Register Host Modal */}
      {showRegisterHost && (
        <RegisterHostModal
          clusterId={showRegisterHost}
          onClose={() => setShowRegisterHost(null)}
          onCreated={() => { setShowRegisterHost(null); loadData() }}
        />
      )}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel ?? 'Delete'}
          variant={confirmState.variant ?? 'danger'}
          onConfirm={confirmState.onConfirm}
          onCancel={cancel}
        />
      )}
    </div>
  )
}

function CreateDCModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToastContext()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createDatacenter({ name, description: description || undefined })
      onCreated()
    } catch { toast.error('Failed to create datacenter') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create Datacenter</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" />
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

function CreateClusterModal({ datacenterId, onClose, onCreated }: { datacenterId: string; onClose: () => void; onCreated: () => void }) {
  const toast = useToastContext()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createCluster({ name, datacenter_id: datacenterId, description: description || undefined })
      onCreated()
    } catch { toast.error('Failed to create cluster') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create Cluster</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Cluster Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" />
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

function RegisterHostModal({ clusterId, onClose, onCreated }: { clusterId: string; onClose: () => void; onCreated: () => void }) {
  const toast = useToastContext()
  const [hostname, setHostname] = useState('')
  const [address, setAddress] = useState('')
  const [cpus, setCpus] = useState(4)
  const [memoryMb, setMemoryMb] = useState(8192)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await registerHost({ hostname, address, cluster_id: clusterId, cpus, memory_mb: memoryMb })
      onCreated()
    } catch { toast.error('Failed to register host') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Register Host</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Hostname</label>
            <input type="text" value={hostname} onChange={e => setHostname(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">IP Address</label>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">CPUs</label>
              <input type="number" value={cpus} onChange={e => setCpus(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" min={1} required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Memory (MB)</label>
              <input type="number" value={memoryMb} onChange={e => setMemoryMb(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" min={512} required />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Register</button>
          </div>
        </form>
      </div>
    </div>
  )
}
