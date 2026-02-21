import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getVM, startVM, stopVM, restartVM, deleteVM, pauseVM, resumeVM, cloneVM, VM } from '../api/vm'
import {
  Play, Square, RotateCw, Trash2, ArrowLeft, Info, Activity, HardDrive,
  Network, Camera, Terminal, Cpu, MemoryStick, Clock, Pause, Copy
} from 'lucide-react'
import { useToastContext } from '../contexts/ToastContext'
import ConfirmDialog from '../components/ConfirmDialog'

type Tab = 'overview' | 'metrics' | 'disks' | 'network' | 'snapshots' | 'logs'

export default function VMDetailsEnhanced() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const toast = useToastContext()
  const [vm, setVM] = useState<VM | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showCloneDialog, setShowCloneDialog] = useState(false)
  const [cloneName, setCloneName] = useState('')

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
    try {
      await startVM(name)
      toast.success(`VM '${name}' started successfully`)
      loadVM()
    } catch (_error) {
      toast.error(`Failed to start VM '${name}'`)
    }
  }

  const handleStop = async () => {
    if (!name) return
    try {
      await stopVM(name)
      toast.success(`VM '${name}' stopped successfully`)
      loadVM()
    } catch (_error) {
      toast.error(`Failed to stop VM '${name}'`)
    }
  }

  const handleRestart = async () => {
    if (!name) return
    try {
      await restartVM(name)
      toast.success(`VM '${name}' restarted successfully`)
      loadVM()
    } catch (_error) {
      toast.error(`Failed to restart VM '${name}'`)
    }
  }

  const handlePause = async () => {
    if (!name) return
    try {
      await pauseVM(name)
      toast.success(`VM '${name}' paused successfully`)
      loadVM()
    } catch (_error) {
      toast.error(`Failed to pause VM '${name}'`)
    }
  }

  const handleResume = async () => {
    if (!name) return
    try {
      await resumeVM(name)
      toast.success(`VM '${name}' resumed successfully`)
      loadVM()
    } catch (_error) {
      toast.error(`Failed to resume VM '${name}'`)
    }
  }

  const handleClone = async () => {
    if (!name || !cloneName.trim()) return
    try {
      await cloneVM(name, cloneName)
      toast.success(`VM '${name}' cloned as '${cloneName}'`)
      setShowCloneDialog(false)
      setCloneName('')
    } catch (_error) {
      toast.error(`Failed to clone VM '${name}'`)
    }
  }

  const handleDelete = () => {
    if (!name) return
    setShowDeleteConfirm(true)
  }

  const confirmDelete = async () => {
    if (!name) return
    setShowDeleteConfirm(false)
    try {
      await deleteVM(name)
      toast.success(`VM '${name}' deleted successfully`)
      navigate('/vms')
    } catch (_error) {
      toast.error(`Failed to delete VM '${name}'`)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!vm) {
    return <div className="text-center py-8 text-gray-400">VM not found</div>
  }

  const stateColor = {
    running: 'bg-green-500',
    stopped: 'bg-red-500',
    paused: 'bg-yellow-500',
    unknown: 'bg-gray-500',
  }[vm.state]

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'metrics', label: 'Metrics', icon: Activity },
    { id: 'disks', label: 'Disks', icon: HardDrive },
    { id: 'network', label: 'Network', icon: Network },
    { id: 'snapshots', label: 'Snapshots', icon: Camera },
    { id: 'logs', label: 'Logs', icon: Terminal },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/vms')}
          className="flex items-center gap-2 mb-4 text-gray-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to VMs
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">{vm.name}</h1>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${stateColor}`}></span>
              <span className="text-sm text-gray-400 capitalize">{vm.state}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {vm.state === 'stopped' ? (
              <button
                onClick={handleStart}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition"
              >
                <Play className="w-4 h-4" />
                Start
              </button>
            ) : vm.state === 'paused' ? (
              <button
                onClick={handleResume}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition"
              >
                <Play className="w-4 h-4" />
                Resume
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
                  onClick={handlePause}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded transition"
                >
                  <Pause className="w-4 h-4" />
                  Pause
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
              onClick={() => setShowCloneDialog(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded transition"
            >
              <Copy className="w-4 h-4" />
              Clone
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-700">
        <div className="flex gap-4">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && <OverviewTab vm={vm} />}
        {activeTab === 'metrics' && <MetricsTab vm={vm} />}
        {activeTab === 'disks' && <DisksTab vm={vm} />}
        {activeTab === 'network' && <NetworkTab vm={vm} />}
        {activeTab === 'snapshots' && <SnapshotsTab vm={vm} />}
        {activeTab === 'logs' && <LogsTab vm={vm} />}
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Virtual Machine"
          message={`Are you sure you want to delete VM '${name}'? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showCloneDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-700">
              <h2 className="text-xl font-bold">Clone VM</h2>
              <button onClick={() => { setShowCloneDialog(false); setCloneName('') }} className="p-2 hover:bg-gray-700 rounded transition">
                <span className="text-2xl">&times;</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Source VM</label>
                <input type="text" value={name} disabled className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-gray-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">New VM Name</label>
                <input
                  type="text"
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  placeholder="Enter clone name"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-6 border-t border-gray-700">
              <button onClick={() => { setShowCloneDialog(false); setCloneName('') }} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition">Cancel</button>
              <button onClick={handleClone} disabled={!cloneName.trim()} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition disabled:opacity-50">Clone</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function OverviewTab({ vm }: { vm: VM }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Basic Info */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-gray-400">Name</dt>
            <dd className="text-white font-medium">{vm.name}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-400">State</dt>
            <dd className="text-white font-medium capitalize">{vm.state}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-400">Image</dt>
            <dd className="text-white font-medium font-mono text-sm">{vm.image}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-400">Created</dt>
            <dd className="text-white font-medium">2024-02-15 14:30:00</dd>
          </div>
        </dl>
      </div>

      {/* Resources */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4">Resources</h3>
        <dl className="space-y-3">
          <div className="flex items-center justify-between">
            <dt className="text-sm text-gray-400 flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              CPUs
            </dt>
            <dd className="text-white font-medium">{vm.cpus}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-sm text-gray-400 flex items-center gap-2">
              <MemoryStick className="w-4 h-4" />
              Memory
            </dt>
            <dd className="text-white font-medium">{vm.memory} MB</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-sm text-gray-400 flex items-center gap-2">
              <HardDrive className="w-4 h-4" />
              Disk
            </dt>
            <dd className="text-white font-medium">20 GB</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-sm text-gray-400 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Uptime
            </dt>
            <dd className="text-white font-medium">2 days, 5 hours</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

function MetricsTab(_: { vm: VM }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-sm text-gray-400 mb-2">CPU Usage</div>
          <div className="text-3xl font-bold text-cyan-400">45.2%</div>
          <div className="text-xs text-gray-500 mt-1">2 of 4 cores</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-sm text-gray-400 mb-2">Memory Usage</div>
          <div className="text-3xl font-bold text-green-400">62.7%</div>
          <div className="text-xs text-gray-500 mt-1">2.5 of 4 GB</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-sm text-gray-400 mb-2">Disk I/O</div>
          <div className="text-3xl font-bold text-purple-400">125 MB/s</div>
          <div className="text-xs text-gray-500 mt-1">Read: 80 | Write: 45</div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4">Resource History</h3>
        <p className="text-gray-400">Charts would be rendered here using Recharts</p>
      </div>
    </div>
  )
}

function DisksTab(_: { vm: VM }) {
  const disks = [
    { name: 'vda', path: '/var/lib/vmspawnd/images/vm1.qcow2', size: '20 GB', format: 'qcow2' },
  ]

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="text-left p-4 font-medium text-gray-300">Device</th>
              <th className="text-left p-4 font-medium text-gray-300">Path</th>
              <th className="text-left p-4 font-medium text-gray-300">Size</th>
              <th className="text-left p-4 font-medium text-gray-300">Format</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {disks.map((disk) => (
              <tr key={disk.name} className="hover:bg-gray-700 transition">
                <td className="p-4 font-medium">{disk.name}</td>
                <td className="p-4 font-mono text-sm text-gray-400">{disk.path}</td>
                <td className="p-4">{disk.size}</td>
                <td className="p-4">
                  <span className="px-3 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-full text-xs font-medium">
                    {disk.format.toUpperCase()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NetworkTab(_: { vm: VM }) {
  const interfaces = [
    { name: 'eth0', mac: '52:54:00:12:34:56', ip: '192.168.100.10', bridge: 'br0', state: 'UP' },
  ]

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="text-left p-4 font-medium text-gray-300">Interface</th>
              <th className="text-left p-4 font-medium text-gray-300">MAC Address</th>
              <th className="text-left p-4 font-medium text-gray-300">IP Address</th>
              <th className="text-left p-4 font-medium text-gray-300">Bridge</th>
              <th className="text-left p-4 font-medium text-gray-300">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {interfaces.map((iface) => (
              <tr key={iface.name} className="hover:bg-gray-700 transition">
                <td className="p-4 font-medium">{iface.name}</td>
                <td className="p-4 font-mono text-sm text-gray-400">{iface.mac}</td>
                <td className="p-4 font-mono text-sm">{iface.ip}</td>
                <td className="p-4">{iface.bridge}</td>
                <td className="p-4">
                  <span className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    {iface.state}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SnapshotsTab(_: { vm: VM }) {
  const snapshots = [
    { name: 'before-update', created: '2024-02-18 10:30:00', size: '2.5 GB' },
    { name: 'initial', created: '2024-02-15 14:30:00', size: '1.8 GB' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition">
          <Camera className="w-4 h-4" />
          Create Snapshot
        </button>
      </div>

      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4 font-medium text-gray-300">Name</th>
                <th className="text-left p-4 font-medium text-gray-300">Created</th>
                <th className="text-left p-4 font-medium text-gray-300">Size</th>
                <th className="text-left p-4 font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {snapshots.map((snapshot) => (
                <tr key={snapshot.name} className="hover:bg-gray-700 transition">
                  <td className="p-4 font-medium">{snapshot.name}</td>
                  <td className="p-4 text-gray-400">{snapshot.created}</td>
                  <td className="p-4">{snapshot.size}</td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <button className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm transition">
                        Restore
                      </button>
                      <button className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function LogsTab(_: { vm: VM }) {
  const logs = [
    { time: '14:35:22', level: 'INFO', message: 'VM started successfully' },
    { time: '14:35:15', level: 'INFO', message: 'Initializing network interface eth0' },
    { time: '14:35:10', level: 'INFO', message: 'Loading disk image' },
  ]

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
      <div className="space-y-2 font-mono text-sm">
        {logs.map((log, index) => (
          <div key={index} className="flex gap-4 p-2 hover:bg-gray-700 rounded transition">
            <span className="text-gray-500">{log.time}</span>
            <span className={log.level === 'INFO' ? 'text-cyan-400' : 'text-red-400'}>
              {log.level}
            </span>
            <span className="text-gray-300 flex-1">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
