import { useState, useEffect } from 'react'
import { X, Calendar } from 'lucide-react'
import { createSchedule, CreateScheduleRequest } from '../api/schedule'
import { listVMs, VM } from '../api/vm'
import { useToastContext } from '../contexts/ToastContext'

interface CreateScheduleDialogProps {
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

export default function CreateScheduleDialog({ onClose, onSuccess }: CreateScheduleDialogProps) {
  const toast = useToastContext()
  const [creating, setCreating] = useState(false)
  const [vms, setVMs] = useState<VM[]>([])
  const [formData, setFormData] = useState<CreateScheduleRequest>({
    name: '',
    vm_name: '',
    action: 'start',
    schedule_type: 'daily',
    time: '09:00',
    days_of_week: [],
    enabled: true,
  })

  useEffect(() => {
    loadVMs()
  }, [])

  const loadVMs = async () => {
    try {
      const data = await listVMs()
      setVMs(data)
      if (data.length > 0) {
        setFormData(prev => ({ ...prev, vm_name: data[0].name }))
      }
    } catch (error) {
      console.error('Failed to load VMs:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Schedule name is required')
      return
    }

    if (!formData.vm_name) {
      toast.error('Please select a VM')
      return
    }

    if (formData.schedule_type === 'weekly' && (!formData.days_of_week || formData.days_of_week.length === 0)) {
      toast.error('Please select at least one day for weekly schedule')
      return
    }

    setCreating(true)
    try {
      await createSchedule(formData)
      toast.success('Schedule created successfully')
      onSuccess()
      onClose()
    } catch (error) {
      toast.error('Failed to create schedule')
    } finally {
      setCreating(false)
    }
  }

  const toggleDay = (day: number) => {
    const days = formData.days_of_week || []
    if (days.includes(day)) {
      setFormData({
        ...formData,
        days_of_week: days.filter(d => d !== day)
      })
    } else {
      setFormData({
        ...formData,
        days_of_week: [...days, day].sort()
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
            <h2 className="text-xl font-bold">Create Schedule</h2>
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

          {/* VM Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Virtual Machine <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.vm_name}
              onChange={(e) => setFormData({ ...formData, vm_name: e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              required
            >
              {vms.map((vm) => (
                <option key={vm.name} value={vm.name}>
                  {vm.name} ({vm.state})
                </option>
              ))}
            </select>
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
                  const isSelected = formData.days_of_week?.includes(day.value)
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

          {/* Enabled */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="enabled"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              className="w-4 h-4 bg-gray-900 border-gray-700 rounded focus:ring-blue-500"
            />
            <label htmlFor="enabled" className="text-sm font-medium">
              Enable schedule immediately
            </label>
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
              disabled={creating}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
