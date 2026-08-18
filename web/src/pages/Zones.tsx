// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { Globe, Zap, Plus, Trash2, PowerOff } from 'lucide-react'
import {
  listZones,
  createZone,
  deleteZone,
  listSpotInstances,
  createSpotInstance,
  deleteSpotInstance,
  evictSpotInstance,
  type AvailabilityZone,
  type SpotInstance,
} from '../api/zones'
import { useToastContext } from '../contexts/ToastContext'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import PageLoadBanner from '../components/PageLoadBanner'
import { usePageLoader } from '../hooks/usePageLoader'
import { toastFailure } from '../utils/toastError'

const statusColor: Record<AvailabilityZone['status'], string> = {
  available: 'bg-green-500/10 text-green-400 border-green-500/20',
  degraded: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  unavailable: 'bg-red-500/10 text-red-400 border-red-500/20',
}

const spotStatusColor: Record<SpotInstance['status'], string> = {
  running: 'bg-green-500/10 text-green-400 border-green-500/20',
  evicted: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  terminated: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
}

export default function Zones() {
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const [zones, setZones] = useState<AvailabilityZone[]>([])
  const [spots, setSpots] = useState<SpotInstance[]>([])
  const { loading, loadError, run } = usePageLoader('Failed to load availability zones')
  const [tab, setTab] = useState<'zones' | 'spot'>('zones')
  const [showCreateZone, setShowCreateZone] = useState(false)
  const [showCreateSpot, setShowCreateSpot] = useState(false)

  const loadData = useCallback(() => {
    return run(async () => {
      const [z, s] = await Promise.all([listZones(), listSpotInstances()])
      setZones(z)
      setSpots(s)
    })
  }, [run])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleDeleteZone = async (id: string, name: string) => {
    if (!await confirm('Delete Availability Zone', `Delete zone '${name}'?`, { variant: 'danger', confirmLabel: 'Delete' })) return
    try {
      await deleteZone(id)
      toast.success('Zone deleted')
      loadData()
    } catch (err) {
      toastFailure(toast, 'Failed to delete zone', err)
    }
  }

  const handleEvict = async (spot: SpotInstance) => {
    if (!await confirm('Evict Spot Instance', `Evict '${spot.vm_name}'? Its eviction policy (${spot.eviction_policy}) will be applied to the VM immediately.`, { variant: 'danger', confirmLabel: 'Evict' })) return
    try {
      await evictSpotInstance(spot.id)
      toast.success(`'${spot.vm_name}' evicted`)
      loadData()
    } catch (err) {
      toastFailure(toast, 'Failed to evict spot instance', err)
    }
  }

  const handleDeleteSpot = async (spot: SpotInstance) => {
    if (!await confirm('Delete Spot Instance Record', `Delete the spot instance record for '${spot.vm_name}'?`, { variant: 'danger', confirmLabel: 'Delete' })) return
    try {
      await deleteSpotInstance(spot.id)
      toast.success('Spot instance record deleted')
      loadData()
    } catch (err) {
      toastFailure(toast, 'Failed to delete spot instance', err)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Globe className="w-7 h-7" />
          Availability Zones
        </h1>
      </div>

      <PageLoadBanner title="Could not load availability zones" headline={loadError} onRetry={() => void loadData()} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-sm mb-1">Zones</div>
          <div className="text-2xl font-bold">{zones.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-sm mb-1">Running Spot Instances</div>
          <div className="text-2xl font-bold text-green-400">{spots.filter(s => s.status === 'running').length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-sm mb-1">Evicted</div>
          <div className="text-2xl font-bold text-amber-400">{spots.filter(s => s.status === 'evicted').length}</div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-700/50">
        <button onClick={() => setTab('zones')} className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab === 'zones' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>Zones</button>
        <button onClick={() => setTab('spot')} className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab === 'spot' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>Spot Instances</button>
      </div>

      {tab === 'zones' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateZone(true)} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Zone
            </button>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
            <table className="min-w-full divide-y divide-slate-700/50">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase">
                  <th className="p-4">Name</th>
                  <th className="p-4">Region</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Hosts</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {loading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-400">Loading…</td></tr>
                ) : zones.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-400">No availability zones.</td></tr>
                ) : zones.map(z => (
                  <tr key={z.id} className="hover:bg-slate-900">
                    <td className="p-4">
                      <div className="font-medium">{z.name}</div>
                      {z.description && <div className="text-xs text-slate-400">{z.description}</div>}
                    </td>
                    <td className="p-4 text-sm text-slate-400">{z.region}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${statusColor[z.status]}`}>{z.status}</span>
                    </td>
                    <td className="p-4 text-sm">{z.hosts.length}</td>
                    <td className="p-4">
                      <button onClick={() => handleDeleteZone(z.id, z.name)} className="text-red-600 hover:text-red-800">
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

      {tab === 'spot' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateSpot(true)} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Request Spot Instance
            </button>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
            <table className="min-w-full divide-y divide-slate-700/50">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase">
                  <th className="p-4">VM</th>
                  <th className="p-4">Max Price/hr</th>
                  <th className="p-4">Priority</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Eviction Policy</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {loading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-400">Loading…</td></tr>
                ) : spots.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-400">No spot instances.</td></tr>
                ) : spots.map(s => (
                  <tr key={s.id} className="hover:bg-slate-900">
                    <td className="p-4 font-medium">{s.vm_name}</td>
                    <td className="p-4 text-sm font-mono">${s.max_price_per_hour.toFixed(2)}</td>
                    <td className="p-4 text-sm capitalize">{s.priority}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${spotStatusColor[s.status]}`}>{s.status}</span>
                    </td>
                    <td className="p-4 text-sm capitalize">{s.eviction_policy}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {s.status === 'running' && (
                          <button onClick={() => void handleEvict(s)} className="text-amber-500 hover:text-amber-400" title="Evict">
                            <PowerOff className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => void handleDeleteSpot(s)} className="text-red-600 hover:text-red-800" title="Delete record">
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
      )}

      {showCreateZone && (
        <CreateZoneModal onClose={() => setShowCreateZone(false)} onCreated={() => { setShowCreateZone(false); loadData() }} />
      )}
      {showCreateSpot && (
        <CreateSpotModal onClose={() => setShowCreateSpot(false)} onCreated={() => { setShowCreateSpot(false); loadData() }} zones={zones} />
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

function CreateZoneModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToastContext()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [region, setRegion] = useState('')
  const [creating, setCreating] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Name is required'); return }
    setCreating(true)
    try {
      await createZone({ name: name.trim(), description: description || undefined, region: region || undefined })
      toast.success(`Zone '${name}' created`)
      onCreated()
    } catch (err) {
      toastFailure(toast, 'Failed to create zone', err)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create Availability Zone</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" placeholder="us-east-1a" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Region</label>
            <input value={region} onChange={e => setRegion(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" placeholder="default" />
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

function CreateSpotModal({ onClose, onCreated, zones }: { onClose: () => void; onCreated: () => void; zones: AvailabilityZone[] }) {
  const toast = useToastContext()
  const [vmName, setVmName] = useState('')
  const [maxPrice, setMaxPrice] = useState(0.1)
  const [priority, setPriority] = useState<'low' | 'regular'>('low')
  const [zoneId, setZoneId] = useState('')
  const [evictionPolicy, setEvictionPolicy] = useState<'stop' | 'delete' | 'deallocate'>('stop')
  const [creating, setCreating] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vmName.trim()) { toast.error('VM name is required'); return }
    if (maxPrice <= 0) { toast.error('Max price must be greater than 0'); return }
    setCreating(true)
    try {
      await createSpotInstance({
        vm_name: vmName.trim(),
        max_price_per_hour: maxPrice,
        priority,
        zone_id: zoneId || undefined,
        eviction_policy: evictionPolicy,
      })
      toast.success(`Spot instance requested for '${vmName.trim()}'`)
      onCreated()
    } catch (err) {
      toastFailure(toast, 'Failed to request spot instance', err)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2"><Zap className="w-5 h-5 text-amber-400" /> Request Spot Instance</h2>
        <p className="text-xs text-slate-500 mb-4">The VM must already exist. Eviction (manual or automatic) applies the chosen policy to it immediately.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">VM Name</label>
            <input value={vmName} onChange={e => setVmName(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" placeholder="my-vm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Max Price/hr ($)</label>
              <input type="number" min={0.01} step={0.01} value={maxPrice} onChange={e => setMaxPrice(Number(e.target.value))} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value as 'low' | 'regular')} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2">
                <option value="low">Low</option>
                <option value="regular">Regular</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Zone (optional)</label>
              <select value={zoneId} onChange={e => setZoneId(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2">
                <option value="">Any</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Eviction Policy</label>
              <select value={evictionPolicy} onChange={e => setEvictionPolicy(e.target.value as 'stop' | 'delete' | 'deallocate')} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2">
                <option value="stop">Stop</option>
                <option value="deallocate">Deallocate</option>
                <option value="delete">Delete</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">Cancel</button>
            <button type="submit" disabled={creating} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50">{creating ? 'Requesting…' : 'Request'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
