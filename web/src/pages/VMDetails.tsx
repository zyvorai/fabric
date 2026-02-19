import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getVM, startVM, stopVM, restartVM, deleteVM, VM } from '../api/vm'
import { Play, Square, RotateCw, Trash2, ArrowLeft } from 'lucide-react'

export default function VMDetails() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const [vm, setVM] = useState<VM | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (name) {
      loadVM()
      const interval = setInterval(loadVM, 5000)
      return () => clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  const loadVM = async () => {
    if (!name) return
    try {
      const data = await getVM(name)
      setVM(data)
    } catch (error) {
      console.error('Failed to load VM:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStart = async () => {
    if (!name) return
    await startVM(name)
    loadVM()
  }

  const handleStop = async () => {
    if (!name) return
    await stopVM(name)
    loadVM()
  }

  const handleRestart = async () => {
    if (!name) return
    await restartVM(name)
    loadVM()
  }

  const handleDelete = async () => {
    if (!name) return
    if (confirm(`Delete VM ${name}?`)) {
      await deleteVM(name)
      navigate('/vms')
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  if (!vm) {
    return <div className="text-center py-8">VM not found</div>
  }

  return (
    <div>
      <button
        onClick={() => navigate('/vms')}
        className="flex items-center gap-2 mb-6 text-gray-400 hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to VMs
      </button>

      <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">{vm.name}</h1>
            <div className="flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${
                  vm.state === 'running' ? 'bg-green-500' : 'bg-red-500'
                }`}
              ></span>
              <span className="text-lg text-gray-400 capitalize">{vm.state}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8">
          <div>
            <div className="text-sm text-gray-400 mb-1">CPUs</div>
            <div className="text-xl font-semibold">{vm.cpus}</div>
          </div>
          <div>
            <div className="text-sm text-gray-400 mb-1">Memory</div>
            <div className="text-xl font-semibold">{vm.memory}MB</div>
          </div>
          <div>
            <div className="text-sm text-gray-400 mb-1">Image</div>
            <div className="text-xl font-semibold truncate">{vm.image}</div>
          </div>
          {vm.ip && (
            <div>
              <div className="text-sm text-gray-400 mb-1">IP Address</div>
              <div className="text-xl font-semibold">{vm.ip}</div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {vm.state === 'stopped' ? (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition"
            >
              <Play className="w-4 h-4" />
              Start
            </button>
          ) : (
            <>
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
              <button
                onClick={handleRestart}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition"
              >
                <RotateCw className="w-4 h-4" />
                Restart
              </button>
            </>
          )}
          <button
            onClick={handleDelete}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
