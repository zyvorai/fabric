import { Link } from 'react-router-dom'
import { Play, Square, Trash2, Terminal, Cpu, HardDrive } from 'lucide-react'
import { VM, startVM, stopVM, deleteVM } from '../api/vm'

interface VMCardProps {
  vm: VM
  onUpdate: () => void
}

export default function VMCard({ vm, onUpdate }: VMCardProps) {
  const handleStart = async () => {
    await startVM(vm.name)
    onUpdate()
  }

  const handleStop = async () => {
    await stopVM(vm.name)
    onUpdate()
  }

  const handleDelete = async () => {
    if (confirm(`Delete VM ${vm.name}?`)) {
      await deleteVM(vm.name)
      onUpdate()
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

      <div className="flex gap-2">
        {vm.state === 'stopped' ? (
          <button
            onClick={handleStart}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 rounded transition"
          >
            <Play className="w-4 h-4" />
            Start
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 rounded transition"
          >
            <Square className="w-4 h-4" />
            Stop
          </button>
        )}
        <Link
          to={`/vms/${vm.name}/console`}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded transition"
        >
          <Terminal className="w-4 h-4" />
          Console
        </Link>
        <Link
          to={`/vms/${vm.name}`}
          className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded transition"
        >
          Details
        </Link>
        <button
          onClick={handleDelete}
          className="ml-auto flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 rounded transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
