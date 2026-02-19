import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Play, Square, Trash2, Terminal, Cpu, HardDrive, Copy, Tag } from 'lucide-react'
import { VM, startVM, stopVM, deleteVM } from '../api/vm'
import { useToastContext } from '../contexts/ToastContext'
import CloneVMDialog from './CloneVMDialog'
import ConfirmDialog from './ConfirmDialog'
import TagEditor, { getTagColor } from './TagEditor'

interface VMCardProps {
  vm: VM
  onUpdate: () => void
}

export default function VMCard({ vm, onUpdate }: VMCardProps) {
  const toast = useToastContext()
  const [showCloneDialog, setShowCloneDialog] = useState(false)
  const [showTagEditor, setShowTagEditor] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleStart = async () => {
    try {
      await startVM(vm.name)
      toast.success(`VM '${vm.name}' started successfully`)
      onUpdate()
    } catch (error) {
      toast.error(`Failed to start VM '${vm.name}'`)
    }
  }

  const handleStop = async () => {
    try {
      await stopVM(vm.name)
      toast.success(`VM '${vm.name}' stopped successfully`)
      onUpdate()
    } catch (error) {
      toast.error(`Failed to stop VM '${vm.name}'`)
    }
  }

  const handleDelete = async () => {
    setShowDeleteConfirm(true)
  }

  const confirmDelete = async () => {
    setShowDeleteConfirm(false)
    try {
      await deleteVM(vm.name)
      toast.success(`VM '${vm.name}' deleted successfully`)
      onUpdate()
    } catch (error) {
      toast.error(`Failed to delete VM '${vm.name}'`)
    }
  }

  const stateColor = {
    running: 'bg-green-500',
    stopped: 'bg-red-500',
    paused: 'bg-yellow-500',
    unknown: 'bg-gray-500',
  }[vm.state]

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold mb-2">{vm.name}</h3>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${stateColor}`}></span>
            <span className="text-sm text-gray-400 capitalize">{vm.state}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-gray-400" />
          <span>{vm.cpus} CPUs</span>
        </div>
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-gray-400" />
          <span>{vm.memory}MB</span>
        </div>
      </div>

      {/* Tags */}
      {vm.tags && vm.tags.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {vm.tags.map((tag) => (
              <span
                key={tag}
                className={`px-2 py-1 rounded-full text-xs font-medium ${getTagColor(tag)}`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {vm.state === 'stopped' ? (
          <button
            onClick={handleStart}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 rounded transition text-sm"
          >
            <Play className="w-4 h-4" />
            Start
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 rounded transition text-sm"
          >
            <Square className="w-4 h-4" />
            Stop
          </button>
        )}
        <button
          onClick={() => setShowCloneDialog(true)}
          className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded transition text-sm"
        >
          <Copy className="w-4 h-4" />
          Clone
        </button>
        <button
          onClick={() => setShowTagEditor(true)}
          className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded transition text-sm"
        >
          <Tag className="w-4 h-4" />
          Tags
        </button>
        <Link
          to={`/vms/${vm.name}/console`}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded transition text-sm"
        >
          <Terminal className="w-4 h-4" />
        </Link>
        <Link
          to={`/vms/${vm.name}`}
          className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded transition text-sm"
        >
          Details
        </Link>
        <button
          onClick={handleDelete}
          className="ml-auto flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 rounded transition text-sm"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {showCloneDialog && (
        <CloneVMDialog
          vmName={vm.name}
          onClose={() => setShowCloneDialog(false)}
          onSuccess={onUpdate}
        />
      )}

      {showTagEditor && (
        <TagEditor
          vmName={vm.name}
          currentTags={vm.tags || []}
          onClose={() => setShowTagEditor(false)}
          onSuccess={onUpdate}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Virtual Machine"
          message={`Are you sure you want to delete VM '${vm.name}'? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}
