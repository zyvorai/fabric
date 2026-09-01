// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { Camera, Plus, RotateCcw, Trash2, Loader2, RefreshCw } from 'lucide-react'
import { apiFetch } from '../api/client'
import { listVMs } from '../api/vm'
import ErrorBanner from '../components/ErrorBanner'
import { PageHeader, EmptyState } from '../components/ui'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'

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
  const { confirmState, confirm, cancel } = useConfirm()
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
      setVMs((await listVMs()).map((v) => v.name))
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
    if (!await confirm('Revert Snapshot', `Revert VM "${selectedVM}" to snapshot "${snapName}"?`, { variant: 'warning', confirmLabel: 'Revert' })) return
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
    if (!await confirm('Delete Snapshot', `Delete snapshot "${snapName}"?`, { variant: 'danger', confirmLabel: 'Delete' })) return
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
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="bg-[var(--zf-canvas)] rounded-xl border border-[var(--zf-hairline)] p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-[var(--zf-muted)] mb-1.5">Select VM</label>
            <select
              value={selectedVM}
              onChange={(e) => setSelectedVM(e.target.value)}
              aria-label="Select VM"
              disabled={loading || !!loadError}
              className="input-field disabled:opacity-50"
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
            className="zf-btn zf-btn-ghost"
          >
            <RefreshCw className={`w-4 h-4 ${snapshotsLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {selectedVM && (
        <div className="bg-[var(--zf-canvas)] rounded-xl border border-[var(--zf-hairline)] p-5">
          <h3 className="text-sm font-semibold text-[var(--zf-ink)] mb-3">Create Snapshot</h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="snapshot-name"
              aria-label="Snapshot name"
              className="input-field flex-1"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              title="Create snapshot"
              className="zf-btn zf-btn-primary"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create
            </button>
          </div>
        </div>
      )}

      {selectedVM && (
        <div className="bg-[var(--zf-canvas)] rounded-xl border border-[var(--zf-hairline)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--zf-hairline)] flex items-center justify-between">
            <h3 className="text-base font-semibold text-[var(--zf-ink)]">Snapshots for {selectedVM}</h3>
            <span className="text-xs font-medium text-[var(--zf-muted)] bg-[var(--zf-hairline)] px-2.5 py-1 rounded-full">
              {snapshots.length}
            </span>
          </div>
          {snapshotsLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-6 h-6 text-[var(--zf-link)] animate-spin" />
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
                <tr className="border-b border-[var(--zf-hairline)]">
                  <th className="text-left px-5 py-3 text-xs font-medium text-[var(--zf-muted)] uppercase">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[var(--zf-muted)] uppercase">Created</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[var(--zf-muted)] uppercase">State</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[var(--zf-muted)] uppercase">Parent</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-[var(--zf-muted)] uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--zf-hairline)]/30">
                {snapshots.map((snap) => (
                  <tr key={snap.name} className="hover:bg-black/[0.04] transition-colors">
                    <td className="px-5 py-3 text-[var(--zf-ink)] font-medium">{snap.name}</td>
                    <td className="px-5 py-3 text-[var(--zf-muted)] text-xs">
                      {snap.created_at ? new Date(snap.created_at).toLocaleString() : '-'}
                    </td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium border text-[var(--zf-muted)] bg-[var(--zf-canvas)] border-[var(--zf-hairline)]">
                        {snap.state || '-'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[var(--zf-muted)] text-xs">{snap.parent || '-'}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => handleRevert(snap.name)}
                          title="Revert to this snapshot"
                          className="p-1.5 text-[var(--zf-muted)] hover:text-[var(--zf-link)] hover:bg-[var(--zf-link-hover)]/10 rounded-lg transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(snap.name)}
                          title="Delete snapshot"
                          className="p-1.5 text-[var(--zf-muted)] hover:text-[var(--zf-danger)] hover:bg-red-50 rounded-lg transition-colors"
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
        <div className="bg-[var(--zf-canvas)] rounded-xl border border-[var(--zf-hairline)]">
          <EmptyState
            icon={<Camera className="w-10 h-10" />}
            title="Select a VM"
            description="Choose a virtual machine to manage snapshots"
          />
        </div>
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
