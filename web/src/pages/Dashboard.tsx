// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useEffect, useState, useCallback } from 'react'
import { listVMs, getMetrics, VM, VMMetrics } from '../api/vm'
import { Activity, Server, Cpu, HardDrive, TrendingUp, ArrowUpRight, Power, Plus } from 'lucide-react'
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
import { GettingStarted } from '../components/GettingStarted'
import { FabricGraphic } from '../components/FabricGraphic'
import { RadialGauge } from '../components/RadialGauge'
import { useCountUp } from '../hooks/useCountUp'
import { usePlatformInfo } from '../contexts/PlatformInfoContext'
import type { SubsystemPhase } from '../api/capabilities'

interface MetricsPoint { time: string; cpu: number; memory: number }

function subsystemPhaseStyle(phase: SubsystemPhase | undefined): {
  label: string
  className: string
  pill: string
} {
  switch (phase) {
    case 'live':
      return {
        label: 'Live',
        className: 'text-[#1d1d1f]',
        pill: 'bg-[#e8f5e9] text-[#1b5e20] border-[#c8e6c9]',
      }
    case 'unreachable':
      return {
        label: 'Unreachable',
        className: 'text-[#1d1d1f]',
        pill: 'bg-[#fff3e0] text-[#e65100] border-[#ffe0b2]',
      }
    case 'off':
      return {
        label: 'Off',
        className: 'text-[#1d1d1f]',
        pill: 'bg-[#f5f5f7] text-[#6e6e73] border-[#d2d2d7]',
      }
    default:
      return {
        label: 'Checking…',
        className: 'text-[#6e6e73]',
        pill: 'bg-[#f5f5f7] text-[#6e6e73] border-[#d2d2d7]',
      }
  }
}

const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #d2d2d7',
  borderRadius: '12px',
  fontSize: '12px',
  color: '#1d1d1f',
}

export default function Dashboard() {
  const [vms, setVMs] = useState<VM[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [metricsHistory, setMetricsHistory] = useState<MetricsPoint[]>([])
  const { subscribe, vmUpdates } = useWebSocketContext()
  const toast = useToastContext()
  const { capabilities, loading: capsLoading } = usePlatformInfo()

  const loadVMs = useCallback(async () => {
    try {
      setVMs(await listVMs())
      setLoadError(null)
      setRefreshError(null)
    } catch (err) {
      const msg = formatUserError(err)
      setVMs((prev) => {
        if (prev.length === 0) {
          setLoadError(msg)
          toastFailure(toast, 'Failed to load virtual machines', err)
        } else {
          setRefreshError(msg)
        }
        return prev
      })
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
      const results = await Promise.allSettled(running.map((vm) => getMetrics(vm.name).then((m) => ({ vm, m }))))
      const metrics = results
        .filter((r): r is PromiseFulfilledResult<{ vm: VM; m: VMMetrics }> => r.status === 'fulfilled')
        .map((r) => r.value)
      const avgCpu = metrics.length > 0 ? metrics.reduce((s, { m }) => s + m.cpu_usage, 0) / metrics.length : 0
      // memory_usage is raw bytes, not a percentage (unlike cpu_usage) — express it
      // as a percentage of each VM's own allocated memory (`vm.memory`, in MiB) so
      // it's on the same 0-100 scale as the CPU gauge next to it.
      const memPercents = metrics
        .filter(({ vm }) => vm.memory > 0)
        .map(({ vm, m }) => (m.memory_usage / (vm.memory * 1024 * 1024)) * 100)
      const avgMem = memPercents.length > 0 ? memPercents.reduce((s, p) => s + p, 0) / memPercents.length : 0
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
  const fleetHealthPct = stats.total > 0 ? (stats.running / stats.total) * 100 : 0

  const totalCount = useCountUp(stats.total)
  const runningCount = useCountUp(stats.running)
  const stoppedCount = useCountUp(stats.stopped)
  const memCount = useCountUp(Math.round(stats.totalMem >= 1024 ? stats.totalMem / 1024 : stats.totalMem))

  if (loading) return <SkeletonDashboard />

  const latestCpu = metricsHistory.length > 0 ? metricsHistory[metricsHistory.length - 1].cpu : 0
  const latestMem = metricsHistory.length > 0 ? metricsHistory[metricsHistory.length - 1].memory : 0
  const greeting = (() => {
    const h = new Date().getHours()
    return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  })()

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="glass-panel relative overflow-hidden px-6 py-6 sm:px-8 sm:py-7">
        <div className="pointer-events-none absolute -right-6 -top-10 w-72 h-72 opacity-70">
          <FabricGraphic ambient />
        </div>
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#0066cc] uppercase tracking-[0.04em] mb-1">{greeting}</p>
            <h1 className="text-[32px] sm:text-[40px] font-semibold text-[#1d1d1f] tracking-[-0.022em] leading-none">
              Zyvor Fabric
            </h1>
            <p className="text-[17px] text-[#333336] mt-2 max-w-md tracking-[-0.022em] leading-snug">
              {stats.total === 0
                ? 'Your infrastructure control plane is ready — spin up the first VM to get going.'
                : `Watching ${stats.total} VM${stats.total === 1 ? '' : 's'} across your fabric. ${stats.running} running right now.`}
            </p>
            <div className="flex items-center gap-3 mt-4">
              <Link
                to="/app/create"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0066cc] hover:bg-[#0077ed] text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" /> Create VM
              </Link>
              <button
                onClick={loadVMs}
                className="px-4 py-2 bg-white hover:bg-black/[0.04] text-[#1d1d1f] text-sm font-medium rounded-lg transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
          {stats.total > 0 && (
            <div className="shrink-0 flex items-center gap-3 self-center">
              <RadialGauge
                percent={fleetHealthPct}
                color={fleetHealthPct >= 70 ? '#34d399' : fleetHealthPct >= 30 ? '#fbbf24' : '#f87171'}
                label="fleet up"
              />
            </div>
          )}
        </div>
      </div>

      {loadError && (
        <ErrorBanner
          title="Could not load dashboard"
          headline={loadError}
          hints={hintsForError(loadError)}
          onRetry={loadVMs}
        />
      )}
      {!loadError && refreshError && (
        <ErrorBanner
          title="Could not refresh dashboard"
          headline={refreshError}
          onRetry={loadVMs}
          tone="amber"
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {(
          [
            {
              title: 'VM driver',
              subtitle: 'VM registration and lifecycle',
              status: capabilities?.vm_driver,
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
            <div
              key={title}
              className="rounded-[12px] border border-[#d2d2d7] bg-[#f5f5f7] p-4"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0066cc]">
                {title}
              </p>
              <p className="mt-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${phase.pill}`}
                >
                  {capsLoading && !capabilities ? '…' : phase.label}
                </span>
              </p>
              <p className="text-[14px] text-[#333336] mt-2 leading-snug tracking-[-0.016em]">
                {status?.detail || subtitle}
              </p>
            </div>
          )
        })}
      </div>

      {/* Stat Cards - matching hypersdk exactly */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total VMs - Blue */}
        <div className="stat-card-blue rounded-xl border border-[#d2d2d7] p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Server className="h-5 w-5 text-[#1d1d1f]" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-[#0066cc]">total</span>
          </div>
          <div className="text-2xl font-bold text-[#1d1d1f] tabular-nums">{totalCount}</div>
          <div className="text-[13px] text-[#333336] mt-1">Total VMs</div>
        </div>

        {/* Running - Green */}
        <div className="stat-card-green rounded-xl border border-[#d2d2d7] p-5 card-glow-green transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-green-500/20">
              <Activity className="h-5 w-5 text-[#1d1d1f]" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-emerald-600">
              {stats.total > 0 ? `${Math.round((stats.running / stats.total) * 100)}%` : '0%'}
            </span>
          </div>
          <div className="text-2xl font-bold text-[#1d1d1f] tabular-nums">{runningCount}</div>
          <div className="text-[13px] text-[#333336] mt-1">Running</div>
        </div>

        {/* Stopped - Red */}
        <div className="stat-card-red rounded-xl border border-[#d2d2d7] p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/20">
              <Power className="h-5 w-5 text-[#1d1d1f]" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-600">stopped</span>
          </div>
          <div className="text-2xl font-bold text-[#1d1d1f] tabular-nums">{stoppedCount}</div>
          <div className="text-[13px] text-[#333336] mt-1">Stopped</div>
        </div>

        {/* Resources - Purple */}
        <div className="stat-card-purple rounded-xl border border-[#d2d2d7] p-5 card-glow-purple transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Cpu className="h-5 w-5 text-[#1d1d1f]" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">
              {stats.totalCPU} vCPU
            </span>
          </div>
          <div className="text-2xl font-bold text-[#1d1d1f] tabular-nums">
            {memCount}
            <span className="text-sm text-[#6e6e73] font-medium ml-1">{stats.totalMem >= 1024 ? 'GB' : 'MB'}</span>
          </div>
          <div className="text-[13px] text-[#333336] mt-1">Total Memory</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CPU Chart */}
        <div className="bg-[#f5f5f7] rounded-xl p-5 border border-[#d2d2d7]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <TrendingUp className="w-4 h-4 text-[#1d1d1f]" />
            </div>
            <h3 className="text-base font-semibold text-[#1d1d1f]">CPU Usage</h3>
            <span className={`ml-auto text-lg font-semibold tabular-nums ${latestCpu > 80 ? 'text-red-600' : latestCpu > 50 ? 'text-amber-600' : 'text-[#0066cc]'}`}>
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
              <CartesianGrid strokeDasharray="3 3" stroke="#d2d2d7" />
              <XAxis dataKey="time" stroke="#6e6e73" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#6e6e73" fontSize={11} domain={[0, 100]} tickLine={false} axisLine={false} width={30} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number) => [`${value}%`, 'CPU']} />
              <Area type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#gradCpu)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Memory Chart */}
        <div className="bg-[#f5f5f7] rounded-xl p-5 border border-[#d2d2d7]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <HardDrive className="w-4 h-4 text-[#1d1d1f]" />
            </div>
            <h3 className="text-base font-semibold text-[#1d1d1f]">Memory Usage</h3>
            <span className={`ml-auto text-lg font-semibold tabular-nums ${latestMem > 80 ? 'text-red-600' : latestMem > 50 ? 'text-amber-600' : 'text-emerald-600'}`}>
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
              <CartesianGrid strokeDasharray="3 3" stroke="#d2d2d7" />
              <XAxis dataKey="time" stroke="#6e6e73" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#6e6e73" fontSize={11} domain={[0, 100]} tickLine={false} axisLine={false} width={30} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number) => [`${value}%`, 'Memory']} />
              <Area type="monotone" dataKey="memory" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#gradMem)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* VM Table / first-run onboarding */}
      {vms.length === 0 ? (
        <GettingStarted />
      ) : (
      <div className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#d2d2d7] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Server className="w-4 h-4 text-[#1d1d1f]" />
            </div>
            <h2 className="text-base font-semibold text-[#1d1d1f]">Virtual Machines</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[#6e6e73] bg-[#e8e8ed] px-2.5 py-1 rounded-full">{vms.length} VMs</span>
            <Link to="/app/vms" className="flex items-center gap-1 text-xs text-[#0066cc] hover:text-blue-300 transition-colors">
              View all <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#d2d2d7]">
                <th className="text-left px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">CPU</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Memory</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d2d2d7]/30">
              {vms.slice(0, 8).map((vm) => (
                <tr key={vm.name} className="table-row-hover transition-colors">
                  <td className="px-5 py-3">
                    <Link to={`/app/vms/${vm.name}`} className="font-medium text-[#1d1d1f] hover:text-[#0066cc] transition-colors">{vm.name}</Link>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={vm.state} /></td>
                  <td className="px-4 py-3 text-[#6e6e73] tabular-nums">{vm.cpus} vCPU</td>
                  <td className="px-4 py-3 text-[#6e6e73] tabular-nums">{vm.memory >= 1024 ? `${(vm.memory / 1024).toFixed(1)} GB` : `${vm.memory} MB`}</td>
                  <td className="px-4 py-3 text-[#6e6e73] font-mono text-xs">{vm.ip || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  )
}
