import { useState, useEffect, useCallback } from 'react'
import { HardDrive, Plus, Trash2, Copy, RefreshCw, Database } from 'lucide-react'
import { apiGet, apiDelete } from '../api/client'

interface StoragePool {
  id: string
  name: string
  pool_type: unknown
  path: string
  capacity: number
  available: number
  state: string
  auto_start: boolean
  created: string
  updated: string
}

interface Volume {
  id: string
  name: string
  pool: string
  size: number
  format: string
  vm: string | null
  snapshots: number
}

export default function Storage() {
  const [pools, setPools] = useState<StoragePool[]>([])
  const [volumes, setVolumes] = useState<Volume[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      const poolData = await apiGet<StoragePool[]>('/api/storage/pools').catch(() => [])
      setPools(poolData)

      // Load volumes for each pool
      const allVolumes: Volume[] = []
      for (const pool of poolData) {
        try {
          const vols = await apiGet<Volume[]>(`/api/storage/pools/${pool.name}/volumes`)
          allVolumes.push(...vols.map(v => ({ ...v, pool: pool.name })))
        } catch {
          // Pool may not support volume listing
        }
      }
      setVolumes(allVolumes)
    } catch (error) {
      console.error('Failed to load storage data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDeleteVolume = async (pool: string, volumeId: string) => {
    if (!confirm('Delete this volume?')) return
    try {
      await apiDelete(`/api/storage/pools/${pool}/volumes/${volumeId}`)
      await loadData()
    } catch (error) {
      alert(`Failed to delete volume: ${error}`)
    }
  }

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`
    if (gb >= 1) return `${gb.toFixed(1)} GB`
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(0)} MB`
  }

  const getPoolTypeString = (pt: unknown): string => {
    if (typeof pt === 'string') return pt
    if (typeof pt === 'object' && pt !== null) {
      const obj = pt as Record<string, unknown>
      if ('Ceph' in obj) return 'Ceph'
      if ('NFS' in obj) return 'NFS'
      if ('ZFS' in obj) return 'ZFS'
      if ('LVM' in obj) return 'LVM'
      if ('LVMThin' in obj) return 'LVM-thin'
    }
    return 'Unknown'
  }

  const getUsageColor = (percentage: number) => {
    if (percentage < 50) return 'bg-green-500'
    if (percentage < 80) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'local': case 'directory': return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
      case 'lvm': case 'lvm-thin': return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
      case 'zfs': return 'bg-green-500/10 text-green-400 border-green-500/20'
      case 'nfs': return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
      case 'ceph': return 'bg-red-500/10 text-red-400 border-red-500/20'
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
  }

  const getFormatColor = (format: string) => {
    switch (format) {
      case 'qcow2': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
      case 'raw': return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
      case 'vmdk': return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
  }

  if (loading) {
    return <div className="text-center text-slate-400 py-12">Loading storage data...</div>
  }

  const totalCapacity = pools.reduce((sum, p) => sum + p.capacity, 0)
  const totalAvailable = pools.reduce((sum, p) => sum + p.available, 0)
  const totalUsed = totalCapacity - totalAvailable

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <HardDrive className="w-8 h-8" />
          Storage Management
        </h1>
        <button onClick={loadData} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Storage Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 rounded-lg p-6 border border-slate-700/50">
          <div className="text-slate-400 text-sm mb-2">Total Capacity</div>
          <div className="text-2xl font-bold text-blue-400">{formatBytes(totalCapacity)}</div>
        </div>
        <div className="bg-slate-900 rounded-lg p-6 border border-slate-700/50">
          <div className="text-slate-400 text-sm mb-2">Used</div>
          <div className="text-2xl font-bold text-orange-400">{formatBytes(totalUsed)}</div>
        </div>
        <div className="bg-slate-900 rounded-lg p-6 border border-slate-700/50">
          <div className="text-slate-400 text-sm mb-2">Volumes</div>
          <div className="text-2xl font-bold text-green-400">{volumes.length}</div>
        </div>
        <div className="bg-slate-900 rounded-lg p-6 border border-slate-700/50">
          <div className="text-slate-400 text-sm mb-2">Pools</div>
          <div className="text-2xl font-bold text-purple-400">{pools.length}</div>
        </div>
      </div>

      {/* Storage Pools */}
      <div className="bg-slate-900 rounded-lg border border-slate-700/50">
        <div className="p-6 border-b border-slate-700/50">
          <h2 className="text-xl font-semibold">Storage Pools</h2>
        </div>
        {pools.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No storage pools configured. Create one from the Storage Pools page.</div>
        ) : (
          <div className="p-6 space-y-4">
            {pools.map((pool) => {
              const used = pool.capacity - pool.available
              const percentage = pool.capacity > 0 ? Math.round((used / pool.capacity) * 100) : 0
              const typeStr = getPoolTypeString(pool.pool_type)
              return (
                <div key={pool.id} className="bg-slate-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Database className="w-5 h-5 text-blue-400" />
                      <div>
                        <div className="font-medium text-lg">{pool.name}</div>
                        <div className="text-sm text-slate-400 font-mono">{pool.path}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getTypeColor(typeStr)}`}>
                        {typeStr.toUpperCase()}
                      </span>
                      <span className={`text-sm font-medium ${pool.state === 'Active' ? 'text-green-400' : 'text-slate-400'}`}>
                        {pool.state}
                      </span>
                    </div>
                  </div>
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-slate-400">{formatBytes(used)} / {formatBytes(pool.capacity)}</span>
                      <span className={`font-bold ${percentage > 80 ? 'text-red-400' : percentage > 50 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {percentage}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-600 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${getUsageColor(percentage)}`}
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Volumes */}
      <div className="bg-slate-900 rounded-lg border border-slate-700/50">
        <div className="p-6 border-b border-slate-700/50">
          <h2 className="text-xl font-semibold">Volumes</h2>
        </div>
        {volumes.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No volumes found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">Name</th>
                  <th className="text-left p-4 font-medium text-slate-300">Pool</th>
                  <th className="text-left p-4 font-medium text-slate-300">Size</th>
                  <th className="text-left p-4 font-medium text-slate-300">Format</th>
                  <th className="text-left p-4 font-medium text-slate-300">Attached To</th>
                  <th className="text-left p-4 font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {volumes.map((volume) => (
                  <tr key={volume.id} className="hover:bg-white/[0.03] transition">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-slate-400" />
                        <span className="font-mono text-sm">{volume.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-slate-400">{volume.pool}</td>
                    <td className="p-4"><span className="font-mono text-sm">{formatBytes(volume.size)}</span></td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getFormatColor(volume.format)}`}>
                        {volume.format.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4">
                      {volume.vm ? (
                        <span className="text-blue-400">{volume.vm}</span>
                      ) : (
                        <span className="text-slate-500 italic">Not attached</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button className="p-2 hover:bg-slate-600 rounded transition" title="Clone">
                          <Copy className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteVolume(volume.pool, volume.id)} className="p-2 hover:bg-red-600 rounded transition" title="Delete">
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
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-slate-900 rounded-lg p-6 border border-slate-700/50 hover:border-blue-500 transition cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <Plus className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="font-semibold">Create Volume</h3>
          </div>
          <p className="text-sm text-slate-400">Create a new disk image for VMs</p>
        </div>

        <div className="bg-slate-900 rounded-lg p-6 border border-slate-700/50 hover:border-purple-500 transition cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-purple-500/10 rounded-lg">
              <RefreshCw className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="font-semibold">Create Snapshot</h3>
          </div>
          <p className="text-sm text-slate-400">Take a snapshot of existing volume</p>
        </div>

        <div className="bg-slate-900 rounded-lg p-6 border border-slate-700/50 hover:border-green-500 transition cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-green-500/10 rounded-lg">
              <Copy className="w-6 h-6 text-green-400" />
            </div>
            <h3 className="font-semibold">Clone Volume</h3>
          </div>
          <p className="text-sm text-slate-400">Clone an existing disk image</p>
        </div>
      </div>
    </div>
  )
}
