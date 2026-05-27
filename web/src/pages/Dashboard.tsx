// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useEffect, useState, useCallback } from 'react'
import { listVMs, getMetrics, VM, VMMetrics } from '../api/vm'
import { Activity, Server, Cpu, HardDrive, TrendingUp, ArrowUpRight, Power } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useWebSocketContext } from '../contexts/WebSocketContext'
import { useToastContext } from '../contexts/ToastContext'
import { SkeletonDashboard } from '../components/Skeleton'
import { StatusBadge } from '../components/ui'
import { Link } from 'react-router'
import ErrorBanner from '../components/ErrorBanner'
import { formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { PageHeader } from '../components/ui/PageHeader'
import { usePlatformInfo } from '../contexts/PlatformInfoContext'
import type { SubsystemPhase } from '../api/capabilities'

interface MetricsPoint { time: string; cpu: number; memory: number }

function subsystemPhaseStyle(phase: SubsystemPhase | undefined): { label: string; className: string } {
  switch (phase) {
    case 'live':
      return { label: 'Live', className: 'text-emerald-400' }
    case 'unreachable':
      return { label: 'Unreachable', className: 'text-amber-400' }
    case 'off':
      return { label: 'Off', className: 'text-slate-500' }
    default:
      return { label: 'Checking…', className: 'text-slate-400' }
  }
}

const DARK_TOOLTIP_STYLE = {
  backgroundColor: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#e2e8f0',
}

export default function Dashboard() {
  const [vms, setVMs] = useState<VM[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [metricsHistory, setMetricsHistory] = useState<MetricsPoint[]>([])
  const { subscribe, vmUpdates } = useWebSocketContext()
  const toast = useToastContext()
  const { capabilities, loading: capsLoading } = usePlatformInfo()

  const loadVMs = useCallback(async () => {
    setLoadError(null)
    try {
      setVMs(await listVMs())
    } catch (err) {
      const msg = formatUserError(err)
      setLoadError(msg)
      toastFailure(toast, 'Failed to load virtual machines', err)
    } finally {
      setLoading(false)
    }
  }, [toast])

  const loadMetrics = useCallback(async () => {
    try {
      const currentVMs = await listVMs()
      const running = currentVMs.filter((vm) => vm.state === 'running')
      if (running.length === 0) {
        setMetricsHistory((prev) => [...prev.slice(-29), { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), cpu: 0, memory: 0 }])
        return
      }
      const results = await Promise.allSettled(running.map((vm) => getMetrics(vm.name)))
      const metrics = results.filter((r): r is PromiseFulfilledResult<VMMetrics> => r.status === 'fulfilled').map((r) => r.value)
      const avgCpu = metrics.length > 0 ? metrics.reduce((s, m) => s + m.cpu_usage, 0) / metrics.length : 0
      const avgMem = metrics.length > 0 ? metrics.reduce((s, m) => s + m.memory_usage, 0) / metrics.length : 0
      setMetricsHistory((prev) => [...prev.slice(-29), { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), cpu: parseFloat(avgCpu.toFixed(1)), memory: parseFloat(avgMem.toFixed(1)) }])
    } catch (err) { toastFailure(toast, 'Failed to load metrics', err) }
  }, [toast])

  useEffect(() => { loadVMs(); loadMetrics(); const i = setInterval(loadMetrics, 10000); return () => clearInterval(i) }, [loadVMs, loadMetrics])
  useEffect(() => { const unsub = subscribe((msg) => { if (['vm_state_changed', 'vm_created', 'vm_deleted'].includes(msg.type)) loadVMs() }); return unsub }, [subscribe, loadVMs])
  useEffect(() => { if (vmUpdates.size > 0) setVMs((prev) => prev.map((vm) => { const u = vmUpdates.get(vm.name); return u ? { ...vm, ...u } : vm })) }, [vmUpdates])

  const stats = {
    total: vms.length,
    running: vms.filter((v) => v.state === 'running').length,
    stopped: vms.filter((v) => v.state === 'stopped').length,
    paused: vms.filter((v) => v.state === 'paused').length,
    totalCPU: vms.reduce((a, v) => a + v.cpus, 0),
    totalMem: vms.reduce((a, v) => a + v.memory, 0),
  }

  if (loading) return <SkeletonDashboard />

  const latestCpu = metricsHistory.length > 0 ? metricsHistory[metricsHistory.length - 1].cpu : 0
  const latestMem = metricsHistory.length > 0 ? metricsHistory[metricsHistory.length - 1].memory : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="vmspawnd"
        description="Virtual machine infrastructure overview"
        onRefresh={loadVMs}
        refreshing={loading}
        primaryAction={
          <Link
            to="/create"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Create VM
          </Link>
        }
      />

      {loadError && (
        <ErrorBanner
          title="Could not load dashboard"
          headline={loadError}
          hints={hintsForError(loadError)}
          onRetry={loadVMs}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {(
          [
            {
              title: 'systemd-machined',
              subtitle: 'VM registration and lifecycle',
              status: capabilities?.machined,
            },
            {
              title: 'Storage',
              subtitle: 'Pools and disk images',
              status: capabilities?.storage,
            },
            {
              title: 'Network security',
              subtitle: 'Firewall, DNS, VPN policies',
              status: capabilities?.network_security,
            },
            {
              title: 'Authentication',
              subtitle: 'JWT and user database',
              status: capabilities?.auth,
            },
            {
              title: 'Events',
              subtitle: 'Live SSE broadcast',
              status: capabilities?.events,
            },
          ] as const
        ).map(({ title, subtitle, status }) => {
          const phase = subsystemPhaseStyle(status?.phase)
          return (
            <div key={title} className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
              <p className={`text-sm mt-2 font-medium ${phase.className}`}>
                {capsLoading && !capabilities ? '…' : phase.label}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {status?.detail || subtitle}
              </p>
            </div>
          )
        })}
      </div>

      {/* Stat Cards - matching hypersdk exactly */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total VMs - Blue */}
        <div className="stat-card-blue rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Server className="h-5 w-5 text-white" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">total</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.total}</div>
          <div className="text-xs text-slate-400 mt-1">Total VMs</div>
        </div>

        {/* Running - Green */}
        <div className="stat-card-green rounded-xl border border-slate-700/50 p-5 card-glow-green transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-green-500/20">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
              {stats.total > 0 ? `${Math.round((stats.running / stats.total) * 100)}%` : '0%'}
            </span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.running}</div>
          <div className="text-xs text-slate-400 mt-1">Running</div>
        </div>

        {/* Stopped - Red */}
        <div className="stat-card-red rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/20">
              <Power className="h-5 w-5 text-white" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">stopped</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.stopped}</div>
          <div className="text-xs text-slate-400 mt-1">Stopped</div>
        </div>

        {/* Resources - Purple */}
        <div className="stat-card-purple rounded-xl border border-slate-700/50 p-5 card-glow-purple transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Cpu className="h-5 w-5 text-white" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">
              {stats.totalCPU} vCPU
            </span>
          </div>
          <div className="text-2xl font-bold text-white">
            {stats.totalMem >= 1024 ? `${(stats.totalMem / 1024).toFixed(1)}` : stats.totalMem}
            <span className="text-sm text-slate-500 font-medium ml-1">{stats.totalMem >= 1024 ? 'GB' : 'MB'}</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">Total Memory</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CPU Chart */}
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-base font-semibold text-white">CPU Usage</h3>
            <span className={`ml-auto text-lg font-semibold tabular-nums ${latestCpu > 80 ? 'text-red-400' : latestCpu > 50 ? 'text-yellow-400' : 'text-blue-400'}`}>
              {metricsHistory.length > 0 ? `${latestCpu}%` : '--'}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={metricsHistory}>
              <defs>
                <linearGradient id="gradCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#475569" fontSize={11} domain={[0, 100]} tickLine={false} axisLine={false} width={30} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={DARK_TOOLTIP_STYLE} formatter={(value: number) => [`${value}%`, 'CPU']} />
              <Area type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#gradCpu)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Memory Chart */}
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <HardDrive className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-base font-semibold text-white">Memory Usage</h3>
            <span className={`ml-auto text-lg font-semibold tabular-nums ${latestMem > 80 ? 'text-red-400' : latestMem > 50 ? 'text-yellow-400' : 'text-emerald-400'}`}>
              {metricsHistory.length > 0 ? `${latestMem}%` : '--'}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={metricsHistory}>
              <defs>
                <linearGradient id="gradMem" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#475569" fontSize={11} domain={[0, 100]} tickLine={false} axisLine={false} width={30} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={DARK_TOOLTIP_STYLE} formatter={(value: number) => [`${value}%`, 'Memory']} />
              <Area type="monotone" dataKey="memory" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#gradMem)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* VM Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Server className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-base font-semibold text-white">Virtual Machines</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">{vms.length} VMs</span>
            <Link to="/vms" className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
              View all <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
        {vms.length === 0 ? (
          <div className="p-10 text-center">
            <Server className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No virtual machines yet</p>
            <Link to="/create" className="text-sm text-blue-400 hover:text-blue-300 mt-2 inline-block">Create your first VM</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">CPU</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Memory</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {vms.slice(0, 8).map((vm) => (
                  <tr key={vm.name} className="table-row-hover transition-colors">
                    <td className="px-5 py-3">
                      <Link to={`/vms/${vm.name}`} className="font-medium text-white hover:text-blue-400 transition-colors">{vm.name}</Link>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={vm.state} /></td>
                    <td className="px-4 py-3 text-slate-400 tabular-nums">{vm.cpus} vCPU</td>
                    <td className="px-4 py-3 text-slate-400 tabular-nums">{vm.memory >= 1024 ? `${(vm.memory / 1024).toFixed(1)} GB` : `${vm.memory} MB`}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{vm.ip || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
