import { useEffect, useState } from 'react'
import { HardDrive, Plus, Trash2, Copy, RefreshCw, Database } from 'lucide-react'

interface StoragePool {
  name: string
  path: string
  capacity: number
  used: number
  volumes: number
  snapshots: number
  type: 'dir' | 'lvm' | 'zfs'
}

interface Volume {
  name: string
  pool: string
  size: number
  format: 'qcow2' | 'raw' | 'vmdk'
  vm: string | null
  snapshots: number
}

export default function Storage() {
  const [pools, setPools] = useState<StoragePool[]>([
    {
      name: 'default',
      path: '/var/lib/vmspawnd/images',
      capacity: 500,
      used: 245,
      volumes: 12,
      snapshots: 5,
      type: 'dir',
    },
    {
      name: 'ssd-pool',
      path: '/mnt/ssd/vms',
      capacity: 1000,
      used: 680,
      volumes: 8,
      snapshots: 3,
      type: 'dir',
    },
  ])

  const [volumes, setVolumes] = useState<Volume[]>([
    { name: 'web-01.qcow2', pool: 'default', size: 20, format: 'qcow2', vm: 'web-01', snapshots: 2 },
    { name: 'db-01.qcow2', pool: 'default', size: 50, format: 'qcow2', vm: 'db-01', snapshots: 1 },
    { name: 'test-vm.qcow2', pool: 'ssd-pool', size: 30, format: 'qcow2', vm: 'test-vm', snapshots: 0 },
    { name: 'backup.raw', pool: 'default', size: 100, format: 'raw', vm: null, snapshots: 0 },
  ])

  const getUsageColor = (percentage: number) => {
    if (percentage < 50) return 'bg-green-500'
    if (percentage < 80) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'dir': return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
      case 'lvm': return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
      case 'zfs': return 'bg-green-500/10 text-green-400 border-green-500/20'
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20'
    }
  }

  const getFormatColor = (format: string) => {
    switch (format) {
      case 'qcow2': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
      case 'raw': return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
      case 'vmdk': return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20'
    }
  }

  const calculatePercentage = (used: number, capacity: number) => {
    return Math.round((used / capacity) * 100)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <HardDrive className="w-8 h-8" />
          Storage Management
        </h1>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg transition">
            <Plus className="w-4 h-4" />
            Create Pool
          </button>
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition">
            <Plus className="w-4 h-4" />
            Create Volume
          </button>
        </div>
      </div>

      {/* Storage Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-2">Total Capacity</div>
          <div className="text-3xl font-bold text-blue-400">
            {pools.reduce((acc, p) => acc + p.capacity, 0)} GB
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-2">Used</div>
          <div className="text-3xl font-bold text-orange-400">
            {pools.reduce((acc, p) => acc + p.used, 0)} GB
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-2">Volumes</div>
          <div className="text-3xl font-bold text-green-400">{volumes.length}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-2">Snapshots</div>
          <div className="text-3xl font-bold text-purple-400">
            {pools.reduce((acc, p) => acc + p.snapshots, 0)}
          </div>
        </div>
      </div>

      {/* Storage Pools */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold">Storage Pools</h2>
        </div>
        <div className="p-6 space-y-4">
          {pools.map((pool) => {
            const percentage = calculatePercentage(pool.used, pool.capacity)
            return (
              <div key={pool.name} className="bg-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Database className="w-5 h-5 text-blue-400" />
                    <div>
                      <div className="font-medium text-lg">{pool.name}</div>
                      <div className="text-sm text-gray-400 font-mono">{pool.path}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getTypeColor(pool.type)}`}>
                      {pool.type.toUpperCase()}
                    </span>
                    <div className="text-right">
                      <div className="text-sm text-gray-400">Volumes</div>
                      <div className="font-bold text-blue-400">{pool.volumes}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-400">Snapshots</div>
                      <div className="font-bold text-purple-400">{pool.snapshots}</div>
                    </div>
                  </div>
                </div>

                <div className="mb-2">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-400">
                      {pool.used} GB / {pool.capacity} GB
                    </span>
                    <span className={`font-bold ${percentage > 80 ? 'text-red-400' : percentage > 50 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {percentage}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-600 rounded-full h-2">
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
      </div>

      {/* Volumes */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold">Volumes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4 font-medium text-gray-300">Name</th>
                <th className="text-left p-4 font-medium text-gray-300">Pool</th>
                <th className="text-left p-4 font-medium text-gray-300">Size</th>
                <th className="text-left p-4 font-medium text-gray-300">Format</th>
                <th className="text-left p-4 font-medium text-gray-300">Attached To</th>
                <th className="text-left p-4 font-medium text-gray-300">Snapshots</th>
                <th className="text-left p-4 font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {volumes.map((volume) => (
                <tr key={volume.name} className="hover:bg-gray-700 transition">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-gray-400" />
                      <span className="font-mono text-sm">{volume.name}</span>
                    </div>
                  </td>
                  <td className="p-4 text-gray-400">
                    {volume.pool}
                  </td>
                  <td className="p-4">
                    <span className="font-mono text-sm">{volume.size} GB</span>
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getFormatColor(volume.format)}`}>
                      {volume.format.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4">
                    {volume.vm ? (
                      <span className="text-blue-400">{volume.vm}</span>
                    ) : (
                      <span className="text-gray-500 italic">Not attached</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span className="text-purple-400">{volume.snapshots}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button className="p-2 hover:bg-gray-600 rounded transition" title="Clone">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button className="p-2 hover:bg-blue-600 rounded transition" title="Snapshot">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button className="p-2 hover:bg-red-600 rounded transition" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-blue-500 transition cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <Plus className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="font-semibold">Create Volume</h3>
          </div>
          <p className="text-sm text-gray-400">Create a new disk image for VMs</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-purple-500 transition cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-purple-500/10 rounded-lg">
              <RefreshCw className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="font-semibold">Create Snapshot</h3>
          </div>
          <p className="text-sm text-gray-400">Take a snapshot of existing volume</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-green-500 transition cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-green-500/10 rounded-lg">
              <Copy className="w-6 h-6 text-green-400" />
            </div>
            <h3 className="font-semibold">Clone Volume</h3>
          </div>
          <p className="text-sm text-gray-400">Clone an existing disk image</p>
        </div>
      </div>
    </div>
  )
}
