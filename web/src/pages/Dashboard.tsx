import { useEffect, useState, useCallback, useRef } from 'react'
import { listVMs, getMetrics, VM, VMMetrics } from '../api/vm'
import { apiGet } from '../api/client'
import { Activity, Cpu, HardDrive, Server, ArrowUpRight, TrendingUp, Clock } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, LineChart } from 'recharts'
import { useWebSocketContext } from '../contexts/WebSocketContext'
import { SkeletonDashboard } from '../components/Skeleton'
import { StatusBadge } from '../components/ui'
import { Link } from 'react-router'

interface MetricsPoint {
  time: string
  cpu: number
  memory: number
}

interface AuditEntry {
  timestamp: string
  action: string
  resource: string
  status: string
  user_id: string
}

// Animated counter hook
function useAnimatedValue(target: number, duration = 600): number {
  const [value, setValue] = useState(0)
  const prevTarget = useRef(0)

  useEffect(() => {
    const start = prevTarget.current
    prevTarget.current = target
    if (start === target) {
      setValue(target)
      return
    }
    const startTime = performance.now()
    let raf: number

    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(start + (target - start) * eased))
      if (progress < 1) raf = requestAnimationFrame(animate)
    }

    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}

export default function Dashboard() {
  const [vms, setVMs] = useState<VM[]>([])
  const [loading, setLoading] = useState(true)
  const [metricsHistory, setMetricsHistory] = useState<MetricsPoint[]>([])
  const [activityFeed, setActivityFeed] = useState<AuditEntry[]>([])
  const { subscribe, vmUpdates } = useWebSocketContext()

  const loadVMs = useCallback(async () => {
    try {
      const data = await listVMs()
      setVMs(data)
    } catch (error) {
      console.error('Failed to load VMs:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMetrics = useCallback(async () => {
    try {
      const currentVMs = await listVMs()
      const runningVMs = currentVMs.filter((vm) => vm.state === 'running')

      if (runningVMs.length === 0) {
        setMetricsHistory((prev) => [
          ...prev.slice(-19),
          { time: new Date().toLocaleTimeString(), cpu: 0, memory: 0 },
        ])
        return
      }

      const metricsResults = await Promise.allSettled(
        runningVMs.map((vm) => getMetrics(vm.name))
      )

      const metrics = metricsResults
        .filter((r): r is PromiseFulfilledResult<VMMetrics> => r.status === 'fulfilled')
        .map((r) => r.value)

      const avgCpu = metrics.length > 0
        ? metrics.reduce((sum, m) => sum + m.cpu_usage, 0) / metrics.length
        : 0
      const avgMemory = metrics.length > 0
        ? metrics.reduce((sum, m) => sum + m.memory_usage, 0) / metrics.length
        : 0

      setMetricsHistory((prev) => [
        ...prev.slice(-19),
        {
          time: new Date().toLocaleTimeString(),
          cpu: parseFloat(avgCpu.toFixed(1)),
          memory: parseFloat(avgMemory.toFixed(1)),
        },
      ])
    } catch (error) {
      console.error('Failed to load metrics:', error)
    }
  }, [])

  const loadActivityFeed = useCallback(async () => {
    try {
      const data = await apiGet<AuditEntry[]>('/api/audit/logs?limit=8')
      setActivityFeed(data)
    } catch (_error) {
      // Audit logs may not be available
    }
  }, [])

  useEffect(() => {
    loadVMs()
    loadMetrics()
    loadActivityFeed()
    const metricsInterval = setInterval(loadMetrics, 10000)
    const activityInterval = setInterval(loadActivityFeed, 30000)
    return () => {
      clearInterval(metricsInterval)
      clearInterval(activityInterval)
    }
  }, [loadVMs, loadMetrics, loadActivityFeed])

  useEffect(() => {
    const unsubscribe = subscribe((message) => {
      if (message.type === 'vm_state_changed' || message.type === 'vm_created' || message.type === 'vm_deleted') {
        loadVMs()
      }
    })
    return unsubscribe
  }, [subscribe, loadVMs])

  useEffect(() => {
    if (vmUpdates.size > 0) {
      setVMs((prevVMs) =>
        prevVMs.map((vm) => {
          const update = vmUpdates.get(vm.name)
          return update ? { ...vm, ...update } : vm
        })
      )
    }
  }, [vmUpdates])

  const stats = {
    total: vms.length,
    running: vms.filter((vm) => vm.state === 'running').length,
    stopped: vms.filter((vm) => vm.state === 'stopped').length,
    paused: vms.filter((vm) => vm.state === 'paused').length,
    totalCPU: vms.reduce((acc, vm) => acc + vm.cpus, 0),
    totalMemory: vms.reduce((acc, vm) => acc + vm.memory, 0),
  }

  if (loading) {
    return <SkeletonDashboard />
  }

  const latestCpu = metricsHistory.length > 0 ? metricsHistory[metricsHistory.length - 1].cpu : 0
  const latestMem = metricsHistory.length > 0 ? metricsHistory[metricsHistory.length - 1].memory : 0

  const tooltipStyle = {
    backgroundColor: '#111827',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '0.5rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    padding: '8px 12px',
    fontSize: '12px',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of your virtual infrastructure</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Server className="w-5 h-5" />}
          title="Total VMs"
          value={stats.total}
          color="blue"
          linkTo="/vms"
          sparkData={metricsHistory.map((p) => p.cpu)}
        />
        <StatCard
          icon={<Activity className="w-5 h-5" />}
          title="Running"
          value={stats.running}
          subtitle={stats.total > 0 ? `${Math.round((stats.running / stats.total) * 100)}% of fleet` : undefined}
          color="green"
          linkTo="/vms"
        />
        <StatCard
          icon={<Cpu className="w-5 h-5" />}
          title="Total vCPUs"
          value={stats.totalCPU}
          subtitle={latestCpu > 0 ? `${latestCpu}% avg usage` : undefined}
          color="purple"
          linkTo="/system"
          sparkData={metricsHistory.map((p) => p.cpu)}
        />
        <StatCard
          icon={<HardDrive className="w-5 h-5" />}
          title="Total Memory"
          value={stats.totalMemory >= 1024 ? `${(stats.totalMemory / 1024).toFixed(1)}` : `${stats.totalMemory}`}
          unit={stats.totalMemory >= 1024 ? 'GB' : 'MB'}
          subtitle={latestMem > 0 ? `${latestMem}% avg usage` : undefined}
          color="orange"
          linkTo="/system"
          sparkData={metricsHistory.map((p) => p.memory)}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CPU Chart */}
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 card-hover">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-blue-500/10">
                <Cpu className="w-4 h-4 text-blue-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-300">CPU Usage</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-semibold tabular-nums ${latestCpu > 80 ? 'text-red-400' : latestCpu > 50 ? 'text-yellow-400' : 'text-blue-400'}`}>
                {metricsHistory.length > 0 ? `${latestCpu}%` : '--'}
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={metricsHistory}>
              <defs>
                <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="time" stroke="rgba(255,255,255,0.15)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(255,255,255,0.15)" fontSize={11} domain={[0, 100]} tickLine={false} axisLine={false} width={30} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} formatter={(value: number) => [`${value}%`, 'CPU']} />
              <Area type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorCpu)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Memory Chart */}
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 card-hover">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-emerald-500/10">
                <HardDrive className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-300">Memory Usage</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-semibold tabular-nums ${latestMem > 80 ? 'text-red-400' : latestMem > 50 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                {metricsHistory.length > 0 ? `${latestMem}%` : '--'}
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={metricsHistory}>
              <defs>
                <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="time" stroke="rgba(255,255,255,0.15)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(255,255,255,0.15)" fontSize={11} domain={[0, 100]} tickLine={false} axisLine={false} width={30} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} formatter={(value: number) => [`${value}%`, 'Memory']} />
              <Area type="monotone" dataKey="memory" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorMem)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom: VM List + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* VM List - 2/3 width */}
        <div className="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-medium text-gray-300">Virtual Machines</h2>
            <Link
              to="/vms"
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          {vms.length === 0 ? (
            <div className="p-8 text-center">
              <Server className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No virtual machines yet</p>
              <Link to="/create" className="text-sm text-blue-400 hover:text-blue-300 mt-1 inline-block">
                Create your first VM
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-b border-gray-800/50">
                  <th className="py-2.5 px-5">Name</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">CPU</th>
                  <th className="py-2.5 px-4">Memory</th>
                </tr>
              </thead>
              <tbody>
                {vms.slice(0, 6).map((vm) => (
                  <tr key={vm.name} className="border-t border-gray-800/50 hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-5">
                      <Link
                        to={`/vms/${vm.name}`}
                        className="font-medium text-white hover:text-blue-400 transition-colors"
                      >
                        {vm.name}
                      </Link>
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusBadge status={vm.state} />
                    </td>
                    <td className="py-2.5 px-4 text-gray-400 tabular-nums">
                      {vm.cpus} vCPU{vm.cpus !== 1 ? 's' : ''}
                    </td>
                    <td className="py-2.5 px-4 text-gray-400 tabular-nums">
                      {vm.memory >= 1024 ? `${(vm.memory / 1024).toFixed(1)} GB` : `${vm.memory} MB`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Activity Feed - 1/3 width */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-gray-500" />
              Recent Activity
            </h2>
            <Link
              to="/audit"
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="px-5 py-3">
            {activityFeed.length > 0 ? (
              <div className="space-y-0">
                {activityFeed.map((entry, idx) => (
                  <ActivityItem
                    key={idx}
                    time={new Date(entry.timestamp).toLocaleString()}
                    type={entry.status === 'success' ? 'success' : 'error'}
                    action={entry.action}
                    resource={entry.resource}
                    isLast={idx === activityFeed.length - 1}
                  />
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Activity className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No recent activity</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  icon: React.ReactNode
  title: string
  value: string | number
  unit?: string
  subtitle?: string
  color: string
  linkTo?: string
  sparkData?: number[]
}

function StatCard({ icon, title, value, unit, subtitle, color, linkTo, sparkData }: StatCardProps) {
  const colorMap: Record<string, { text: string; bg: string; spark: string }> = {
    blue: { text: 'text-blue-400', bg: 'bg-blue-500/10', spark: '#3b82f6' },
    green: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', spark: '#10b981' },
    purple: { text: 'text-purple-400', bg: 'bg-purple-500/10', spark: '#a855f7' },
    orange: { text: 'text-orange-400', bg: 'bg-orange-500/10', spark: '#f97316' },
  }

  const c = colorMap[color] || colorMap.blue
  const numericValue = typeof value === 'number' ? value : parseFloat(value) || 0
  const animatedValue = useAnimatedValue(typeof value === 'number' ? numericValue : 0)
  const displayValue = typeof value === 'number' ? animatedValue : value

  const content = (
    <div className={`bg-gray-900 rounded-xl p-5 border border-gray-800 hover:border-gray-700 card-hover gradient-border relative overflow-hidden group hover:glow-${color}`}>
      {/* Sparkline background */}
      {sparkData && sparkData.length > 2 && (
        <div className="absolute bottom-0 right-0 w-24 h-12 opacity-30 group-hover:opacity-50 transition-opacity">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData.map((v, i) => ({ v, i }))}>
              <Line type="monotone" dataKey="v" stroke={c.spark} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg ${c.bg}`}>
          <span className={c.text}>{icon}</span>
        </div>
        {linkTo && (
          <ArrowUpRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-colors" />
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-white tabular-nums">{displayValue}</span>
        {unit && <span className="text-sm text-gray-500 font-medium">{unit}</span>}
      </div>
      <div className="text-xs text-gray-500 mt-1">{title}</div>
      {subtitle && (
        <div className="flex items-center gap-1 mt-1.5">
          <TrendingUp className="w-3 h-3 text-gray-600" />
          <span className="text-[11px] text-gray-500">{subtitle}</span>
        </div>
      )}
    </div>
  )

  if (linkTo) {
    return <Link to={linkTo} className="block">{content}</Link>
  }
  return content
}

interface ActivityItemProps {
  time: string
  type: string
  action: string
  resource: string
  isLast: boolean
}

function ActivityItem({ time, type, action, resource, isLast }: ActivityItemProps) {
  const dotColor = type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-red-500' : 'bg-gray-500'

  return (
    <div className="flex gap-3 relative">
      {/* Timeline */}
      <div className="flex flex-col items-center pt-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0 ring-2 ring-gray-900`} />
        {!isLast && <div className="w-px flex-1 bg-gray-800 mt-1" />}
      </div>
      {/* Content */}
      <div className={`pb-4 min-w-0 ${isLast ? '' : ''}`}>
        <p className="text-sm text-gray-300 leading-snug">
          <span className="font-medium text-white">{action}</span>
          {' '}on{' '}
          <span className="text-gray-400">{resource}</span>
        </p>
        <p className="text-[11px] text-gray-600 mt-0.5">{time}</p>
      </div>
    </div>
  )
}
