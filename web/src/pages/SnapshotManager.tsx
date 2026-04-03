import { useState, useEffect, useCallback } from 'react'
import { Camera, Plus, RotateCcw, Trash2, Loader2, RefreshCw } from 'lucide-react'
import { apiFetch } from '../api/client'

interface Snapshot { name: string; created_at: string; state: string; parent?: string; description?: string }

export default function SnapshotManager() {
  const [vms, setVMs] = useState<string[]>([])
  const [selectedVM, setSelectedVM] = useState('')
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const fetchVMs = useCallback(async () => {
    try { const res = await apiFetch('/api/vms'); if (res.ok) { const data = await res.json(); setVMs((Array.isArray(data) ? data : data.vms || []).map((v: any) => v.name)) } } catch (err: any) { setError(err.message || 'Failed to load VMs') } finally { setLoading(false) }
  }, [])

  const fetchSnapshots = useCallback(async () => {
    if (!selectedVM) return
    try { const res = await apiFetch(`/api/vms/${selectedVM}/snapshots`); if (res.ok) { const data = await res.json(); setSnapshots(Array.isArray(data) ? data : data.snapshots || []) } } catch (err: any) { setError(err.message || 'Failed to load snapshots'); setSnapshots([]) }
  }, [selectedVM])

  useEffect(() => { fetchVMs() }, [fetchVMs])
  useEffect(() => { fetchSnapshots(); if (selectedVM) { const interval = setInterval(fetchSnapshots, 15000); return () => clearInterval(interval) } }, [selectedVM, fetchSnapshots])

  const handleCreate = async () => {
    if (!selectedVM || !newName.trim()) return
    setCreating(true); setError(null); setSuccess(null)
    try {
      const res = await apiFetch('/api/snapshots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vm_name: selectedVM, name: newName.trim() }) })
      if (!res.ok) { const body = await res.json().catch(() => null); throw new Error(body?.error || `HTTP ${res.status}`) }
      setSuccess(`Snapshot "${newName}" created`); setNewName(''); fetchSnapshots()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) { setError(err.message) } finally { setCreating(false) }
  }

  const handleRevert = async (snapName: string) => {
    if (!confirm(`Revert VM "${selectedVM}" to snapshot "${snapName}"?`)) return
    setError(null)
    try {
      const res = await apiFetch(`/api/vms/${selectedVM}/snapshots/${snapName}/revert`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSuccess(`Reverted to "${snapName}"`); setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) { setError(err.message) }
  }

  const handleDelete = async (snapName: string) => {
    if (!confirm(`Delete snapshot "${snapName}"?`)) return
    setError(null)
    try {
      const res = await apiFetch(`/api/vms/${selectedVM}/snapshots/${snapName}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      fetchSnapshots()
    } catch (err: any) { setError(err.message) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3"><Camera className="w-6 h-6 text-purple-400" /><div><h1 className="text-xl font-bold text-white">Snapshot Manager</h1><p className="text-sm text-slate-400">Create, revert, and manage VM snapshots</p></div></div>
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
      {success && <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-sm text-green-400">{success}</div>}

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Select VM</label>
            <select value={selectedVM} onChange={e => setSelectedVM(e.target.value)} aria-label="Select VM" className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
              <option value="">Select a VM...</option>
              {vms.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <button onClick={fetchSnapshots} disabled={!selectedVM} title="Refresh snapshots" className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg transition-colors disabled:opacity-50"><RefreshCw className="w-4 h-4" /> Refresh</button>
        </div>
      </div>

      {selectedVM && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Create Snapshot</h3>
          <div className="flex gap-3">
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="snapshot-name" aria-label="Snapshot name" className="flex-1 bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500" />
            <button onClick={handleCreate} disabled={creating || !newName.trim()} title="Create snapshot" className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create
            </button>
          </div>
        </div>
      )}

      {selectedVM && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Snapshots for {selectedVM}</h3>
            <span className="text-xs font-medium text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">{snapshots.length}</span>
          </div>
          {snapshots.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No snapshots found</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700/50">
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Name</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Created</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">State</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Parent</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-slate-400 uppercase">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {snapshots.map(snap => (
                  <tr key={snap.name} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-3 text-white font-medium">{snap.name}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs">{snap.created_at ? new Date(snap.created_at).toLocaleString() : '-'}</td>
                    <td className="px-5 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400">{snap.state || '-'}</span></td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{snap.parent || '-'}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => handleRevert(snap.name)} title="Revert to this snapshot" className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"><RotateCcw className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(snap.name)} title="Delete snapshot" className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!selectedVM && !loading && <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500"><Camera className="w-10 h-10 mx-auto mb-3 opacity-50" /><p className="text-sm">Select a VM to manage snapshots</p></div>}
    </div>
  )
}
