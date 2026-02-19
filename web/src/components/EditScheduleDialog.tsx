import { useState } from 'react'
import { X, Calendar } from 'lucide-react'
import { updateSchedule, Schedule } from '../api/schedule'
import { useToastContext } from '../contexts/ToastContext'

interface EditScheduleDialogProps {
  schedule: Schedule
  onClose: () => void
  onSuccess: () => void
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

export default function EditScheduleDialog({ schedule, onClose, onSuccess }: EditScheduleDialogProps) {
  const toast = useToastContext()
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: schedule.name,
    action: schedule.action,
    schedule_type: schedule.schedule_type,
    time: schedule.time,
    days_of_week: schedule.days_of_week || [],
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Schedule name is required')
      return
    }

    if (formData.schedule_type === 'weekly' && formData.days_of_week.length === 0) {
      toast.error('Please select at least one day for weekly schedule')
      return
    }

    setSaving(true)
    try {
      await updateSchedule(schedule.id, formData)
      toast.success('Schedule updated successfully')
      onSuccess()
      onClose()
    } catch (_error) {
      toast.error('Failed to update schedule')
    } finally {
      setSaving(false)
    }
  }

  const toggleDay = (day: number) => {
    if (formData.days_of_week.includes(day)) {
      setFormData({
        ...formData,
        days_of_week: formData.days_of_week.filter(d => d !== day)
      })
    } else {
      setFormData({
        ...formData,
        days_of_week: [...formData.days_of_week, day].sort()
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-blue-500" />
            <div>
              <h2 className="text-xl font-bold">Edit Schedule</h2>
              <p className="text-sm text-gray-400">VM: {schedule.vm_name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Schedule Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Stop dev VMs at night"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          {/* Action */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Action <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.action}
              onChange={(e) => setFormData({ ...formData, action: e.target.value as any })}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              required
            >
              <option value="start">Start VM</option>
              <option value="stop">Stop VM</option>
              <option value="restart">Restart VM</option>
              <option value="snapshot">Create Snapshot</option>
            </select>
          </div>

          {/* Schedule Type */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Schedule Type <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.schedule_type}
              onChange={(e) => setFormData({ ...formData, schedule_type: e.target.value as any })}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              required
            >
              <option value="once">Once (run one time)</option>
              <option value="daily">Daily (every day)</option>
              <option value="weekly">Weekly (specific days)</option>
            </select>
          </div>

          {/* Days of Week (for weekly) */}
          {formData.schedule_type === 'weekly' && (
            <div>
              <label className="block text-sm font-medium mb-3">
                Days of Week <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => {
                  const isSelected = formData.days_of_week.includes(day.value)
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {day.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Time */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Time <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              value={formData.time}
              onChange={(e) => setFormData({ ...formData, time: e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              required
            />
            <p className="text-xs text-gray-400 mt-1">24-hour format (HH:MM)</p>
          </div>

          {/* Current Status */}
          <div className="p-4 bg-gray-900 border border-gray-700 rounded-lg">
            <h4 className="text-sm font-medium mb-2">Current Status</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400">Status</p>
                <p className={schedule.enabled ? 'text-green-400' : 'text-gray-400'}>
                  {schedule.enabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              {schedule.next_run && (
                <div>
                  <p className="text-gray-400">Next Run</p>
                  <p className="text-blue-400">{new Date(schedule.next_run).toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
