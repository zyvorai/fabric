// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect } from 'react'
import { HardDrive, Plus, Play, Square, Trash2, RefreshCw, Server, Folder, AlertCircle, CheckCircle } from 'lucide-react'
import {
  listStoragePools,
  createNfsPool,
  createLocalPool,
  createCephPool,
  deleteStoragePool,
  startStoragePool,
  stopStoragePool,
  refreshPoolStats,
  getNfsHealth,
  getCephHealth,
  type StoragePool,
  type NfsHealth,
} from '../api/storage'
import { useConfirm } from '../hooks/useConfirm'
import { useToastContext } from '../contexts/ToastContext'
import ConfirmDialog from '../components/ConfirmDialog'
import ErrorBanner from '../components/ErrorBanner'
import { formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'

export default function StoragePools() {
  const { confirmState, confirm, cancel } = useConfirm()
  const toast = useToastContext()
  const [pools, setPools] = useState<StoragePool[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [nfsHealth, setNfsHealth] = useState<Map<string, NfsHealth>>(new Map())
  const [cephHealth, setCephHealth] = useState<Map<string, { status: string; detail: string }>>(new Map())
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    loadPools()
  }, [])

  const loadPools = async () => {
    setLoadError(null)
    try {
      const data = await listStoragePools()
      setPools(data)

      // Load health for NFS and Ceph pools
      for (const pool of data) {
        if (typeof pool.pool_type === 'object' && 'NFS' in pool.pool_type) {
          try {
            const health = await getNfsHealth(pool.name)
            setNfsHealth((prev) => new Map(prev).set(pool.name, health))
          } catch {
            // Health is optional; skip toast per pool to avoid noise
          }
        }
        if (typeof pool.pool_type === 'object' && 'Ceph' in pool.pool_type) {
          try {
            const health = await getCephHealth(pool.name)
            setCephHealth((prev) => new Map(prev).set(pool.name, health))
          } catch {
            // Health is optional; skip toast per pool to avoid noise
          }
        }
      }
    } catch (error) {
      const msg = formatUserError(error)
      setLoadError(msg)
      toastFailure(toast, 'Failed to load storage pools', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStart = async (name: string) => {
    try {
      await startStoragePool(name)
      await loadPools()
    } catch (error) {
      toastFailure(toast, 'Failed to start pool', error)
    }
  }

  const handleStop = async (name: string) => {
    try {
      await stopStoragePool(name)
      await loadPools()
    } catch (error) {
      toastFailure(toast, 'Failed to stop pool', error)
    }
  }

  const handleDelete = async (name: string) => {
    const ok = await confirm('Delete Storage Pool', `Are you sure you want to delete storage pool "${name}"?`, { variant: 'danger', confirmLabel: 'Delete' })
    if (!ok) return

    try {
      await deleteStoragePool(name)
      await loadPools()
    } catch (error) {
      toastFailure(toast, 'Failed to delete pool', error)
    }
  }

  const handleRefresh = async (name: string) => {
    try {
      await refreshPoolStats(name)
      await loadPools()
    } catch (error) {
      toastFailure(toast, 'Failed to refresh pool stats', error)
    }
  }

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1024) {
      return `${(gb / 1024).toFixed(2)} TB`
    }
    return `${gb.toFixed(2)} GB`
  }

  const getPoolTypeDisplay = (pool: StoragePool) => {
    if (pool.pool_type === 'Local') return 'Local'
    if (pool.pool_type === 'Directory') return 'Directory'
    if (typeof pool.pool_type === 'object') {
      if ('NFS' in pool.pool_type) {
        const nfs = pool.pool_type.NFS
        return `NFS: ${nfs.server}:${nfs.export_path}`
      }
      if ('LVM' in pool.pool_type) {
        return `LVM: ${pool.pool_type.LVM.volume_group}`
      }
      if ('LVMThin' in pool.pool_type) {
        return `LVM-thin: ${pool.pool_type.LVMThin.volume_group}/${pool.pool_type.LVMThin.thin_pool}`
      }
      if ('ZFS' in pool.pool_type) {
        const zfs = pool.pool_type.ZFS
        return `ZFS: ${zfs.zpool}${zfs.dataset ? '/' + zfs.dataset : ''}`
      }
      if ('Ceph' in pool.pool_type) {
        const ceph = pool.pool_type.Ceph
        return `Ceph: ${ceph.pool_name} (${ceph.monitors.length} mons)`
      }
    }
    return 'Unknown'
  }

  const getStateColor = (state: string) => {
    switch (state) {
      case 'Active':
        return 'text-green-500'
      case 'Inactive':
        return 'text-slate-500'
      case 'Starting':
      case 'Stopping':
        return 'text-yellow-500'
      case 'Degraded':
        return 'text-orange-500'
      case 'Failed':
        return 'text-red-500'
      default:
        return 'text-slate-500'
    }
  }

  const getHealthIcon = (health?: NfsHealth) => {
    if (!health) return null

    if (health.status === 'Healthy') {
      return <CheckCircle className="w-4 h-4 text-green-500" />
    }
    return <AlertCircle className="w-4 h-4 text-red-500" />
  }

  if (loading) {
    return <div className="p-8">Loading storage pools...</div>
  }

  return (
    <div className="p-8">
      {loadError && (
        <ErrorBanner
          title="Could not load storage pools"
          headline={loadError}
          hints={hintsForError(loadError, 'storage')}
          onRetry={loadPools}
        />
      )}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-2">Storage Pools</h1>
          <p className="text-slate-400">Manage local and network storage pools</p>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition"
        >
          <Plus className="w-4 h-4" />
          Create Pool
        </button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="bg-slate-800/50 rounded-lg p-6">
          <div className="text-slate-400 text-sm mb-2">Total Pools</div>
          <div className="text-2xl font-bold">{pools.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-6">
          <div className="text-slate-400 text-sm mb-2">Active Pools</div>
          <div className="text-2xl font-bold text-green-500">
            {pools.filter((p) => p.state === 'Active').length}
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-6">
          <div className="text-slate-400 text-sm mb-2">Total Capacity</div>
          <div className="text-2xl font-bold">
            {formatBytes(pools.reduce((sum, p) => sum + p.capacity, 0))}
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-6">
          <div className="text-slate-400 text-sm mb-2">Available</div>
          <div className="text-2xl font-bold">
            {formatBytes(pools.reduce((sum, p) => sum + p.available, 0))}
          </div>
        </div>
      </div>

      {/* Pools List */}
      <div className="bg-slate-800/50 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-900">
            <tr className="text-left text-slate-400 text-sm">
              <th className="p-4">Name</th>
              <th className="p-4">Type</th>
              <th className="p-4">Path</th>
              <th className="p-4">Capacity</th>
              <th className="p-4">Available</th>
              <th className="p-4">Usage</th>
              <th className="p-4">State</th>
              <th className="p-4">Health</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pools.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-400">
                  No storage pools configured. Create one to get started.
                </td>
              </tr>
            ) : (
              pools.map((pool) => {
                const usagePercent =
                  pool.capacity > 0 ? ((pool.capacity - pool.available) / pool.capacity) * 100 : 0

                return (
                  <tr key={pool.id} className="border-t border-slate-700/50 hover:bg-slate-900">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {typeof pool.pool_type === 'object' && 'NFS' in pool.pool_type ? (
                          <Server className="w-4 h-4 text-blue-400" />
                        ) : (
                          <Folder className="w-4 h-4 text-slate-400" />
                        )}
                        <span className="font-medium">{pool.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-400">{getPoolTypeDisplay(pool)}</td>
                    <td className="p-4 text-sm text-slate-400 font-mono">{pool.path}</td>
                    <td className="p-4 text-sm">{formatBytes(pool.capacity)}</td>
                    <td className="p-4 text-sm">{formatBytes(pool.available)}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full ${
                              usagePercent > 90
                                ? 'bg-red-500'
                                : usagePercent > 75
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(usagePercent, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm text-slate-400 w-12 text-right">
                          {usagePercent.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`text-sm font-medium ${getStateColor(pool.state)}`}>
                        {pool.state}
                      </span>
                    </td>
                    <td className="p-4">
                      {getHealthIcon(nfsHealth.get(pool.name))}
                      {cephHealth.has(pool.name) && (
                        cephHealth.get(pool.name)?.status === 'Ok'
                          ? <CheckCircle className="w-4 h-4 text-green-500" />
                          : cephHealth.get(pool.name)?.status === 'Warn'
                          ? <AlertCircle className="w-4 h-4 text-yellow-500" />
                          : <AlertCircle className="w-4 h-4 text-red-500" />
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {pool.state === 'Inactive' ? (
                          <button
                            onClick={() => handleStart(pool.name)}
                            className="p-2 hover:bg-white/[0.03] rounded transition"
                            title="Start pool"
                          >
                            <Play className="w-4 h-4 text-green-500" />
                          </button>
                        ) : pool.state === 'Active' ? (
                          <button
                            onClick={() => handleStop(pool.name)}
                            className="p-2 hover:bg-white/[0.03] rounded transition"
                            title="Stop pool"
                          >
                            <Square className="w-4 h-4 text-yellow-500" />
                          </button>
                        ) : null}
                        <button
                          onClick={() => handleRefresh(pool.name)}
                          className="p-2 hover:bg-white/[0.03] rounded transition"
                          title="Refresh stats"
                        >
                          <RefreshCw className="w-4 h-4 text-blue-500" />
                        </button>
                        <button
                          onClick={() => handleDelete(pool.name)}
                          className="p-2 hover:bg-white/[0.03] rounded transition"
                          title="Delete pool"
                          disabled={pool.state === 'Active'}
                        >
                          <Trash2
                            className={`w-4 h-4 ${
                              pool.state === 'Active' ? 'text-slate-600' : 'text-red-500'
                            }`}
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create Pool Dialog */}
      {showCreateDialog && (
        <CreatePoolDialog onClose={() => setShowCreateDialog(false)} onCreated={loadPools} />
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

interface CreatePoolDialogProps {
  onClose: () => void
  onCreated: () => void
}

function CreatePoolDialog({ onClose, onCreated }: CreatePoolDialogProps) {
  const toast = useToastContext()
  const [poolType, setPoolType] = useState<'local' | 'nfs' | 'lvm' | 'lvm-thin' | 'zfs' | 'ceph'>('local')
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [autoStart, setAutoStart] = useState(true)

  // NFS specific
  const [nfsServer, setNfsServer] = useState('')
  const [nfsExportPath, setNfsExportPath] = useState('')
  const [nfsMountPath, setNfsMountPath] = useState('')
  const [nfsVersion, setNfsVersion] = useState<'V4' | 'V3' | 'V4_1' | 'V4_2'>('V4')
  const [mountOptions, setMountOptions] = useState('rw,hard,intr')

  // LVM specific
  const [volumeGroup, setVolumeGroup] = useState('')
  const [thinPool, setThinPool] = useState('')

  // ZFS specific
  const [zpool, setZpool] = useState('')
  const [dataset, setDataset] = useState('')

  // Ceph specific
  const [cephMonitors, setCephMonitors] = useState('')
  const [cephPoolName, setCephPoolName] = useState('')
  const [cephUser, setCephUser] = useState('')
  const [cephKeyring, setCephKeyring] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { createLvmPool, createLvmThinPool, createZfsPool } = await import('../api/storage')

    try {
      if (poolType === 'local') {
        await createLocalPool({ name, path, auto_start: autoStart })
      } else if (poolType === 'nfs') {
        await createNfsPool({
          name,
          config: {
            server: nfsServer,
            export_path: nfsExportPath,
            mount_path: nfsMountPath,
            mount_options: mountOptions.split(',').map((o) => o.trim()),
            auto_start: autoStart,
            nfs_version: nfsVersion,
          },
        })
      } else if (poolType === 'lvm') {
        await createLvmPool({ name, volume_group: volumeGroup, auto_start: autoStart })
      } else if (poolType === 'lvm-thin') {
        await createLvmThinPool({ name, volume_group: volumeGroup, thin_pool: thinPool, auto_start: autoStart })
      } else if (poolType === 'zfs') {
        await createZfsPool({ name, zpool, dataset: dataset || undefined, auto_start: autoStart })
      } else if (poolType === 'ceph') {
        await createCephPool({
          name,
          monitors: cephMonitors.split(',').map(m => m.trim()).filter(Boolean),
          pool_name: cephPoolName,
          user: cephUser || undefined,
          keyring: cephKeyring || undefined,
          auto_start: autoStart,
        })
      }

      onCreated()
      onClose()
    } catch (error) {
      toastFailure(toast, 'Failed to create pool', error)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-2xl">
        <h2 className="text-2xl font-bold mb-6">Create Storage Pool</h2>

        <form onSubmit={handleSubmit}>
          {/* Pool Type */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Pool Type</label>
            <div className="grid grid-cols-3 gap-3">
              {([
                { key: 'local' as const, label: 'Local', desc: 'Local filesystem', Icon: HardDrive },
                { key: 'nfs' as const, label: 'NFS', desc: 'Network file system', Icon: Server },
                { key: 'lvm' as const, label: 'LVM', desc: 'LVM volume group', Icon: HardDrive },
                { key: 'lvm-thin' as const, label: 'LVM-thin', desc: 'Thin provisioned LVM', Icon: HardDrive },
                { key: 'zfs' as const, label: 'ZFS', desc: 'ZFS pool/dataset', Icon: HardDrive },
                { key: 'ceph' as const, label: 'Ceph', desc: 'Ceph RBD pool', Icon: Server },
              ]).map(({ key, label, desc, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPoolType(key)}
                  className={`p-3 rounded border-2 transition text-center ${
                    poolType === key
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700/50 hover:border-slate-700/50'
                  }`}
                >
                  <Icon className="w-5 h-5 mx-auto mb-1" />
                  <div className="font-medium text-sm">{label}</div>
                  <div className="text-xs text-slate-400">{desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Common Fields */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Pool Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-4 py-2"
              placeholder="storage-pool-1"
              required
            />
          </div>

          {poolType === 'local' ? (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Local Path</label>
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700/50 rounded px-4 py-2 font-mono"
                placeholder="/var/lib/zyvor-fabricd/storage"
                required
              />
            </div>
          ) : poolType === 'lvm' || poolType === 'lvm-thin' ? (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Volume Group</label>
                <input
                  type="text"
                  value={volumeGroup}
                  onChange={(e) => setVolumeGroup(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700/50 rounded px-4 py-2 font-mono"
                  placeholder="vg0"
                  required
                />
              </div>
              {poolType === 'lvm-thin' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Thin Pool</label>
                  <input
                    type="text"
                    value={thinPool}
                    onChange={(e) => setThinPool(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700/50 rounded px-4 py-2 font-mono"
                    placeholder="thinpool0"
                    required
                  />
                </div>
              )}
            </>
          ) : poolType === 'zfs' ? (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">ZFS Pool</label>
                <input
                  type="text"
                  value={zpool}
                  onChange={(e) => setZpool(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700/50 rounded px-4 py-2 font-mono"
                  placeholder="tank"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Dataset (optional)</label>
                <input
                  type="text"
                  value={dataset}
                  onChange={(e) => setDataset(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700/50 rounded px-4 py-2 font-mono"
                  placeholder="vms"
                />
              </div>
            </>
          ) : poolType === 'ceph' ? (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Monitor Addresses</label>
                <input
                  type="text"
                  value={cephMonitors}
                  onChange={(e) => setCephMonitors(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700/50 rounded px-4 py-2 font-mono"
                  placeholder="10.0.0.1, 10.0.0.2, 10.0.0.3"
                  required
                />
                <div className="text-xs text-slate-400 mt-1">Comma-separated list of Ceph monitor addresses</div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Ceph Pool Name</label>
                <input
                  type="text"
                  value={cephPoolName}
                  onChange={(e) => setCephPoolName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700/50 rounded px-4 py-2 font-mono"
                  placeholder="rbd"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">User (optional)</label>
                <input
                  type="text"
                  value={cephUser}
                  onChange={(e) => setCephUser(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700/50 rounded px-4 py-2 font-mono"
                  placeholder="admin"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Keyring Path (optional)</label>
                <input
                  type="text"
                  value={cephKeyring}
                  onChange={(e) => setCephKeyring(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700/50 rounded px-4 py-2 font-mono"
                  placeholder="/etc/ceph/ceph.client.admin.keyring"
                />
              </div>
            </>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">NFS Server</label>
                <input
                  type="text"
                  value={nfsServer}
                  onChange={(e) => setNfsServer(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700/50 rounded px-4 py-2"
                  placeholder="192.168.1.100"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Export Path</label>
                <input
                  type="text"
                  value={nfsExportPath}
                  onChange={(e) => setNfsExportPath(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700/50 rounded px-4 py-2 font-mono"
                  placeholder="/export/vm-storage"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Mount Path</label>
                <input
                  type="text"
                  value={nfsMountPath}
                  onChange={(e) => setNfsMountPath(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700/50 rounded px-4 py-2 font-mono"
                  placeholder="/mnt/nfs-pool"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">NFS Version</label>
                <select
                  value={nfsVersion}
                  onChange={(e) => setNfsVersion(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700/50 rounded px-4 py-2"
                >
                  <option value="V3">NFSv3</option>
                  <option value="V4">NFSv4</option>
                  <option value="V4_1">NFSv4.1</option>
                  <option value="V4_2">NFSv4.2</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Mount Options</label>
                <input
                  type="text"
                  value={mountOptions}
                  onChange={(e) => setMountOptions(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700/50 rounded px-4 py-2 font-mono text-sm"
                  placeholder="rw,hard,intr,rsize=8192,wsize=8192"
                />
                <div className="text-xs text-slate-400 mt-1">
                  Comma-separated mount options
                </div>
              </div>
            </>
          )}

          <div className="mb-6">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoStart}
                onChange={(e) => setAutoStart(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Auto-start pool on daemon startup</span>
            </label>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition"
            >
              Create Pool
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
