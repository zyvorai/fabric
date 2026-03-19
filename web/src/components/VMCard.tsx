import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router'
import { Play, Square, Pause, Trash2, Terminal, Cpu, HardDrive, Copy, Tag, MoreVertical, ExternalLink } from 'lucide-react'
import { VM } from '../api/vm'
import { useVMActions } from '../hooks/useVMActions'
import { getTagColor } from './TagEditor'
import { StatusBadge } from './ui'
import CloneVMDialog from './CloneVMDialog'
import ConfirmDialog from './ConfirmDialog'
import TagEditor from './TagEditor'

interface VMCardProps {
  vm: VM
  onUpdate: () => void
}

export default function VMCard({ vm, onUpdate }: VMCardProps) {
  const [showCloneDialog, setShowCloneDialog] = useState(false)
  const [showTagEditor, setShowTagEditor] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { handleStart, handleStop, handlePause, handleResume, handleDelete } = useVMActions(vm.name, onUpdate)

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu])

  const confirmDelete = async () => {
    setShowDeleteConfirm(false)
    await handleDelete()
  }

  return (
    <>
      <div
        className={`group bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 card-hover gradient-border state-bar state-bar-${vm.state} overflow-hidden`}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-start justify-between mb-3">
            <div className="min-w-0 flex-1">
              <Link
                to={`/vms/${vm.name}`}
                className="text-base font-semibold text-white hover:text-blue-400 transition-colors truncate block"
              >
                {vm.name}
              </Link>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{vm.image}</p>
            </div>
            <div className="flex items-center gap-1.5 ml-3">
              <StatusBadge status={vm.state} />
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-white/5 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-20">
                    <Link
                      to={`/vms/${vm.name}`}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View Details
                    </Link>
                    <Link
                      to={`/vms/${vm.name}/console`}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      Open Console
                    </Link>
                    <button
                      onClick={() => { setShowMenu(false); setShowCloneDialog(true) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Clone VM
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); setShowTagEditor(true) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      <Tag className="w-3.5 h-3.5" />
                      Manage Tags
                    </button>
                    <div className="border-t border-gray-700 my-1" />
                    <button
                      onClick={() => { setShowMenu(false); setShowDeleteConfirm(true) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete VM
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Resources */}
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-gray-500" />
              <span>{vm.cpus} vCPU{vm.cpus !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-gray-500" />
              <span>{vm.memory >= 1024 ? `${(vm.memory / 1024).toFixed(1)} GB` : `${vm.memory} MB`}</span>
            </div>
            {vm.ip && (
              <span className="text-gray-500 font-mono text-xs">{vm.ip}</span>
            )}
          </div>
        </div>

        {/* Tags */}
        {vm.tags && vm.tags.length > 0 && (
          <div className="px-5 pb-3">
            <div className="flex flex-wrap gap-1.5">
              {vm.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium ${getTagColor(tag)} text-white/90`}
                >
                  {tag}
                </span>
              ))}
              {vm.tags.length > 3 && (
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-700 text-gray-400">
                  +{vm.tags.length - 3}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 py-3 border-t border-gray-800 bg-gray-900/50 flex items-center gap-2">
          {vm.state === 'stopped' ? (
            <button
              onClick={handleStart}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/15 text-green-400 hover:bg-green-600/25 rounded-md transition-colors text-sm font-medium"
            >
              <Play className="w-3.5 h-3.5" />
              Start
            </button>
          ) : vm.state === 'paused' ? (
            <button
              onClick={handleResume}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/15 text-green-400 hover:bg-green-600/25 rounded-md transition-colors text-sm font-medium"
            >
              <Play className="w-3.5 h-3.5" />
              Resume
            </button>
          ) : (
            <>
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/15 text-red-400 hover:bg-red-600/25 rounded-md transition-colors text-sm font-medium"
              >
                <Square className="w-3.5 h-3.5" />
                Stop
              </button>
              <button
                onClick={handlePause}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600/15 text-yellow-400 hover:bg-yellow-600/25 rounded-md transition-colors text-sm font-medium"
              >
                <Pause className="w-3.5 h-3.5" />
                Pause
              </button>
            </>
          )}
          <Link
            to={`/vms/${vm.name}/console`}
            className="ml-auto p-1.5 rounded-md text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
            title="Open Console"
          >
            <Terminal className="w-4 h-4" />
          </Link>
        </div>
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
    </>
  )
}
