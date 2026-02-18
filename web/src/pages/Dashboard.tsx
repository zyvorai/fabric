import { useEffect, useState } from 'react'
import { listVMs, VM } from '../api/vm'
import { Server, Play, Square } from 'lucide-react'

export default function Dashboard() {
  const [vms, setVMs] = useState<VM[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadVMs()
    const interval = setInterval(loadVMs, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadVMs = async () => {
    try {
      const data = await listVMs()
      setVMs(data)
    } catch (error) {
      console.error('Failed to load VMs:', error)
    } finally {
      setLoading(false)
    }
  }

  const stats = {
    total: vms.length,
    running: vms.filter((vm) => vm.state === 'running').length,
    stopped: vms.filter((vm) => vm.state === 'stopped').length,
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-4">
            <Server className="w-12 h-12 text-blue-500" />
            <div>
              <div className="text-3xl font-bold">{stats.total}</div>
              <div className="text-gray-400">Total VMs</div>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-4">
            <Play className="w-12 h-12 text-green-500" />
            <div>
              <div className="text-3xl font-bold">{stats.running}</div>
              <div className="text-gray-400">Running</div>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-4">
            <Square className="w-12 h-12 text-red-500" />
            <div>
              <div className="text-3xl font-bold">{stats.stopped}</div>
              <div className="text-gray-400">Stopped</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold mb-4">Recent VMs</h2>
        {vms.length === 0 ? (
          <p className="text-gray-400">No VMs yet. Create one to get started!</p>
        ) : (
          <div className="space-y-2">
            {vms.slice(0, 5).map((vm) => (
              <div
                key={vm.name}
                className="flex items-center justify-between p-4 bg-gray-700 rounded"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      vm.state === 'running' ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  ></div>
                  <span className="font-medium">{vm.name}</span>
                </div>
                <div className="text-sm text-gray-400">
                  {vm.cpus} CPUs, {vm.memory}MB
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
