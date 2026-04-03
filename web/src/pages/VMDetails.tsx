import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { getVM, getMetrics, deleteVM, VM, VMMetrics } from '../api/vm'
import {
  Play, Square, RotateCw, Trash2, ArrowLeft, Info, Activity, HardDrive,
  Network, Camera, Terminal, Cpu, MemoryStick, Pause, Copy, Wifi,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useToastContext } from '../contexts/ToastContext'
import { useVMActions } from '../hooks/useVMActions'
import { StatusBadge } from '../components/ui'
import ConfirmDialog from '../components/ConfirmDialog'
import CloneVMDialog from '../components/CloneVMDialog'

type Tab = 'overview' | 'metrics' | 'disks' | 'network' | 'snapshots' | 'logs'

export default function VMDetails() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const toast = useToastContext()
  const [vm, setVM] = useState<VM | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showCloneDialog, setShowCloneDialog] = useState(false)

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

  const { handleStart, handleStop, handleRestart, handlePause, handleResume } = useVMActions(name ?? '', loadVM)

  const confirmDelete = useCallback(async () => {
    if (!name) return
    setShowDeleteConfirm(false)
    try {
      await deleteVM(name)
      toast.success(`VM '${name}' deleted successfully`)
      navigate('/vms')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      toast.error(`Failed to delete VM '${name}': ${msg}`)
    }
  }, [name, toast, navigate])

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-5 w-24 bg-slate-800 rounded" />
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-slate-800 rounded" />
            <div className="h-4 w-32 bg-slate-800 rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-20 bg-slate-800 rounded-lg" />
            <div className="h-9 w-20 bg-slate-800 rounded-lg" />
          </div>
        </div>
        <div className="h-10 bg-slate-800 rounded" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-48 bg-slate-800 rounded-xl" />
          <div className="h-48 bg-slate-800 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!vm) {
    return (
      <div className="text-center py-16">
        <div className="text-slate-600 text-6xl font-bold mb-3">?</div>
        <p className="text-slate-400 mb-4">VM not found</p>
        <Link to="/vms" className="text-sm text-blue-400 hover:text-blue-300">
          Back to Virtual Machines
        </Link>
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'metrics', label: 'Metrics', icon: Activity },
    { id: 'disks', label: 'Disks', icon: HardDrive },
    { id: 'network', label: 'Network', icon: Network },
    { id: 'snapshots', label: 'Snapshots', icon: Camera },
    { id: 'logs', label: 'Logs', icon: Terminal },
  ]

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate('/vms')}
        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors text-sm"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Virtual Machines
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">{vm.name}</h1>
            <StatusBadge status={vm.state} />
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              {vm.cpus} vCPU{vm.cpus !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5">
              <MemoryStick className="w-3.5 h-3.5" />
              {vm.memory >= 1024 ? `${(vm.memory / 1024).toFixed(1)} GB` : `${vm.memory} MB`}
            </span>
            {vm.ip && (
              <span className="flex items-center gap-1.5 font-mono text-xs">
                <Wifi className="w-3.5 h-3.5" />
                {vm.ip}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {vm.state === 'stopped' ? (
            <ActionBtn onClick={handleStart} color="green" icon={Play} label="Start" />
          ) : vm.state === 'paused' ? (
            <ActionBtn onClick={handleResume} color="green" icon={Play} label="Resume" />
          ) : (
            <>
              <ActionBtn onClick={handleStop} color="red" icon={Square} label="Stop" />
              <ActionBtn onClick={handlePause} color="yellow" icon={Pause} label="Pause" />
              <ActionBtn onClick={handleRestart} color="blue" icon={RotateCw} label="Restart" />
            </>
          )}
          <div className="w-px h-6 bg-slate-800 mx-1" />
          <ActionBtn onClick={() => setShowCloneDialog(true)} color="purple" icon={Copy} label="Clone" />
          <Link
            to={`/vms/${vm.name}/console`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-800 border border-slate-700/50 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
          >
            <Terminal className="w-3.5 h-3.5" />
            Console
          </Link>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="Delete VM"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-700/50">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors relative ${
                  isActive
                    ? 'text-blue-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="animate-fade-in">
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
      {showCloneDialog && name && (
        <CloneVMDialog
          vmName={name}
          onClose={() => setShowCloneDialog(false)}
          onSuccess={loadVM}
        />
      )}
    </div>
  )
}

function ActionBtn({ onClick, color, icon: Icon, label }: {
  onClick: () => void
  color: string
  icon: typeof Play
  label: string
}) {
  const colors: Record<string, string> = {
    green: 'bg-green-600/15 text-green-400 hover:bg-green-600/25',
    red: 'bg-red-600/15 text-red-400 hover:bg-red-600/25',
    yellow: 'bg-yellow-600/15 text-yellow-400 hover:bg-yellow-600/25',
    blue: 'bg-blue-600/15 text-blue-400 hover:bg-blue-600/25',
    purple: 'bg-purple-600/15 text-purple-400 hover:bg-purple-600/25',
  }

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${colors[color]}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-700/50/50 last:border-b-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className={`text-sm text-white ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}

function OverviewTab({ vm }: { vm: VM }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-medium text-slate-400 mb-3">Configuration</h3>
        <dl>
          <InfoRow label="Name" value={vm.name} />
          <InfoRow label="State" value={vm.state} />
          <InfoRow label="Image" value={vm.image} mono />
          {vm.ip && <InfoRow label="IP Address" value={vm.ip} mono />}
          {vm.pid && <InfoRow label="PID" value={String(vm.pid)} mono />}
        </dl>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-medium text-slate-400 mb-3">Resources</h3>
        <dl>
          <InfoRow label="vCPUs" value={`${vm.cpus}`} />
          <InfoRow label="Memory" value={vm.memory >= 1024 ? `${(vm.memory / 1024).toFixed(1)} GB` : `${vm.memory} MB`} />
        </dl>

        {vm.tags && vm.tags.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-700/50">
            <span className="text-sm text-slate-500 block mb-2">Tags</span>
            <div className="flex flex-wrap gap-1.5">
              {vm.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-400">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface MetricsPoint { time: string; cpu: number; memory: number; disk_read: number; disk_write: number; net_rx: number; net_tx: number }

function MetricsTab({ vm }: { vm: VM }) {
  const [history, setHistory] = useState<MetricsPoint[]>([])
  const [latest, setLatest] = useState<VMMetrics | null>(null)

  useEffect(() => {
    if (vm.state !== 'running') return
    const load = async () => {
      try {
        const m = await getMetrics(vm.name)
        setLatest(m)
        setHistory((prev) => [...prev.slice(-29), {
          time: new Date().toLocaleTimeString(),
          cpu: parseFloat(m.cpu_usage.toFixed(1)),
          memory: parseFloat(m.memory_usage.toFixed(1)),
          disk_read: m.disk_usage,
          disk_write: m.disk_usage,
          net_rx: m.network_rx,
          net_tx: m.network_tx,
        }])
      } catch { /* running VM may not have metrics yet */ }
    }
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [vm.name, vm.state])

  if (vm.state !== 'running') {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
        <Activity className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Metrics are only available for running VMs</p>
      </div>
    )
  }

  const tooltipStyle = {
    backgroundColor: '#111827',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '0.5rem',
    fontSize: '12px',
  }

  return (
    <div className="space-y-4">
      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricStat label="CPU" value={latest ? `${latest.cpu_usage.toFixed(1)}%` : '--'} color="blue" />
        <MetricStat label="Memory" value={latest ? `${latest.memory_usage.toFixed(1)}%` : '--'} color="emerald" />
        <MetricStat label="Net RX" value={latest ? `${(latest.network_rx / 1024).toFixed(1)} KB/s` : '--'} color="purple" />
        <MetricStat label="Net TX" value={latest ? `${(latest.network_tx / 1024).toFixed(1)} KB/s` : '--'} color="orange" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-medium text-slate-400 mb-3">CPU Usage</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke="rgba(255,255,255,0.1)" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.1)" fontSize={10} tickLine={false} axisLine={false} width={28} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, 'CPU']} />
              <Area type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={1.5} fill="url(#cpuGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Memory Usage</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke="rgba(255,255,255,0.1)" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.1)" fontSize={10} tickLine={false} axisLine={false} width={28} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, 'Memory']} />
              <Area type="monotone" dataKey="memory" stroke="#10b981" strokeWidth={1.5} fill="url(#memGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function MetricStat({ label, value, color }: { label: string; value: string; color: string }) {
  const bgMap: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    purple: 'bg-purple-500/10 text-purple-400',
    orange: 'bg-orange-500/10 text-orange-400',
  }
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${bgMap[color]?.split(' ')[1] || 'text-white'}`}>{value}</div>
    </div>
  )
}

function DisksTab({ vm }: { vm: VM }) {
  const disks = [
    { name: 'vda', path: vm.image, size: '20 GB', format: 'qcow2', bus: 'virtio' },
  ]

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-700/50">
            <th className="py-3 px-5">Device</th>
            <th className="py-3 px-4">Path</th>
            <th className="py-3 px-4">Size</th>
            <th className="py-3 px-4">Format</th>
            <th className="py-3 px-4">Bus</th>
          </tr>
        </thead>
        <tbody>
          {disks.map((disk) => (
            <tr key={disk.name} className="border-t border-slate-700/50/50 hover:bg-white/[0.02] transition-colors">
              <td className="py-3 px-5 font-medium text-white">{disk.name}</td>
              <td className="py-3 px-4 font-mono text-xs text-slate-400 max-w-[300px] truncate">{disk.path}</td>
              <td className="py-3 px-4 text-slate-400">{disk.size}</td>
              <td className="py-3 px-4">
                <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {disk.format.toUpperCase()}
                </span>
              </td>
              <td className="py-3 px-4 text-slate-400">{disk.bus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NetworkTab({ vm }: { vm: VM }) {
  const interfaces = [
    { name: 'eth0', mac: '52:54:00:12:34:56', ip: vm.ip || '192.168.100.10', model: 'virtio-net', state: 'up' },
  ]

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-700/50">
            <th className="py-3 px-5">Interface</th>
            <th className="py-3 px-4">MAC Address</th>
            <th className="py-3 px-4">IP Address</th>
            <th className="py-3 px-4">Model</th>
            <th className="py-3 px-4">State</th>
          </tr>
        </thead>
        <tbody>
          {interfaces.map((iface) => (
            <tr key={iface.name} className="border-t border-slate-700/50/50 hover:bg-white/[0.02] transition-colors">
              <td className="py-3 px-5 font-medium text-white">{iface.name}</td>
              <td className="py-3 px-4 font-mono text-xs text-slate-400">{iface.mac}</td>
              <td className="py-3 px-4 font-mono text-xs text-slate-300">{iface.ip}</td>
              <td className="py-3 px-4 text-slate-400">{iface.model}</td>
              <td className="py-3 px-4">
                <StatusBadge status={iface.state === 'up' ? 'running' : 'stopped'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SnapshotsTab(_props: { vm: VM }) {
  const snapshots = [
    { name: 'before-update', created: '2024-02-18 10:30:00', size: '2.5 GB', type: 'disk-only' },
    { name: 'initial', created: '2024-02-15 14:30:00', size: '1.8 GB', type: 'full' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/15 text-blue-400 hover:bg-blue-600/25 rounded-lg transition-colors text-sm font-medium">
          <Camera className="w-3.5 h-3.5" />
          Create Snapshot
        </button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-700/50">
              <th className="py-3 px-5">Name</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Created</th>
              <th className="py-3 px-4">Size</th>
              <th className="py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((snap) => (
              <tr key={snap.name} className="border-t border-slate-700/50/50 hover:bg-white/[0.02] transition-colors group">
                <td className="py-3 px-5 font-medium text-white">{snap.name}</td>
                <td className="py-3 px-4">
                  <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    {snap.type}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-400">{snap.created}</td>
                <td className="py-3 px-4 text-slate-400 tabular-nums">{snap.size}</td>
                <td className="py-3 px-4">
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="px-2.5 py-1 bg-blue-600/15 text-blue-400 hover:bg-blue-600/25 rounded text-xs font-medium transition-colors">
                      Restore
                    </button>
                    <button className="px-2.5 py-1 bg-red-600/15 text-red-400 hover:bg-red-600/25 rounded text-xs font-medium transition-colors">
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
  )
}

function LogsTab(_props: { vm: VM }) {
  const logs = [
    { time: '14:35:22', level: 'INFO', message: 'VM started successfully' },
    { time: '14:35:15', level: 'INFO', message: 'Initializing network interface eth0' },
    { time: '14:35:10', level: 'INFO', message: 'Loading disk image' },
    { time: '14:35:08', level: 'INFO', message: 'Configuring vCPUs' },
    { time: '14:35:05', level: 'INFO', message: 'Allocating memory' },
  ]

  const levelStyles: Record<string, string> = {
    INFO: 'text-cyan-400',
    WARN: 'text-yellow-400',
    ERROR: 'text-red-400',
    DEBUG: 'text-slate-500',
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="font-mono text-xs">
        {logs.map((log, index) => (
          <div key={index} className="flex gap-4 px-5 py-2 hover:bg-white/[0.02] transition-colors border-b border-slate-700/50/30 last:border-b-0">
            <span className="text-slate-600 shrink-0 tabular-nums">{log.time}</span>
            <span className={`shrink-0 w-12 ${levelStyles[log.level] || 'text-slate-400'}`}>
              {log.level}
            </span>
            <span className="text-slate-300">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
