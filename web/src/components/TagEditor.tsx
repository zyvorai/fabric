import { useState } from 'react'
import { X, Plus, Tag } from 'lucide-react'
import { updateTags } from '../api/vm'
import { useToastContext } from '../contexts/ToastContext'

interface TagEditorProps {
  vmName: string
  currentTags: string[]
  onClose: () => void
  onSuccess: () => void
}

const TAG_COLORS: Record<string, string> = {
  production: 'bg-red-600',
  staging: 'bg-yellow-600',
  development: 'bg-green-600',
  testing: 'bg-blue-600',
  web: 'bg-purple-600',
  database: 'bg-pink-600',
  backend: 'bg-indigo-600',
  frontend: 'bg-cyan-600',
  default: 'bg-gray-600',
}

export function getTagColor(tag: string): string {
  const normalizedTag = tag.toLowerCase()
  return TAG_COLORS[normalizedTag] || TAG_COLORS.default
}

export default function TagEditor({ vmName, currentTags, onClose, onSuccess }: TagEditorProps) {
  const toast = useToastContext()
  const [tags, setTags] = useState<string[]>(currentTags || [])
  const [newTag, setNewTag] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAddTag = () => {
    const trimmedTag = newTag.trim()
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag])
      setNewTag('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateTags(vmName, tags)
      toast.success('Tags updated successfully')
      onSuccess()
      onClose()
    } catch (_error) {
      toast.error('Failed to update tags')
    } finally {
      setSaving(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  const commonTags = ['production', 'staging', 'development', 'testing', 'web', 'database', 'backend', 'frontend']
  const suggestedTags = commonTags.filter(tag => !tags.includes(tag))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Tag className="w-6 h-6 text-blue-500" />
            <div>
              <h2 className="text-xl font-bold">Manage Tags</h2>
              <p className="text-sm text-gray-400">VM: {vmName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Current Tags */}
          <div>
            <label className="block text-sm font-medium mb-3">Current Tags</label>
            {tags.length === 0 ? (
              <div className="text-center py-8 bg-gray-900 rounded-lg border border-gray-700">
                <p className="text-gray-400">No tags assigned</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${getTagColor(tag)}`}
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:bg-black/20 rounded-full p-0.5 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Add Tag */}
          <div>
            <label className="block text-sm font-medium mb-3">Add New Tag</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter tag name..."
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleAddTag}
                disabled={!newTag.trim() || tags.includes(newTag.trim())}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          </div>

          {/* Suggested Tags */}
          {suggestedTags.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-3">Suggested Tags</label>
              <div className="flex flex-wrap gap-2">
                {suggestedTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setTags([...tags, tag])}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium ${getTagColor(tag)} hover:opacity-80 transition`}
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700 bg-gray-750">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Tags'}
          </button>
        </div>
      </div>
    </div>
  )
}
