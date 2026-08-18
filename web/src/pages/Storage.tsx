// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { HardDrive, Trash2, RefreshCw, Database, Plus, Link2, Link2Off, Maximize2 } from 'lucide-react'
import { apiGet } from '../api/client'
import { listVolumes, createVolume, deleteVolume, resizeVolume, attachVolume, detachVolume, type Volume } from '../api/volumes'
import { useToastContext } from '../contexts/ToastContext'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import ErrorBanner from '../components/ErrorBanner'
import { formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import SubsystemBanner from '../components/SubsystemBanner'

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

interface VolumeRow extends Volume {
  pool: string
}

export default function Storage() {
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const [pools, setPools] = useState<StoragePool[]>([])
  const [volumes, setVolumes] = useState<VolumeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showCreateVolume, setShowCreateVolume] = useState<string | null>(null)
  const [attachTarget, setAttachTarget] = useState<VolumeRow | null>(null)
  const [resizeTarget, setResizeTarget] = useState<VolumeRow | null>(null)
  const [busyVolume, setBusyVolume] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoadError(null)
    try {
      const poolData = await apiGet<StoragePool[]>('/api/storage/pools').catch(() => [])
      setPools(poolData)

      // Load volumes for each pool
      const allVolumes: VolumeRow[] = []
      for (const pool of poolData) {
        try {
          const vols = await listVolumes(pool.name)
          allVolumes.push(...vols.map(v => ({ ...v, pool: pool.name })))
        } catch {
          // Pool may not support volume listing
        }
      }
      setVolumes(allVolumes)
    } catch (error) {
      const msg = formatUserError(error)
      setLoadError(msg)
      toastFailure(toast, 'Failed to load storage', error)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDeleteVolume = async (pool: string, volumeId: string) => {
    if (!await confirm('Delete Volume Record', 'Delete this volume record? This only removes the tracking entry, not any real disk image.', { variant: 'danger', confirmLabel: 'Delete' })) return
    try {
      await deleteVolume(pool, volumeId)
      toast.success('Volume record deleted')
      await loadData()
    } catch (error) {
      toastFailure(toast, 'Failed to delete volume', error)
    }
  }

  const handleDetach = async (v: VolumeRow) => {
    setBusyVolume(v.id)
    try {
      await detachVolume(v.pool, v.id)
      toast.success(`Detached '${v.name}'`)
      await loadData()
    } catch (error) {
      toastFailure(toast, 'Failed to detach volume', error)
    } finally {
      setBusyVolume(null)
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


  if (loading) {
    return <div className="text-center text-slate-400 py-12">Loading storage data...</div>
  }

  const totalCapacity = pools.reduce((sum, p) => sum + p.capacity, 0)
  const totalAvailable = pools.reduce((sum, p) => sum + p.available, 0)
  const totalUsed = totalCapacity - totalAvailable

  return (
    <div className="space-y-6">
      <SubsystemBanner subsystem="storage" title="Storage subsystem" />
      {loadError && (
        <ErrorBanner
          title="Could not load storage"
          headline={loadError}
          hints={hintsForError(loadError, 'storage')}
          onRetry={loadData}
        />
      )}
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
        <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
          <div className="text-slate-400 text-sm mb-2">Total Capacity</div>
          <div className="text-2xl font-bold text-blue-400">{formatBytes(totalCapacity)}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
          <div className="text-slate-400 text-sm mb-2">Used</div>
          <div className="text-2xl font-bold text-orange-400">{formatBytes(totalUsed)}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
          <div className="text-slate-400 text-sm mb-2">Volumes</div>
          <div className="text-2xl font-bold text-green-400">{volumes.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
          <div className="text-slate-400 text-sm mb-2">Pools</div>
          <div className="text-2xl font-bold text-purple-400">{pools.length}</div>
        </div>
      </div>

      {/* Storage Pools */}
      <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
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
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Database className="w-5 h-5 text-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-lg truncate">{pool.name}</div>
                        <div className="text-sm text-slate-400 font-mono truncate">{pool.path}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getTypeColor(typeStr)}`}>
                        {typeStr.toUpperCase()}
                      </span>
                      <span className={`text-sm font-medium ${pool.state === 'Active' ? 'text-green-400' : 'text-slate-400'}`}>
                        {pool.state}
                      </span>
                      <button onClick={() => setShowCreateVolume(pool.name)} className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded text-xs font-medium">
                        <Plus className="w-3.5 h-3.5" /> Add Volume Record
                      </button>
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
      <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
        <div className="p-6 border-b border-slate-700/50">
          <h2 className="text-xl font-semibold">Volumes</h2>
          <p className="text-xs text-slate-500 mt-1">
            A manual tracking ledger — records here don't create or resize real disk images. Use them to track volumes you've provisioned elsewhere.
          </p>
        </div>
        {volumes.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No volume records.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">Name</th>
                  <th className="text-left p-4 font-medium text-slate-300">Pool</th>
                  <th className="text-left p-4 font-medium text-slate-300">Size</th>
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
                    <td className="p-4"><span className="font-mono text-sm">{volume.size}</span></td>
                    <td className="p-4">
                      {volume.vm_attached ? (
                        <span className="text-blue-400">{volume.vm_attached}</span>
                      ) : (
                        <span className="text-slate-500 italic">Not attached</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setResizeTarget(volume)} className="p-2 hover:bg-white/[0.06] rounded transition" title="Resize record">
                          <Maximize2 className="w-4 h-4" />
                        </button>
                        {volume.vm_attached ? (
                          <button onClick={() => void handleDetach(volume)} disabled={busyVolume === volume.id} className="p-2 hover:bg-white/[0.06] rounded transition disabled:opacity-50" title="Detach">
                            <Link2Off className="w-4 h-4" />
                          </button>
                        ) : (
                          <button onClick={() => setAttachTarget(volume)} className="p-2 hover:bg-white/[0.06] rounded transition" title="Attach to VM">
                            <Link2 className="w-4 h-4" />
                          </button>
                        )}
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

      {showCreateVolume && (
        <CreateVolumeModal pool={showCreateVolume} onClose={() => setShowCreateVolume(null)} onCreated={() => { setShowCreateVolume(null); void loadData() }} />
      )}
      {attachTarget && (
        <AttachVolumeModal volume={attachTarget} onClose={() => setAttachTarget(null)} onAttached={() => { setAttachTarget(null); void loadData() }} />
      )}
      {resizeTarget && (
        <ResizeVolumeModal volume={resizeTarget} onClose={() => setResizeTarget(null)} onResized={() => { setResizeTarget(null); void loadData() }} />
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

function CreateVolumeModal({ pool, onClose, onCreated }: { pool: string; onClose: () => void; onCreated: () => void }) {
  const toast = useToastContext()
  const [name, setName] = useState('')
  const [size, setSize] = useState('')
  const [creating, setCreating] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Name is required'); return }
    if (!size.trim()) { toast.error('Size is required'); return }
    setCreating(true)
    try {
      await createVolume(pool, { name: name.trim(), size: size.trim() })
      toast.success(`Volume record '${name}' created`)
      onCreated()
    } catch (err) {
      toastFailure(toast, 'Failed to create volume record', err)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-1">Add Volume Record</h2>
        <p className="text-sm text-slate-400 mb-4">Pool: {pool}</p>
        <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-4">
          This creates a tracking record only — it does not provision a real disk image.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" placeholder="my-volume" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Size</label>
            <input value={size} onChange={e => setSize(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" placeholder="20GB" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">Cancel</button>
            <button type="submit" disabled={creating} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50">{creating ? 'Creating…' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AttachVolumeModal({ volume, onClose, onAttached }: { volume: VolumeRow; onClose: () => void; onAttached: () => void }) {
  const toast = useToastContext()
  const [vmName, setVmName] = useState('')
  const [attaching, setAttaching] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vmName.trim()) { toast.error('VM name is required'); return }
    setAttaching(true)
    try {
      await attachVolume(volume.pool, volume.id, { vm_name: vmName.trim() })
      toast.success(`Marked '${volume.name}' attached to '${vmName.trim()}'`)
      onAttached()
    } catch (err) {
      toastFailure(toast, 'Failed to attach volume', err)
    } finally {
      setAttaching(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-1">Attach Volume</h2>
        <p className="text-sm text-slate-400 mb-4">{volume.name} ({volume.pool})</p>
        <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-4">
          This only updates the tracking record — it does not attach a real disk to the VM's configuration.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">VM Name</label>
            <input value={vmName} onChange={e => setVmName(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" placeholder="my-vm" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">Cancel</button>
            <button type="submit" disabled={attaching} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50">{attaching ? 'Attaching…' : 'Attach'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ResizeVolumeModal({ volume, onClose, onResized }: { volume: VolumeRow; onClose: () => void; onResized: () => void }) {
  const toast = useToastContext()
  const [size, setSize] = useState(volume.size)
  const [resizing, setResizing] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!size.trim()) { toast.error('Size is required'); return }
    setResizing(true)
    try {
      await resizeVolume(volume.pool, volume.id, { size: size.trim() })
      toast.success(`Volume record '${volume.name}' resized`)
      onResized()
    } catch (err) {
      toastFailure(toast, 'Failed to resize volume record', err)
    } finally {
      setResizing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-1">Resize Volume Record</h2>
        <p className="text-sm text-slate-400 mb-4">{volume.name} ({volume.pool})</p>
        <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-4">
          This only updates the tracking record — it does not resize a real disk image.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">New Size</label>
            <input value={size} onChange={e => setSize(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" placeholder="40GB" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">Cancel</button>
            <button type="submit" disabled={resizing} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50">{resizing ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
