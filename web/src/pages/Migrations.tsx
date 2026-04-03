import { useEffect, useState } from 'react'
import { ArrowRightLeft, Plus, XCircle, RefreshCw } from 'lucide-react'
import {
  listMigrations,
  startMigration,
  cancelMigration,
  MigrationStatus,
  MigrationRequest,
  MigrationType,
} from '../api/migrations'
import { listVMs, VM } from '../api/vm'
import { useToastContext } from '../contexts/ToastContext'

export default function Migrations() {
  const toast = useToastContext()
  const [migrations, setMigrations] = useState<MigrationStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [showStartDialog, setShowStartDialog] = useState(false)

  useEffect(() => {
    loadMigrations()
    const interval = setInterval(loadMigrations, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadMigrations = async () => {
    try {
      const data = await listMigrations()
      setMigrations(data)
    } catch (error) {
      console.error('Failed to load migrations:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async (id: string) => {
    try {
      await cancelMigration(id)
      toast.success('Migration cancelled')
      loadMigrations()
    } catch (_error) {
      toast.error('Failed to cancel migration')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  const activeMigrations = migrations.filter(m =>
    !['completed', 'failed', 'cancelled'].includes(m.state)
  )
  const completedMigrations = migrations.filter(m =>
    ['completed', 'failed', 'cancelled'].includes(m.state)
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <ArrowRightLeft className="w-8 h-8" />
          VM Migrations
        </h1>
        <div className="flex gap-2">
          <button
            onClick={loadMigrations}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-600 text-white rounded-lg transition"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowStartDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            <Plus className="w-4 h-4" />
            Start Migration
          </button>
        </div>
      </div>

      {/* Active Migrations */}
      {activeMigrations.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Active Migrations</h2>
          {activeMigrations.map(migration => (
            <MigrationCard
              key={migration.id}
              migration={migration}
              onCancel={() => handleCancel(migration.id)}
            />
          ))}
        </div>
      )}

      {/* Migration History */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Migration History</h2>
        {completedMigrations.length === 0 && activeMigrations.length === 0 ? (
          <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <ArrowRightLeft className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <p className="text-xl text-slate-400 mb-4">No migrations yet</p>
            <p className="text-slate-500 mb-6">Migrate VMs between hosts for load balancing or maintenance</p>
            <button
              onClick={() => setShowStartDialog(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
            >
              Start Migration
            </button>
          </div>
        ) : (
          <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800">
                  <tr>
                    <th className="text-left p-4 font-medium text-slate-300">VM</th>
                    <th className="text-left p-4 font-medium text-slate-300">Target Host</th>
                    <th className="text-left p-4 font-medium text-slate-300">Type</th>
                    <th className="text-left p-4 font-medium text-slate-300">Status</th>
                    <th className="text-left p-4 font-medium text-slate-300">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {completedMigrations.map(migration => (
                    <tr key={migration.id} className="hover:bg-white/[0.03] transition">
                      <td className="p-4 font-medium">{migration.vm_name}</td>
                      <td className="p-4 font-mono text-sm text-slate-400">{migration.target_host}</td>
                      <td className="p-4 capitalize">{migration.migration_type}</td>
                      <td className="p-4">
                        <StatusBadge state={migration.state} />
                      </td>
                      <td className="p-4 text-sm text-slate-400">
                        {new Date(migration.started).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showStartDialog && (
        <StartMigrationDialog
          onClose={() => setShowStartDialog(false)}
          onSuccess={() => {
            toast.success('Migration started')
            setShowStartDialog(false)
            loadMigrations()
          }}
        />
      )}
    </div>
  )
}

function StatusBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    precheck: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    syncing: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    switching: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    cancelled: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  }

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${styles[state] || styles.pending}`}>
      {state}
    </span>
  )
}

function MigrationCard({
  migration,
  onCancel,
}: {
  migration: MigrationStatus
  onCancel: () => void
}) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold">{migration.vm_name}</h3>
          <p className="text-sm text-slate-400">
            To: <span className="font-mono">{migration.target_host}</span>
            {' '}&middot;{' '}
            <span className="capitalize">{migration.migration_type}</span> migration
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge state={migration.state} />
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 rounded transition text-sm"
          >
            <XCircle className="w-4 h-4" />
            Cancel
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-800 rounded-full h-2 mb-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${migration.progress_percent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>{migration.progress_percent}% complete</span>
        {migration.bytes_transferred > 0 && (
          <span>{(migration.bytes_transferred / (1024 * 1024)).toFixed(1)} MB transferred</span>
        )}
      </div>

      {migration.error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
          {migration.error}
        </div>
      )}
    </div>
  )
}

function StartMigrationDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const toast = useToastContext()
  const [vms, setVMs] = useState<VM[]>([])
  const [vmName, setVmName] = useState('')
  const [targetHost, setTargetHost] = useState('')
  const [migrationType, setMigrationType] = useState<MigrationType>('offline')
  const [isStarting, setIsStarting] = useState(false)

  useEffect(() => {
    listVMs().then(setVMs).catch(console.error)
  }, [])

  const handleStart = async () => {
    if (!vmName || !targetHost.trim()) {
      toast.error('Please select a VM and enter a target host')
      return
    }

    setIsStarting(true)
    try {
      const req: MigrationRequest = {
        vm_name: vmName,
        target_host: targetHost,
        migration_type: migrationType,
      }
      await startMigration(req)
      onSuccess()
    } catch (error) {
      toast.error(`Failed to start migration: ${error}`)
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800/50 rounded-lg shadow-2xl border border-slate-700/50 w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
          <h2 className="text-xl font-bold">Start Migration</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/[0.03] rounded transition">
            <span className="text-2xl">&times;</span>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">VM</label>
            <select
              value={vmName}
              onChange={(e) => setVmName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">Select a VM</option>
              {vms.map(vm => (
                <option key={vm.name} value={vm.name}>{vm.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Target Host</label>
            <input
              type="text"
              value={targetHost}
              onChange={(e) => setTargetHost(e.target.value)}
              placeholder="hostname or IP address"
              className="w-full bg-slate-800 border border-slate-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Migration Type</label>
            <select
              value={migrationType}
              onChange={(e) => setMigrationType(e.target.value as MigrationType)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="offline">Offline - Stop VM, copy data, start on target</option>
              <option value="live">Live - Minimal downtime migration</option>
              <option value="storage">Storage - Migrate storage volumes only</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-6 border-t border-slate-700/50">
          <button
            onClick={onClose}
            disabled={isStarting}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-600 text-white rounded-lg transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={isStarting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
          >
            {isStarting ? 'Starting...' : 'Start Migration'}
          </button>
        </div>
      </div>
    </div>
  )
}
