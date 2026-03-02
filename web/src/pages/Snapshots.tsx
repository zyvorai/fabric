import { useState, useEffect } from 'react'
import { Camera, Plus, Trash2, RotateCcw } from 'lucide-react'
import {
  listSnapshots,
  createSnapshot,
  deleteSnapshot,
  revertSnapshot,
  type VMSnapshot,
} from '../api/snapshots'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'

export default function Snapshots() {
  const { confirmState, confirm, cancel } = useConfirm()
  const [vmName, setVmName] = useState('')
  const [snapshots, setSnapshots] = useState<VMSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const loadSnapshots = async () => {
    if (!vmName) return
    setLoading(true)
    try {
      const data = await listSnapshots(vmName)
      setSnapshots(data)
    } catch (error) {
      console.error('Failed to load snapshots:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (vmName) loadSnapshots()
  }, [vmName])

  const handleDelete = async (id: string) => {
    if (!await confirm('Delete Snapshot', 'Are you sure you want to delete this snapshot?')) return
    try {
      await deleteSnapshot(vmName, id)
      await loadSnapshots()
    } catch (error) {
      console.error('Failed to delete snapshot:', error)
      alert(`Failed to delete snapshot: ${error}`)
    }
  }

  const handleRevert = async (id: string) => {
    if (!await confirm('Revert Snapshot', 'Revert VM to this snapshot? The VM must be stopped.', { confirmLabel: 'Revert', variant: 'warning' })) return
    try {
      await revertSnapshot(vmName, id)
      alert('Successfully reverted to snapshot')
    } catch (error) {
      console.error('Failed to revert snapshot:', error)
      alert(`Failed to revert: ${error}`)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">VM Snapshots</h1>
          <p className="text-gray-400">Create and manage VM snapshots</p>
        </div>
      </div>

      {/* VM selector */}
      <div className="bg-gray-800 rounded-lg p-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2">VM Name</label>
            <input
              type="text"
              value={vmName}
              onChange={(e) => setVmName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2"
              placeholder="Enter VM name"
            />
          </div>
          <button
            onClick={loadSnapshots}
            disabled={!vmName}
            className="mt-7 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded transition"
          >
            Load Snapshots
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            disabled={!vmName}
            className="mt-7 flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded transition"
          >
            <Plus className="w-4 h-4" />
            Create
          </button>
        </div>
      </div>

      {/* Snapshots list */}
      {vmName && (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm">
                <th className="p-4">Name</th>
                <th className="p-4">Type</th>
                <th className="p-4">Description</th>
                <th className="p-4">Created</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    Loading snapshots...
                  </td>
                </tr>
              ) : snapshots.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    No snapshots found for this VM.
                  </td>
                </tr>
              ) : (
                snapshots.map((snap) => (
                  <tr key={snap.id} className="border-t border-gray-700 hover:bg-gray-750">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Camera className="w-4 h-4 text-blue-400" />
                        <span className="font-medium">{snap.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-gray-400">{snap.snapshot_type}</td>
                    <td className="p-4 text-sm text-gray-400">{snap.description || '-'}</td>
                    <td className="p-4 text-sm text-gray-400">
                      {new Date(snap.created).toLocaleString()}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRevert(snap.id)}
                          className="p-2 hover:bg-gray-700 rounded transition"
                          title="Revert to snapshot"
                        >
                          <RotateCcw className="w-4 h-4 text-yellow-500" />
                        </button>
                        <button
                          onClick={() => handleDelete(snap.id)}
                          className="p-2 hover:bg-gray-700 rounded transition"
                          title="Delete snapshot"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreateDialog && (
        <CreateSnapshotDialog
          vmName={vmName}
          onClose={() => setShowCreateDialog(false)}
          onCreated={loadSnapshots}
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

function CreateSnapshotDialog({
  vmName,
  onClose,
  onCreated,
}: {
  vmName: string
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [snapshotType, setSnapshotType] = useState<'Disk' | 'Full'>('Disk')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createSnapshot(vmName, {
        name,
        description: description || undefined,
        snapshot_type: snapshotType,
      })
      onCreated()
      onClose()
    } catch (error) {
      console.error('Failed to create snapshot:', error)
      alert(`Failed to create snapshot: ${error}`)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6">Create Snapshot</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Snapshot Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2"
              placeholder="my-snapshot"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2"
              placeholder="Optional description"
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Type</label>
            <select
              value={snapshotType}
              onChange={(e) => setSnapshotType(e.target.value as 'Disk' | 'Full')}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2"
            >
              <option value="Disk">Disk Only</option>
              <option value="Full">Full (Disk + State)</option>
            </select>
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
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
