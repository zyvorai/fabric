import { useState } from 'react'
import { X, Shield } from 'lucide-react'
import { createQuota, CreateQuotaRequest } from '../api/quota'
import { useToastContext } from '../contexts/ToastContext'

interface CreateQuotaDialogProps {
  onClose: () => void
  onSuccess: () => void
}

export default function CreateQuotaDialog({ onClose, onSuccess }: CreateQuotaDialogProps) {
  const toast = useToastContext()
  const [creating, setCreating] = useState(false)
  const [formData, setFormData] = useState<CreateQuotaRequest>({
    name: '',
    max_cpus: 16,
    max_memory: 16384, // 16GB
    max_disk: 500, // 500GB
    max_vms: 10,
    tags: [],
    enabled: true,
  })
  const [tagInput, setTagInput] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Quota name is required')
      return
    }

    if (formData.max_cpus <= 0 || formData.max_memory <= 0 || formData.max_disk <= 0 || formData.max_vms <= 0) {
      toast.error('All limits must be greater than 0')
      return
    }

    setCreating(true)
    try {
      await createQuota(formData)
      toast.success('Quota created successfully')
      onSuccess()
      onClose()
    } catch (error) {
      toast.error('Failed to create quota')
    } finally {
      setCreating(false)
    }
  }

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim()
    if (trimmedTag && !formData.tags?.includes(trimmedTag)) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), trimmedTag],
      })
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags?.filter((t) => t !== tag) || [],
    })
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-blue-500" />
            <h2 className="text-xl font-bold">Create Resource Quota</h2>
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
              Quota Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Development Team Quota"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          {/* Resource Limits */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Max CPUs */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Max CPUs <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.max_cpus}
                onChange={(e) => setFormData({ ...formData, max_cpus: parseInt(e.target.value) || 0 })}
                min="1"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                required
              />
              <p className="text-xs text-gray-400 mt-1">Total CPU cores allowed</p>
            </div>

            {/* Max Memory */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Max Memory (MB) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.max_memory}
                onChange={(e) => setFormData({ ...formData, max_memory: parseInt(e.target.value) || 0 })}
                min="1"
                step="1024"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                {(formData.max_memory / 1024).toFixed(1)}GB total
              </p>
            </div>

            {/* Max Disk */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Max Disk (GB) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.max_disk}
                onChange={(e) => setFormData({ ...formData, max_disk: parseInt(e.target.value) || 0 })}
                min="1"
                step="10"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                required
              />
              <p className="text-xs text-gray-400 mt-1">Total disk space allowed</p>
            </div>

            {/* Max VMs */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Max VMs <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.max_vms}
                onChange={(e) => setFormData({ ...formData, max_vms: parseInt(e.target.value) || 0 })}
                min="1"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                required
              />
              <p className="text-xs text-gray-400 mt-1">Maximum number of VMs</p>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Apply to VMs with Tags (Optional)
            </label>
            <p className="text-xs text-gray-400 mb-3">
              Leave empty to apply globally, or specify tags to limit quota to tagged VMs
            </p>

            {/* Current Tags */}
            {formData.tags && formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 rounded-full text-sm font-medium"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:bg-black/20 rounded-full p-0.5 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Add Tag Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter tag name..."
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleAddTag}
                disabled={!tagInput.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Tag
              </button>
            </div>
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
              Enable quota immediately
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
              {creating ? 'Creating...' : 'Create Quota'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
