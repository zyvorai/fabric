// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useEffect, useState } from 'react'
import { Save, RotateCcw, Trash2, Plus, HardDrive, Clock, CheckCircle, XCircle, Loader } from 'lucide-react'
import {
  listBackups,
  createBackup,
  deleteBackup,
  restoreBackup,
  getBackupJobs,
  getBackupStats,
  Backup,
  BackupJob,
  BackupStats
} from '../api/backup'
import { listVMs, VM } from '../api/vm'
import { useToastContext } from '../contexts/ToastContext'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import { PageHeader } from '../components/ui'
import ErrorBanner from '../components/ErrorBanner'
import { formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import RelativeTime from '../components/RelativeTime'
import TableSearch from '../components/TableSearch'
import { useTableFilter } from '../hooks/useTableFilter'

export default function Backups() {
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const [backups, setBackups] = useState<Backup[]>([])
  const [jobs, setJobs] = useState<BackupJob[]>([])
  const [stats, setStats] = useState<BackupStats | null>(null)
  const [vms, setVMs] = useState<VM[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showRestoreDialog, setShowRestoreDialog] = useState<Backup | null>(null)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5000) // Refresh every 5s
    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    setLoadError(null)
    try {
      const [backupsData, jobsData, statsData, vmsData] = await Promise.all([
        listBackups(),
        getBackupJobs(),
        getBackupStats(),
        listVMs()
      ])
      setBackups(backupsData)
      setJobs(jobsData)
      setStats(statsData)
      setVMs(vmsData)
    } catch (error) {
      const msg = formatUserError(error)
      setLoadError(msg)
      toastFailure(toast, 'Failed to load backups', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateBackup = async (vmName: string, backupType: 'full' | 'incremental') => {
    try {
      await createBackup({
        vm_name: vmName,
        backup_type: backupType,
        compress: true,
        retention_days: 30
      })
      toast.success('Backup job started')
      setShowCreateDialog(false)
      loadData()
    } catch (_error) {
      toast.error('Failed to create backup')
    }
  }

  const handleDeleteBackup = async (id: string) => {
    const ok = await confirm('Delete Backup', 'Delete this backup? This action cannot be undone.', { variant: 'danger', confirmLabel: 'Delete' })
    if (!ok) return

    try {
      await deleteBackup(id)
      toast.success('Backup deleted')
      loadData()
    } catch (_error) {
      toast.error('Failed to delete backup')
    }
  }

  const handleRestore = async (backup: Backup, targetVmName?: string) => {
    const ok = await confirm('Restore from Backup', `Restore VM from backup? ${targetVmName ? `New VM will be named: ${targetVmName}` : 'This will overwrite the current VM.'}`, { variant: 'danger', confirmLabel: 'Restore' })
    if (!ok) return

    try {
      await restoreBackup({
        backup_id: backup.id,
        target_vm_name: targetVmName,
        restore_config: true,
        restore_disks: true,
        restore_state: false
      })
      toast.success('Restore job started')
      setShowRestoreDialog(null)
      loadData()
    } catch (_error) {
      toast.error('Failed to restore backup')
    }
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
  }

  const getJobStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'failed': return <XCircle className="w-5 h-5 text-red-500" />
      case 'running': return <Loader className="w-5 h-5 text-blue-500 animate-spin" />
      default: return <Clock className="w-5 h-5 text-[#6e6e73]" />
    }
  }

  const { query, setQuery, filtered: filteredBackups } = useTableFilter(backups, (b) => [b.vm_name, b.backup_type, b.status])

  if (loading) {
    return <div className="text-center py-8">Loading backups...</div>
  }

  return (
    <div>
      {loadError && (
        <ErrorBanner
          title="Could not load backups"
          headline={loadError}
          onRetry={loadData}
        />
      )}
      <PageHeader
        title="Backups & Restore"
        description="Manage VM backups and recovery"
        actions={
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#0066cc] hover:bg-[#0077ed] rounded-lg transition"
          >
            <Plus className="w-4 h-4" />
            Create Backup
          </button>
        }
      />

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#6e6e73]">Total Backups</p>
                <p className="text-2xl font-bold">{stats.total_backups}</p>
              </div>
              <HardDrive className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#6e6e73]">Total Size</p>
                <p className="text-2xl font-bold">{formatBytes(stats.total_size_bytes)}</p>
              </div>
              <Save className="w-8 h-8 text-green-500" />
            </div>
          </div>
          <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg p-4">
            <div>
              <p className="text-sm text-[#6e6e73] mb-2">By Type</p>
              <div className="space-y-1">
                {Object.entries(stats.by_type).map(([type, count]) => (
                  <div key={type} className="flex justify-between text-sm">
                    <span className="text-[#6e6e73] capitalize">{type}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg p-4">
            <div>
              <p className="text-sm text-[#6e6e73] mb-2">Latest</p>
              <p className="text-xs text-[#6e6e73]">
                {new Date(stats.newest_backup).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active Jobs */}
      {jobs.filter(j => j.status === 'running' || j.status === 'queued').length > 0 && (
        <div className="mb-6 bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg p-4">
          <h2 className="text-lg font-bold mb-4">Active Jobs</h2>
          <div className="space-y-3">
            {jobs.filter(j => j.status === 'running' || j.status === 'queued').map((job) => (
              <div key={job.id} className="flex items-center gap-3 p-3 bg-[#f5f5f7] rounded">
                {getJobStatusIcon(job.status)}
                <div className="flex-1">
                  <p className="font-medium">{job.vm_name}</p>
                  <p className="text-sm text-[#6e6e73] capitalize">{job.operation}</p>
                </div>
                <div className="w-32">
                  <div className="h-2 bg-white rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-[#6e6e73] mt-1">{job.progress}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backups List */}
      <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg">
        <div className="p-4 border-b border-[#d2d2d7] flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold shrink-0">Available Backups</h2>
          {backups.length > 0 && (
            <TableSearch value={query} onChange={setQuery} placeholder="Search by VM, type, status..." resultCount={filteredBackups.length} totalCount={backups.length} className="w-full max-w-sm" />
          )}
        </div>
        {backups.length === 0 ? (
          <div className="text-center py-12">
            <HardDrive className="w-16 h-16 text-[#6e6e73] mx-auto mb-4" />
            <p className="text-xl text-[#6e6e73] mb-4">No backups found</p>
            <p className="text-[#6e6e73] mb-6">Create your first backup to get started</p>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0066cc] hover:bg-[#0077ed] rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              Create Backup
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#6e6e73] uppercase">VM</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#6e6e73] uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#6e6e73] uppercase">Size</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#6e6e73] uppercase">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#6e6e73] uppercase">Expires</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#6e6e73] uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#6e6e73] uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d2d2d7]">
                {filteredBackups.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-[#6e6e73]">
                      No backups match "{query}"
                    </td>
                  </tr>
                )}
                {filteredBackups.map((backup) => (
                  <tr key={backup.id} className="hover:bg-white">
                    <td className="px-4 py-3 text-sm font-medium">{backup.vm_name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        backup.backup_type === 'full' ? 'bg-[#0066cc]' : 'bg-purple-600'
                      }`}>
                        {backup.backup_type.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{formatBytes(backup.size_bytes)}</td>
                    <td className="px-4 py-3 text-sm text-[#6e6e73]">
                      <RelativeTime date={backup.created} />
                    </td>
                    <td className="px-4 py-3 text-sm text-[#6e6e73]">
                      {backup.expires_at ? <RelativeTime date={backup.expires_at} /> : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        backup.status === 'completed' ? 'bg-green-600' :
                        backup.status === 'in_progress' ? 'bg-yellow-600' :
                        'bg-red-600'
                      }`}>
                        {backup.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowRestoreDialog(backup)}
                          disabled={backup.status !== 'completed'}
                          className="p-2 bg-green-600 hover:bg-green-700 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Restore"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteBackup(backup.id)}
                          className="p-2 bg-red-600 hover:bg-red-700 rounded transition"
                          title="Delete"
                        >
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

      {/* Create Backup Dialog */}
      {showCreateDialog && (
        <CreateBackupDialog
          vms={vms}
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreateBackup}
        />
      )}

      {/* Restore Dialog */}
      {showRestoreDialog && (
        <RestoreDialog
          backup={showRestoreDialog}
          onClose={() => setShowRestoreDialog(null)}
          onRestore={handleRestore}
        />
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

// Create Backup Dialog Component
interface CreateBackupDialogProps {
  vms: VM[]
  onClose: () => void
  onCreate: (vmName: string, backupType: 'full' | 'incremental') => void
}

function CreateBackupDialog({ vms, onClose, onCreate }: CreateBackupDialogProps) {
  const [vmName, setVmName] = useState(vms[0]?.name || '')
  const [backupType, setBackupType] = useState<'full' | 'incremental'>('full')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[#f5f5f7] rounded-lg shadow-2xl border border-[#d2d2d7] w-full max-w-md">
        <div className="p-6 border-b border-[#d2d2d7]">
          <h2 className="text-xl font-bold">Create Backup</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Virtual Machine</label>
            <select
              value={vmName}
              onChange={(e) => setVmName(e.target.value)}
              className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-4 py-2 text-[#1d1d1f] focus:outline-none focus:border-blue-500"
            >
              {vms.map((vm: VM) => (
                <option key={vm.name} value={vm.name}>{vm.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Backup Type</label>
            <select
              value={backupType}
              onChange={(e) => setBackupType(e.target.value as 'full' | 'incremental')}
              className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-4 py-2 text-[#1d1d1f] focus:outline-none focus:border-blue-500"
            >
              <option value="full">Full Backup</option>
              <option value="incremental">Incremental Backup</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-6 border-t border-[#d2d2d7]">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-[#d2d2d7] rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onCreate(vmName, backupType)}
            className="px-4 py-2 bg-[#0066cc] hover:bg-[#0077ed] rounded-lg transition"
          >
            Create Backup
          </button>
        </div>
      </div>
    </div>
  )
}

// Restore Dialog Component
interface RestoreDialogProps {
  backup: Backup
  onClose: () => void
  onRestore: (backup: Backup, targetVmName?: string) => void
}

function RestoreDialog({ backup, onClose, onRestore }: RestoreDialogProps) {
  const [targetName, setTargetName] = useState('')
  const [createNew, setCreateNew] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[#f5f5f7] rounded-lg shadow-2xl border border-[#d2d2d7] w-full max-w-md">
        <div className="p-6 border-b border-[#d2d2d7]">
          <h2 className="text-xl font-bold">Restore from Backup</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-3 bg-[#f5f5f7] rounded border border-[#d2d2d7]">
            <p className="text-sm text-[#6e6e73]">Source VM</p>
            <p className="font-medium">{backup.vm_name}</p>
            <p className="text-xs text-[#6e6e73] mt-1">
              {new Date(backup.created).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="create-new"
              checked={createNew}
              onChange={(e) => setCreateNew(e.target.checked)}
              className="w-4 h-4 bg-[#f5f5f7] border-[#d2d2d7] rounded focus:ring-blue-500"
            />
            <label htmlFor="create-new" className="text-sm font-medium">
              Restore to new VM
            </label>
          </div>
          {createNew && (
            <div>
              <label className="block text-sm font-medium mb-2">New VM Name</label>
              <input
                type="text"
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                placeholder={`${backup.vm_name}-restored`}
                className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-4 py-2 text-[#1d1d1f] placeholder-[#6e6e73] focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 p-6 border-t border-[#d2d2d7]">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-[#d2d2d7] rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onRestore(backup, createNew ? targetName : undefined)}
            disabled={createNew && !targetName}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition disabled:opacity-50"
          >
            Restore
          </button>
        </div>
      </div>
    </div>
  )
}
