// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { Camera, Plus, RotateCcw, Trash2, Loader2, RefreshCw } from 'lucide-react'
import { apiFetch } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import { PageHeader, EmptyState } from '../components/ui'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

interface Snapshot {
  name: string
  created_at: string
  state: string
  parent?: string
  description?: string
}

async function parseApiError(res: Response): Promise<never> {
  const body = await res.text()
  throw new Error(formatHttpErrorBody(res.status, res.statusText, body))
}

export default function SnapshotManager() {
  const toast = useToastContext()
  const [vms, setVMs] = useState<string[]>([])
  const [selectedVM, setSelectedVM] = useState('')
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const fetchVMs = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiFetch('/api/vms')
      if (!res.ok) await parseApiError(res)
      const data = await res.json()
      setVMs((Array.isArray(data) ? data : data.vms || []).map((v: { name: string }) => v.name))
    } catch (err) {
      const msg = formatUserError(err)
      setLoadError(msg)
      toastFailure(toast, 'Failed to load VMs', err)
    } finally {
      setLoading(false)
    }
  }, [toast])

  const fetchSnapshots = useCallback(async () => {
    if (!selectedVM) return
    setSnapshotsLoading(true)
    setActionError(null)
    try {
      const res = await apiFetch(`/api/vms/${selectedVM}/snapshots`)
      if (!res.ok) await parseApiError(res)
      const data = await res.json()
      setSnapshots(Array.isArray(data) ? data : data.snapshots || [])
    } catch (err) {
      const msg = formatUserError(err)
      setActionError(msg)
      setSnapshots([])
      toastFailure(toast, 'Failed to load snapshots', err)
    } finally {
      setSnapshotsLoading(false)
    }
  }, [selectedVM, toast])

  useEffect(() => {
    fetchVMs()
  }, [fetchVMs])

  useEffect(() => {
    fetchSnapshots()
    if (!selectedVM) return
    const interval = setInterval(fetchSnapshots, 15000)
    return () => clearInterval(interval)
  }, [selectedVM, fetchSnapshots])

  const handleCreate = async () => {
    if (!selectedVM || !newName.trim()) return
    setCreating(true)
    setActionError(null)
    setSuccess(null)
    try {
      const res = await apiFetch(`/api/vms/${selectedVM}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) await parseApiError(res)
      setSuccess(`Snapshot "${newName}" created`)
      setNewName('')
      toast.success(`Snapshot "${newName.trim()}" created`)
      fetchSnapshots()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      const msg = formatUserError(err)
      setActionError(msg)
      toastFailure(toast, 'Failed to create snapshot', err)
    } finally {
      setCreating(false)
    }
  }

  const handleRevert = async (snapName: string) => {
    if (!confirm(`Revert VM "${selectedVM}" to snapshot "${snapName}"?`)) return
    setActionError(null)
    try {
      const res = await apiFetch(`/api/vms/${selectedVM}/snapshots/${snapName}/revert`, { method: 'POST' })
      if (!res.ok) await parseApiError(res)
      setSuccess(`Reverted to "${snapName}"`)
      toast.success(`Reverted to "${snapName}"`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      const msg = formatUserError(err)
      setActionError(msg)
      toastFailure(toast, 'Failed to revert snapshot', err)
    }
  }

  const handleDelete = async (snapName: string) => {
    if (!confirm(`Delete snapshot "${snapName}"?`)) return
    setActionError(null)
    try {
      const res = await apiFetch(`/api/vms/${selectedVM}/snapshots/${snapName}`, { method: 'DELETE' })
      if (!res.ok) await parseApiError(res)
      toast.success(`Snapshot "${snapName}" deleted`)
      fetchSnapshots()
    } catch (err) {
      const msg = formatUserError(err)
      setActionError(msg)
      toastFailure(toast, 'Failed to delete snapshot', err)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Snapshot Manager"
        description="Create, revert, and manage VM snapshots"
        onRefresh={fetchVMs}
        refreshing={loading}
      />

      {loadError && (
        <ErrorBanner
          title="Could not load virtual machines"
          headline={loadError}
          hints={hintsForError(loadError, 'vm')}
          onRetry={fetchVMs}
        />
      )}

      {actionError && (
        <ErrorBanner
          title="Snapshot action failed"
          headline={actionError}
          hints={hintsForError(actionError, 'vm')}
        />
      )}

      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-sm text-green-400">
          {success}
        </div>
      )}

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Select VM</label>
            <select
              value={selectedVM}
              onChange={(e) => setSelectedVM(e.target.value)}
              aria-label="Select VM"
              disabled={loading || !!loadError}
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
            >
              <option value="">Select a VM…</option>
              {vms.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={fetchSnapshots}
            disabled={!selectedVM || snapshotsLoading}
            title="Refresh snapshots"
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${snapshotsLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {selectedVM && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Create Snapshot</h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="snapshot-name"
              aria-label="Snapshot name"
              className="flex-1 bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              title="Create snapshot"
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create
            </button>
          </div>
        </div>
      )}

      {selectedVM && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Snapshots for {selectedVM}</h3>
            <span className="text-xs font-medium text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">
              {snapshots.length}
            </span>
          </div>
          {snapshotsLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
            </div>
          ) : snapshots.length === 0 ? (
            <EmptyState
              icon={<Camera className="w-10 h-10" />}
              title="No snapshots"
              description="Create a snapshot to capture this VM's disk state"
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Created</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">State</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Parent</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-slate-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {snapshots.map((snap) => (
                  <tr key={snap.name} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-3 text-white font-medium">{snap.name}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs">
                      {snap.created_at ? new Date(snap.created_at).toLocaleString() : '-'}
                    </td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400">
                        {snap.state || '-'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{snap.parent || '-'}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => handleRevert(snap.name)}
                          title="Revert to this snapshot"
                          className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(snap.name)}
                          title="Delete snapshot"
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!selectedVM && !loading && !loadError && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50">
          <EmptyState
            icon={<Camera className="w-10 h-10" />}
            title="Select a VM"
            description="Choose a virtual machine to manage snapshots"
          />
        </div>
      )}
    </div>
  )
}
