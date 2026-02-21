import { useState, useEffect } from 'react'
import { HardDrive, Plus, Play, Square, Trash2, RefreshCw, Server, Folder, AlertCircle, CheckCircle } from 'lucide-react'
import {
  listStoragePools,
  createNfsPool,
  createLocalPool,
  deleteStoragePool,
  startStoragePool,
  stopStoragePool,
  refreshPoolStats,
  getNfsHealth,
  type StoragePool,
  type NfsHealth,
} from '../api/storage'

export default function StoragePools() {
  const [pools, setPools] = useState<StoragePool[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [nfsHealth, setNfsHealth] = useState<Map<string, NfsHealth>>(new Map())

  useEffect(() => {
    loadPools()
  }, [])

  const loadPools = async () => {
    try {
      const data = await listStoragePools()
      setPools(data)

      // Load NFS health for NFS pools
      for (const pool of data) {
        if (typeof pool.pool_type === 'object' && 'NFS' in pool.pool_type) {
          try {
            const health = await getNfsHealth(pool.name)
            setNfsHealth((prev) => new Map(prev).set(pool.name, health))
          } catch (error) {
            console.error(`Failed to get NFS health for ${pool.name}:`, error)
          }
        }
      }
    } catch (error) {
      console.error('Failed to load storage pools:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStart = async (name: string) => {
    try {
      await startStoragePool(name)
      await loadPools()
    } catch (error) {
      console.error('Failed to start pool:', error)
      alert(`Failed to start pool: ${error}`)
    }
  }

  const handleStop = async (name: string) => {
    try {
      await stopStoragePool(name)
      await loadPools()
    } catch (error) {
      console.error('Failed to stop pool:', error)
      alert(`Failed to stop pool: ${error}`)
    }
  }

  const handleDelete = async (name: string) => {
    if (!confirm(`Are you sure you want to delete storage pool "${name}"?`)) {
      return
    }

    try {
      await deleteStoragePool(name)
      await loadPools()
    } catch (error) {
      console.error('Failed to delete pool:', error)
      alert(`Failed to delete pool: ${error}`)
    }
  }

  const handleRefresh = async (name: string) => {
    try {
      await refreshPoolStats(name)
      await loadPools()
    } catch (error) {
      console.error('Failed to refresh pool stats:', error)
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
    }
    return 'Unknown'
  }

  const getStateColor = (state: string) => {
    switch (state) {
      case 'Active':
        return 'text-green-500'
      case 'Inactive':
        return 'text-gray-500'
      case 'Starting':
      case 'Stopping':
        return 'text-yellow-500'
      case 'Degraded':
        return 'text-orange-500'
      case 'Failed':
        return 'text-red-500'
      default:
        return 'text-gray-500'
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Storage Pools</h1>
          <p className="text-gray-400">Manage local and network storage pools</p>
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
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="text-gray-400 text-sm mb-2">Total Pools</div>
          <div className="text-3xl font-bold">{pools.length}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="text-gray-400 text-sm mb-2">Active Pools</div>
          <div className="text-3xl font-bold text-green-500">
            {pools.filter((p) => p.state === 'Active').length}
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="text-gray-400 text-sm mb-2">Total Capacity</div>
          <div className="text-3xl font-bold">
            {formatBytes(pools.reduce((sum, p) => sum + p.capacity, 0))}
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="text-gray-400 text-sm mb-2">Available</div>
          <div className="text-3xl font-bold">
            {formatBytes(pools.reduce((sum, p) => sum + p.available, 0))}
          </div>
        </div>
      </div>

      {/* Pools List */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-750">
            <tr className="text-left text-gray-400 text-sm">
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
                <td colSpan={9} className="p-8 text-center text-gray-400">
                  No storage pools configured. Create one to get started.
                </td>
              </tr>
            ) : (
              pools.map((pool) => {
                const usagePercent =
                  pool.capacity > 0 ? ((pool.capacity - pool.available) / pool.capacity) * 100 : 0

                return (
                  <tr key={pool.id} className="border-t border-gray-700 hover:bg-gray-750">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {typeof pool.pool_type === 'object' && 'NFS' in pool.pool_type ? (
                          <Server className="w-4 h-4 text-blue-400" />
                        ) : (
                          <Folder className="w-4 h-4 text-gray-400" />
                        )}
                        <span className="font-medium">{pool.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-gray-400">{getPoolTypeDisplay(pool)}</td>
                    <td className="p-4 text-sm text-gray-400 font-mono">{pool.path}</td>
                    <td className="p-4 text-sm">{formatBytes(pool.capacity)}</td>
                    <td className="p-4 text-sm">{formatBytes(pool.available)}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
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
                        <span className="text-sm text-gray-400 w-12 text-right">
                          {usagePercent.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`text-sm font-medium ${getStateColor(pool.state)}`}>
                        {pool.state}
                      </span>
                    </td>
                    <td className="p-4">{getHealthIcon(nfsHealth.get(pool.name))}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {pool.state === 'Inactive' ? (
                          <button
                            onClick={() => handleStart(pool.name)}
                            className="p-2 hover:bg-gray-700 rounded transition"
                            title="Start pool"
                          >
                            <Play className="w-4 h-4 text-green-500" />
                          </button>
                        ) : pool.state === 'Active' ? (
                          <button
                            onClick={() => handleStop(pool.name)}
                            className="p-2 hover:bg-gray-700 rounded transition"
                            title="Stop pool"
                          >
                            <Square className="w-4 h-4 text-yellow-500" />
                          </button>
                        ) : null}
                        <button
                          onClick={() => handleRefresh(pool.name)}
                          className="p-2 hover:bg-gray-700 rounded transition"
                          title="Refresh stats"
                        >
                          <RefreshCw className="w-4 h-4 text-blue-500" />
                        </button>
                        <button
                          onClick={() => handleDelete(pool.name)}
                          className="p-2 hover:bg-gray-700 rounded transition"
                          title="Delete pool"
                          disabled={pool.state === 'Active'}
                        >
                          <Trash2
                            className={`w-4 h-4 ${
                              pool.state === 'Active' ? 'text-gray-600' : 'text-red-500'
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
    </div>
  )
}

interface CreatePoolDialogProps {
  onClose: () => void
  onCreated: () => void
}

function CreatePoolDialog({ onClose, onCreated }: CreatePoolDialogProps) {
  const [poolType, setPoolType] = useState<'local' | 'nfs' | 'lvm' | 'lvm-thin' | 'zfs'>('local')
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
      }

      onCreated()
      onClose()
    } catch (error) {
      console.error('Failed to create pool:', error)
      alert(`Failed to create pool: ${error}`)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl">
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
              ]).map(({ key, label, desc, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPoolType(key)}
                  className={`p-3 rounded border-2 transition text-center ${
                    poolType === key
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <Icon className="w-5 h-5 mx-auto mb-1" />
                  <div className="font-medium text-sm">{label}</div>
                  <div className="text-xs text-gray-400">{desc}</div>
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
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2"
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
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 font-mono"
                placeholder="/var/lib/vmspawnd/storage"
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
                  className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 font-mono"
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
                    className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 font-mono"
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
                  className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 font-mono"
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
                  className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 font-mono"
                  placeholder="vms"
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
                  className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2"
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
                  className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 font-mono"
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
                  className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 font-mono"
                  placeholder="/mnt/nfs-pool"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">NFS Version</label>
                <select
                  value={nfsVersion}
                  onChange={(e) => setNfsVersion(e.target.value as any)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2"
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
                  className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 font-mono text-sm"
                  placeholder="rw,hard,intr,rsize=8192,wsize=8192"
                />
                <div className="text-xs text-gray-400 mt-1">
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
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition"
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
