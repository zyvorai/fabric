// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { getVM, getMetrics, deleteVM, addPortForward, VM, VMMetrics } from '../api/vm'
import { listSnapshots, createSnapshot, deleteSnapshot, revertSnapshot, VMSnapshot } from '../api/snapshots'
import { listAuditLogs, AuditLog } from '../api/audit'
import { getMachineProperties } from '../api/machines'
import {
  Play, Square, RotateCw, Trash2, Info, Activity, HardDrive,
  Network, Camera, Terminal, Cpu, MemoryStick, Pause, Copy, Wifi,
  AlertCircle, Loader2, RefreshCw, Plus, Plug, Usb, Cloud,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useToastContext } from '../contexts/ToastContext'
import { useVMActions } from '../hooks/useVMActions'
import { StatusBadge } from '../components/ui'
import ConfirmDialog from '../components/ConfirmDialog'
import CloneVMDialog from '../components/CloneVMDialog'
import ErrorBanner from '../components/ErrorBanner'
import CopyButton from '../components/CopyButton'
import { formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { usePermissions } from '../hooks/usePermissions'
import ReadOnlyNotice from '../components/ReadOnlyNotice'
import HotplugTab from './vm-details/HotplugTab'
import DevicesTab from './vm-details/DevicesTab'
import CloudInitTab from './vm-details/CloudInitTab'

type Tab = 'overview' | 'metrics' | 'disks' | 'network' | 'snapshots' | 'logs' | 'hotplug' | 'devices' | 'cloudinit'

export default function VMDetails() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const toast = useToastContext()
  const { canWrite } = usePermissions()
  const [vm, setVM] = useState<VM | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
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
    setLoadError(null)
    try {
      const data = await getVM(name)
      setVM(data)
    } catch (error) {
      const msg = formatUserError(error)
      setLoadError(msg)
      setVM((prev) => {
        if (prev == null) toastFailure(toast, `Failed to load VM '${name}'`, error)
        return prev
      })
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
      toastFailure(toast, `Failed to delete VM '${name}'`, error)
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
      <div className="space-y-4">
        {loadError && (
          <ErrorBanner
            title="Could not load VM"
            headline={loadError}
            hints={hintsForError(loadError, 'vm')}
            onRetry={loadVM}
            tone="red"
          />
        )}
        <div className="text-center py-16">
          <div className="text-slate-600 text-6xl font-bold mb-3">?</div>
          <p className="text-slate-400 mb-4">{loadError ? 'VM unavailable' : 'VM not found'}</p>
          <Link to="/vms" className="text-sm text-blue-400 hover:text-blue-300">
            Back to Virtual Machines
          </Link>
        </div>
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'metrics', label: 'Metrics', icon: Activity },
    { id: 'disks', label: 'Disks', icon: HardDrive },
    { id: 'network', label: 'Network', icon: Network },
    { id: 'snapshots', label: 'Snapshots', icon: Camera },
    { id: 'hotplug', label: 'Hotplug', icon: Plug },
    { id: 'devices', label: 'Devices', icon: Usb },
    { id: 'cloudinit', label: 'Cloud-init', icon: Cloud },
    { id: 'logs', label: 'Logs', icon: Terminal },
  ]

  return (
    <div className="space-y-6">
      {!canWrite && <ReadOnlyNotice />}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{vm.name}</h1>
            <StatusBadge status={vm.state} />
            <CopyButton text={vm.name} label="Copy name" successMessage="VM name copied" />
            <CopyButton
              text={`/api/v1/vms/${vm.name}`}
              label="API path"
              successMessage="API path copied"
            />
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
          {canWrite && (
            <>
              {vm.state === 'stopped' || vm.state === 'failed' ? (
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
            </>
          )}
          <Link
            to={`/vms/${vm.name}/console`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-800 border border-slate-700/50 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
          >
            <Terminal className="w-3.5 h-3.5" />
            Console
          </Link>
          {canWrite && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="Delete VM"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
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
        {activeTab === 'network' && <NetworkTab vm={vm} onUpdated={loadVM} />}
        {activeTab === 'snapshots' && <SnapshotsTab vm={vm} />}
        {activeTab === 'hotplug' && <HotplugTab vm={vm} />}
        {activeTab === 'devices' && <DevicesTab vm={vm} />}
        {activeTab === 'cloudinit' && <CloudInitTab vm={vm} />}
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
        // memory_usage is raw bytes, not a percentage (unlike cpu_usage) —
        // express it as a percentage of this VM's own allocated memory
        // (vm.memory, in MiB) so it's on the same 0-100 chart scale as CPU.
        const memoryPct = vm.memory > 0 ? (m.memory_usage / (vm.memory * 1024 * 1024)) * 100 : 0
        setHistory((prev) => [...prev.slice(-29), {
          time: new Date().toLocaleTimeString(),
          cpu: parseFloat(m.cpu_usage.toFixed(1)),
          memory: parseFloat(memoryPct.toFixed(1)),
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
        <MetricStat label="Memory" value={latest && vm.memory > 0 ? `${((latest.memory_usage / (vm.memory * 1024 * 1024)) * 100).toFixed(1)}%` : '--'} color="emerald" />
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
  const [properties, setProperties] = useState<Record<string, string> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const props = await getMachineProperties(vm.name)
        if (!cancelled) setProperties(props)
      } catch (err) {
        if (!cancelled) setError(formatUserError(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [vm.name])

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
        <Loader2 className="w-6 h-6 text-slate-500 mx-auto mb-2 animate-spin" />
        <p className="text-slate-500 text-sm">Loading disk information...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
        <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  const rootImage = properties?.['RootDirectory'] || properties?.['RootImage'] || vm.image
  const format = rootImage?.endsWith('.raw') ? 'raw' : rootImage?.endsWith('.qcow2') ? 'qcow2' : 'image'

  const disks: { name: string; path: string; size: string; format: string; bus: string }[] = []

  if (rootImage) {
    disks.push({
      name: 'vda',
      path: rootImage,
      size: properties?.['DiskSize'] || '--',
      format,
      bus: 'virtio',
    })
  }

  if (disks.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
        <HardDrive className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">No disk information available</p>
        {vm.image && (
          <p className="text-slate-600 text-xs mt-2 font-mono">{vm.image}</p>
        )}
      </div>
    )
  }

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

function NetworkTab({ vm, onUpdated }: { vm: VM; onUpdated: () => void }) {
  const [properties, setProperties] = useState<Record<string, string> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const props = await getMachineProperties(vm.name)
        if (!cancelled) setProperties(props)
      } catch (err) {
        if (!cancelled) setError(formatUserError(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [vm.name])

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
        <Loader2 className="w-6 h-6 text-slate-500 mx-auto mb-2 animate-spin" />
        <p className="text-slate-500 text-sm">Loading network information...</p>
      </div>
    )
  }

  if (error) {
    // Only live interface info (driver properties) failed to load -- the
    // VM's own stored config (port forwards) is independent of that and
    // should still be manageable, e.g. for a never-started VM with no
    // Ephemera-side instance yet to query properties from.
    return (
      <div className="space-y-6">
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
          <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
        <PortForwardsSection vm={vm} onUpdated={onUpdated} />
      </div>
    )
  }

  return <NetworkTabContent vm={vm} properties={properties} onUpdated={onUpdated} />
}

function NetworkTabContent({
  vm,
  properties,
  onUpdated,
}: {
  vm: VM
  properties: Record<string, string> | null
  onUpdated: () => void
}) {
  interface NetworkInterface {
    name: string
    mac: string
    ip: string
    model: string
    state: string
  }

  const interfaces: NetworkInterface[] = []

  const ipAddr = properties?.['IPAddress'] || vm.ip || ''
  const macAddr = properties?.['MACAddress'] || properties?.['HardwareAddress'] || ''
  const netIface = properties?.['NetworkInterface'] || 'eth0'
  const operState = properties?.['OperationalState'] || (vm.state === 'running' ? 'up' : 'down')

  if (ipAddr || macAddr || vm.state === 'running') {
    interfaces.push({
      name: netIface,
      mac: macAddr || '--',
      ip: ipAddr || '--',
      model: properties?.['NetworkModel'] || 'virtio-net',
      state: operState,
    })
  }

  const interfacesSection = interfaces.length === 0 ? (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
      <Network className="w-10 h-10 text-slate-600 mx-auto mb-3" />
      <p className="text-slate-500 text-sm">No network information available</p>
      <p className="text-slate-600 text-xs mt-2">VM is not running or has no network interfaces configured</p>
    </div>
  ) : (
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

  return (
    <div className="space-y-6">
      {interfacesSection}
      <PortForwardsSection vm={vm} onUpdated={onUpdated} />
    </div>
  )
}

function PortForwardsSection({ vm, onUpdated }: { vm: VM; onUpdated: () => void }) {
  const toast = useToastContext()
  const { canWrite } = usePermissions()
  const [showForm, setShowForm] = useState(false)
  const [hostPort, setHostPort] = useState('')
  const [guestPort, setGuestPort] = useState('22')
  const [protocol, setProtocol] = useState<'tcp' | 'udp'>('tcp')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const forwards = vm.port_forwards ?? []

  const handleAdd = async () => {
    const h = parseInt(hostPort)
    const g = parseInt(guestPort)
    if (!hostPort || !Number.isInteger(h) || h < 1 || h > 65535) {
      setFormError('Host port must be between 1 and 65535')
      return
    }
    if (!guestPort || !Number.isInteger(g) || g < 1 || g > 65535) {
      setFormError('Guest port must be between 1 and 65535')
      return
    }
    setSubmitting(true)
    setFormError('')
    try {
      await addPortForward(vm.name, { hostPort: h, guestPort: g, protocol })
      toast.success(
        vm.state === 'running'
          ? `Port ${h} → ${g}/${protocol} exposed — VM restarted to apply it`
          : `Port ${h} → ${g}/${protocol} will be exposed on next start`,
      )
      setShowForm(false)
      setHostPort('')
      setGuestPort('22')
      onUpdated()
    } catch (err) {
      setFormError(formatUserError(err))
      toastFailure(toast, 'Failed to expose port', err)
    } finally {
      setSubmitting(false)
    }
  }

  if (vm.network_tap) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-white mb-1">Bridged Networking</h3>
        <p className="text-xs text-slate-500">
          {vm.network_static_ip
            ? "This VM's IP was configured statically via cloud-init — see the interface table above once it's booted. No port forwards needed."
            : "This VM has its own real, externally-reachable IP via DHCP — see the interface table above once it's booted and leased an address. No port forwards needed."}
        </p>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="p-5 border-b border-slate-700/50 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Exposed Ports</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            This VM uses NAT networking — forwards here are the only way to reach it (e.g. SSH) from outside the host.
          </p>
        </div>
        {canWrite && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700/50 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
          >
            <Plug className="w-3.5 h-3.5" />
            Expose Port
          </button>
        )}
      </div>

      {showForm && (
        <div className="p-5 border-b border-slate-700/50 bg-slate-900/40 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={hostPort}
              onChange={(e) => setHostPort(e.target.value)}
              placeholder="Host port"
              min={1}
              max={65535}
              className="w-28 px-2.5 py-1.5 bg-slate-800 border border-slate-700/50 rounded-md text-sm text-white focus:outline-none focus:border-blue-500/50"
            />
            <span className="text-slate-500 text-sm">→</span>
            <input
              type="number"
              value={guestPort}
              onChange={(e) => setGuestPort(e.target.value)}
              placeholder="Guest port"
              min={1}
              max={65535}
              className="w-28 px-2.5 py-1.5 bg-slate-800 border border-slate-700/50 rounded-md text-sm text-white focus:outline-none focus:border-blue-500/50"
            />
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as 'tcp' | 'udp')}
              className="px-2 py-1.5 bg-slate-800 border border-slate-700/50 rounded-md text-sm text-slate-300"
            >
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </select>
          </div>
          {vm.state === 'running' && (
            <p className="text-xs text-amber-400/80">
              This VM is running — adding a forward requires restarting it to apply.
            </p>
          )}
          {formError && <p className="text-red-400 text-sm">{formError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={submitting}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              {submitting ? 'Applying…' : 'Add'}
            </button>
            <button
              onClick={() => { setShowForm(false); setFormError('') }}
              className="px-4 py-1.5 bg-slate-800 border border-slate-700/50 text-slate-300 text-sm rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {forwards.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">No ports exposed.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-700/50">
              <th className="py-3 px-5">Host Port</th>
              <th className="py-3 px-4">Guest Port</th>
              <th className="py-3 px-4">Protocol</th>
            </tr>
          </thead>
          <tbody>
            {forwards.map((f, i) => (
              <tr key={i} className="border-t border-slate-700/50 hover:bg-white/[0.02] transition-colors">
                <td className="py-3 px-5 font-mono text-white">{f.host_port}</td>
                <td className="py-3 px-4 font-mono text-slate-300">{f.guest_port}</td>
                <td className="py-3 px-4">
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
                    {f.protocol}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function SnapshotsTab({ vm }: { vm: VM }) {
  const toast = useToastContext()
  const [snapshots, setSnapshots] = useState<VMSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newType, setNewType] = useState<'Disk' | 'Full'>('Full')
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  const loadSnapshots = useCallback(async () => {
    try {
      const data = await listSnapshots(vm.name)
      setSnapshots(data)
      setError(null)
    } catch (err) {
      setError(formatUserError(err))
    } finally {
      setLoading(false)
    }
  }, [vm.name])

  useEffect(() => {
    loadSnapshots()
  }, [loadSnapshots])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await createSnapshot(vm.name, {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        snapshot_type: newType,
      })
      toast.success(`Snapshot '${newName}' created`)
      setShowCreateForm(false)
      setNewName('')
      setNewDescription('')
      setNewType('Full')
      await loadSnapshots()
    } catch (err) {
      toastFailure(toast, 'Failed to create snapshot', err)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (snap: VMSnapshot) => {
    setActionInProgress(snap.id)
    try {
      await deleteSnapshot(vm.name, snap.id)
      toast.success(`Snapshot '${snap.name}' deleted`)
      await loadSnapshots()
    } catch (err) {
      toastFailure(toast, 'Failed to delete snapshot', err)
    } finally {
      setActionInProgress(null)
    }
  }

  const handleRevert = async (snap: VMSnapshot) => {
    setActionInProgress(snap.id)
    try {
      await revertSnapshot(vm.name, snap.id)
      toast.success(`Reverted to snapshot '${snap.name}'`)
    } catch (err) {
      toastFailure(toast, 'Failed to revert snapshot', err)
    } finally {
      setActionInProgress(null)
    }
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
        <Loader2 className="w-6 h-6 text-slate-500 mx-auto mb-2 animate-spin" />
        <p className="text-slate-500 text-sm">Loading snapshots...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
        <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
        <p className="text-red-400 text-sm mb-3">{error}</p>
        <button
          onClick={() => { setLoading(true); loadSnapshots() }}
          className="flex items-center gap-1.5 mx-auto px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <button
          onClick={() => { setLoading(true); loadSnapshots() }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-slate-300 text-sm transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/15 text-blue-400 hover:bg-blue-600/25 rounded-lg transition-colors text-sm font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Snapshot
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5 space-y-3">
          <h3 className="text-sm font-medium text-slate-300">New Snapshot</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="snapshot-name"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as 'Disk' | 'Full')}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="Full">Full</option>
                <option value="Disk">Disk Only</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Description (optional)</label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description of this snapshot"
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowCreateForm(false); setNewName(''); setNewDescription('') }}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {snapshots.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
          <Camera className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No snapshots found</p>
          <p className="text-slate-600 text-xs mt-1">Create a snapshot to save the current state of this VM</p>
        </div>
      ) : (
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
                <tr key={snap.id} className="border-t border-slate-700/50/50 hover:bg-white/[0.02] transition-colors group">
                  <td className="py-3 px-5">
                    <div className="font-medium text-white">{snap.name}</div>
                    {snap.description && (
                      <div className="text-xs text-slate-500 mt-0.5">{snap.description}</div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      {snap.snapshot_type === 'Disk' ? 'disk-only' : 'full'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-400">{new Date(snap.created).toLocaleString()}</td>
                  <td className="py-3 px-4 text-slate-400 tabular-nums">{formatSize(snap.size_bytes)}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleRevert(snap)}
                        disabled={actionInProgress === snap.id}
                        className="px-2.5 py-1 bg-blue-600/15 text-blue-400 hover:bg-blue-600/25 disabled:opacity-50 rounded text-xs font-medium transition-colors"
                      >
                        {actionInProgress === snap.id ? 'Working...' : 'Restore'}
                      </button>
                      <button
                        onClick={() => handleDelete(snap)}
                        disabled={actionInProgress === snap.id}
                        className="px-2.5 py-1 bg-red-600/15 text-red-400 hover:bg-red-600/25 disabled:opacity-50 rounded text-xs font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LogsTab({ vm }: { vm: VM }) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadLogs = useCallback(async () => {
    try {
      const data = await listAuditLogs({ resource_name: vm.name, resource_type: 'vm' })
      setLogs(data)
      setError(null)
    } catch (err) {
      setError(formatUserError(err))
    } finally {
      setLoading(false)
    }
  }, [vm.name])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const levelStyles: Record<string, string> = {
    success: 'text-cyan-400',
    failed: 'text-red-400',
  }

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
        <Loader2 className="w-6 h-6 text-slate-500 mx-auto mb-2 animate-spin" />
        <p className="text-slate-500 text-sm">Loading logs...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
        <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
        <p className="text-red-400 text-sm mb-3">{error}</p>
        <button
          onClick={() => { setLoading(true); loadLogs() }}
          className="flex items-center gap-1.5 mx-auto px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
        <Terminal className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">No log entries found for this VM</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => { setLoading(true); loadLogs() }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-slate-300 text-sm transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="font-mono text-xs">
          {logs.map((log) => (
            <div key={log.id} className="flex gap-4 px-5 py-2 hover:bg-white/[0.02] transition-colors border-b border-slate-700/50/30 last:border-b-0">
              <span className="text-slate-600 shrink-0 tabular-nums">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className={`shrink-0 w-16 uppercase ${levelStyles[log.status] || 'text-slate-400'}`}>
                {log.status === 'success' ? 'INFO' : 'ERROR'}
              </span>
              <span className="text-slate-400 shrink-0 w-20">{log.action}</span>
              <span className="text-slate-300">
                {log.details || `${log.action} by ${log.user}`}
                {log.error && <span className="text-red-400 ml-2">({log.error})</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
