import { useEffect, useState, useCallback } from 'react'
import { listVMs, getMetrics, VM, VMMetrics } from '../api/vm'
import { apiGet } from '../api/client'
import { getStateColor } from '../utils/vm'
import { Activity, Cpu, HardDrive, Server } from 'lucide-react'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useWebSocketContext } from '../contexts/WebSocketContext'
import { SkeletonDashboard } from '../components/Skeleton'
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

      // Fetch real metrics from running VMs
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
      const data = await apiGet<AuditEntry[]>('/api/audit/logs?limit=5')
      setActivityFeed(data)
    } catch (_error) {
      // Audit logs may not be available, fall back silently
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

  // Subscribe to WebSocket updates
  useEffect(() => {
    const unsubscribe = subscribe((message) => {
      if (message.type === 'vm_state_changed' || message.type === 'vm_created' || message.type === 'vm_deleted') {
        loadVMs()
      }
    })
    return unsubscribe
  }, [subscribe, loadVMs])

  // Apply WebSocket updates to VM list
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

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Server className="w-8 h-8" />}
          title="Total VMs"
          value={stats.total}
          color="blue"
        />
        <StatCard
          icon={<Activity className="w-8 h-8" />}
          title="Running"
          value={stats.running}
          color="green"
        />
        <StatCard
          icon={<Cpu className="w-8 h-8" />}
          title="Total vCPUs"
          value={stats.totalCPU}
          color="purple"
        />
        <StatCard
          icon={<HardDrive className="w-8 h-8" />}
          title="Total Memory"
          value={`${(stats.totalMemory / 1024).toFixed(1)}GB`}
          color="orange"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CPU Usage Chart */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-500" />
              CPU Usage
            </h3>
            <span className="text-sm text-gray-400">
              {metricsHistory.length > 0
                ? `${metricsHistory[metricsHistory.length - 1].cpu}%`
                : 'No data'}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={metricsHistory}>
              <defs>
                <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} />
              <YAxis stroke="#9ca3af" fontSize={12} domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '0.5rem',
                }}
              />
              <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCpu)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Memory Usage Chart */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-green-500" />
              Memory Usage
            </h3>
            <span className="text-sm text-gray-400">
              {metricsHistory.length > 0
                ? `${metricsHistory[metricsHistory.length - 1].memory}%`
                : 'No data'}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={metricsHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} />
              <YAxis stroke="#9ca3af" fontSize={12} domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '0.5rem',
                }}
              />
              <Line type="monotone" dataKey="memory" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* VM List */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold">Recent Virtual Machines</h2>
        </div>
        <div className="divide-y divide-gray-700">
          {vms.slice(0, 5).map((vm) => (
            <VMRow key={vm.name} vm={vm} />
          ))}
        </div>
      </div>

      {/* Activity Feed */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Recent Activity
        </h2>
        <div className="space-y-3">
          {activityFeed.length > 0 ? (
            activityFeed.map((entry, idx) => (
              <ActivityItem
                key={idx}
                time={new Date(entry.timestamp).toLocaleString()}
                type={entry.status === 'success' ? 'success' : 'error'}
                message={`${entry.action} on ${entry.resource}`}
              />
            ))
          ) : (
            <p className="text-gray-500 text-sm">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  icon: React.ReactNode
  title: string
  value: string | number
  color: string
}

function StatCard({ icon, title, value, color }: StatCardProps) {
  const colors: Record<string, string> = {
    blue: 'text-blue-500',
    green: 'text-green-500',
    purple: 'text-purple-500',
    orange: 'text-orange-500',
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="flex items-center justify-between">
        <div className={colors[color]}>{icon}</div>
      </div>
      <div className="mt-4">
        <div className="text-3xl font-bold">{value}</div>
        <div className="text-gray-400 text-sm mt-1">{title}</div>
      </div>
    </div>
  )
}

function VMRow({ vm }: { vm: VM }) {
  return (
    <Link to={`/vms/${vm.name}`} className="block p-4 hover:bg-gray-700 transition cursor-pointer">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-3 h-3 rounded-full ${getStateColor(vm.state)}`}></div>
          <div>
            <div className="font-medium">{vm.name}</div>
            <div className="text-sm text-gray-400">
              {vm.cpus} vCPUs &middot; {vm.memory}MB RAM
            </div>
          </div>
        </div>
        <div className="text-sm text-gray-400 capitalize">{vm.state}</div>
      </div>
    </Link>
  )
}

interface ActivityItemProps {
  time: string
  type: string
  message: string
}

function ActivityItem({ time, type, message }: ActivityItemProps) {
  const typeColors: Record<string, string> = {
    success: 'text-green-500',
    warning: 'text-yellow-500',
    info: 'text-blue-500',
    error: 'text-red-500',
  }

  return (
    <div className="flex items-start gap-3">
      <div className={`w-2 h-2 rounded-full mt-2 ${typeColors[type].replace('text', 'bg')}`}></div>
      <div className="flex-1">
        <div className="text-sm">{message}</div>
        <div className="text-xs text-gray-500 mt-1">{time}</div>
      </div>
    </div>
  )
}
