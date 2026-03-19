import { useEffect, useState } from 'react'
import { Plus, Edit, Trash2, Power, PowerOff, Play, Clock, Calendar } from 'lucide-react'
import {
  listSchedules,
  Schedule,
  deleteSchedule,
  enableSchedule,
  disableSchedule,
  runScheduleNow,
  ScheduleHistory,
  getScheduleHistory
} from '../api/schedule'
import { useToastContext } from '../contexts/ToastContext'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import ScheduleDialog from '../components/ScheduleDialog'
import { PageHeader } from '../components/ui'

export default function Schedules() {
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [history, setHistory] = useState<ScheduleHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadData = async () => {
    try {
      const [schedulesData, historyData] = await Promise.all([
        listSchedules(),
        getScheduleHistory()
      ])
      setSchedules(schedulesData)
      setHistory(historyData.slice(0, 20)) // Latest 20
    } catch (error) {
      console.error('Failed to load schedules:', error)
      toast.error('Failed to load schedules')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm('Delete Schedule', 'Delete this schedule? This action cannot be undone.', { variant: 'danger', confirmLabel: 'Delete' })
    if (!ok) return

    try {
      await deleteSchedule(id)
      toast.success('Schedule deleted successfully')
      loadData()
    } catch (_error) {
      toast.error('Failed to delete schedule')
    }
  }

  const handleToggleEnabled = async (schedule: Schedule) => {
    try {
      if (schedule.enabled) {
        await disableSchedule(schedule.id)
        toast.success('Schedule disabled')
      } else {
        await enableSchedule(schedule.id)
        toast.success('Schedule enabled')
      }
      loadData()
    } catch (_error) {
      toast.error(`Failed to ${schedule.enabled ? 'disable' : 'enable'} schedule`)
    }
  }

  const handleRunNow = async (schedule: Schedule) => {
    const ok = await confirm('Run Schedule Now', `Run "${schedule.name}" now?`, { variant: 'danger', confirmLabel: 'Run Now' })
    if (!ok) return

    try {
      await runScheduleNow(schedule.id)
      toast.success('Schedule executed successfully')
      setTimeout(loadData, 1000) // Refresh after execution
    } catch (_error) {
      toast.error('Failed to run schedule')
    }
  }

  const getActionColor = (action: string): string => {
    switch (action) {
      case 'start': return 'bg-green-600'
      case 'stop': return 'bg-red-600'
      case 'restart': return 'bg-yellow-600'
      case 'snapshot': return 'bg-blue-600'
      default: return 'bg-gray-600'
    }
  }

  const getScheduleTypeText = (schedule: Schedule): string => {
    if (schedule.schedule_type === 'once') {
      return `Once at ${schedule.time}`
    } else if (schedule.schedule_type === 'daily') {
      return `Daily at ${schedule.time}`
    } else if (schedule.schedule_type === 'weekly') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const selectedDays = schedule.days_of_week?.map(d => days[d]).join(', ') || ''
      return `Weekly on ${selectedDays} at ${schedule.time}`
    }
    return 'Unknown'
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div>
      <PageHeader
        title="VM Schedules"
        description="Automate VM lifecycle operations"
        actions={
          <>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                showHistory
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <Clock className="w-4 h-4" />
              History
            </button>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              Create Schedule
            </button>
          </>
        }
      />

      {/* Schedules List */}
      {!showHistory && (
        <>
          {schedules.length === 0 ? (
            <div className="text-center py-12 bg-gray-900 rounded-lg border border-gray-800">
              <Calendar className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-xl text-gray-400 mb-4">No schedules configured</p>
              <p className="text-gray-500 mb-6">Create schedules to automate VM operations</p>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
              >
                <Plus className="w-4 h-4" />
                Create First Schedule
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="bg-gray-900 rounded-lg border border-gray-800 p-6"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold">{schedule.name}</h3>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            schedule.enabled
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-600 text-gray-300'
                          }`}
                        >
                          {schedule.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getActionColor(schedule.action)}`}>
                          {schedule.action.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mb-1">
                        VM: <span className="text-white font-medium">{schedule.vm_name}</span>
                      </p>
                      <p className="text-sm text-gray-400 mb-1">
                        Schedule: {getScheduleTypeText(schedule)}
                      </p>
                      {schedule.next_run && (
                        <p className="text-sm text-blue-400">
                          Next run: {new Date(schedule.next_run).toLocaleString()}
                        </p>
                      )}
                      {schedule.last_run && (
                        <p className="text-xs text-gray-500">
                          Last run: {new Date(schedule.last_run).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRunNow(schedule)}
                        disabled={!schedule.enabled}
                        className="p-2 bg-purple-600 hover:bg-purple-700 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Run Now"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleEnabled(schedule)}
                        className={`p-2 rounded transition ${
                          schedule.enabled
                            ? 'bg-yellow-600 hover:bg-yellow-700'
                            : 'bg-green-600 hover:bg-green-700'
                        }`}
                        title={schedule.enabled ? 'Disable' : 'Enable'}
                      >
                        {schedule.enabled ? (
                          <PowerOff className="w-4 h-4" />
                        ) : (
                          <Power className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => setEditingSchedule(schedule)}
                        className="p-2 bg-blue-600 hover:bg-blue-700 rounded transition"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(schedule.id)}
                        className="p-2 bg-red-600 hover:bg-red-700 rounded transition"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* History */}
      {showHistory && (
        <div className="bg-gray-900 rounded-lg border border-gray-800">
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-lg font-bold">Execution History</h2>
            <p className="text-sm text-gray-400">Latest 20 executions</p>
          </div>
          <div className="overflow-x-auto">
            {history.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400">No execution history yet</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Schedule
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      VM
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Action
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Executed At
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {history.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-900">
                      <td className="px-4 py-3 text-sm">{item.schedule_name}</td>
                      <td className="px-4 py-3 text-sm font-medium">{item.vm_name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getActionColor(item.action)}`}>
                          {item.action.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {new Date(item.executed_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            item.status === 'success'
                              ? 'bg-green-600 text-white'
                              : 'bg-red-600 text-white'
                          }`}
                        >
                          {item.status.toUpperCase()}
                        </span>
                        {item.error && (
                          <p className="text-xs text-red-400 mt-1">{item.error}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {showCreateDialog && (
        <ScheduleDialog
          mode="create"
          onClose={() => setShowCreateDialog(false)}
          onSuccess={loadData}
        />
      )}

      {editingSchedule && (
        <ScheduleDialog
          mode="edit"
          schedule={editingSchedule}
          onClose={() => setEditingSchedule(null)}
          onSuccess={loadData}
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
