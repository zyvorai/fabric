import { useEffect, useState } from 'react'
import { listVMs, VM } from '../api/vm'
import { Activity, Cpu, HardDrive, Network, Server, TrendingUp } from 'lucide-react'
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useWebSocketContext } from '../contexts/WebSocketContext'

export default function Dashboard() {
  const [vms, setVMs] = useState<VM[]>([])
  const [loading, setLoading] = useState(true)
  const [cpuData, setCpuData] = useState<any[]>([])
  const [memoryData, setMemoryData] = useState<any[]>([])
  const { subscribe, vmUpdates } = useWebSocketContext()

  useEffect(() => {
    loadVMs()
    loadMetrics()
    const interval = setInterval(() => {
      loadMetrics()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  // Subscribe to WebSocket updates
  useEffect(() => {
    const unsubscribe = subscribe((message) => {
      if (message.type === 'vm_state_changed' || message.type === 'vm_created' || message.type === 'vm_deleted') {
        loadVMs() // Reload VM list on changes
      }
    })

    return unsubscribe
  }, [subscribe])

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

  const loadMetrics = () => {
    // Simulate metrics data
    const now = new Date()
    const data = Array.from({ length: 20 }, (_, i) => ({
      time: new Date(now.getTime() - (19 - i) * 3000).toLocaleTimeString(),
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
    }))
    setCpuData(data)
    setMemoryData(data)
  }

  const stats = {
    total: vms.length,
    running: vms.filter((vm) => vm.state === 'running').length,
    stopped: vms.filter((vm) => vm.state === 'stopped').length,
    paused: vms.filter((vm) => vm.state === 'paused').length,
    totalCPU: vms.reduce((acc, vm) => acc + vm.cpus, 0),
    totalMemory: vms.reduce((acc, vm) => acc + vm.memory, 0),
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
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
          trend="+2.5%"
        />
        <StatCard
          icon={<Activity className="w-8 h-8" />}
          title="Running"
          value={stats.running}
          color="green"
          trend="+5.0%"
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
            <span className="text-sm text-gray-400">Last 60 seconds</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={cpuData}>
              <defs>
                <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} />
              <YAxis stroke="#9ca3af" fontSize={12} />
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
            <span className="text-sm text-gray-400">Last 60 seconds</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={memoryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} />
              <YAxis stroke="#9ca3af" fontSize={12} />
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
          <ActivityItem
            time="2 minutes ago"
            type="success"
            message="VM 'web-server-01' started successfully"
          />
          <ActivityItem
            time="5 minutes ago"
            type="warning"
            message="High memory usage on 'db-server': 95%"
          />
          <ActivityItem
            time="10 minutes ago"
            type="info"
            message="Network bridge 'br0' configured"
          />
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, title, value, color, trend }: any) {
  const colors = {
    blue: 'text-blue-500',
    green: 'text-green-500',
    purple: 'text-purple-500',
    orange: 'text-orange-500',
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="flex items-center justify-between">
        <div className={colors[color]}>{icon}</div>
        {trend && (
          <div className="flex items-center gap-1 text-green-500 text-sm">
            <TrendingUp className="w-4 h-4" />
            {trend}
          </div>
        )}
      </div>
      <div className="mt-4">
        <div className="text-3xl font-bold">{value}</div>
        <div className="text-gray-400 text-sm mt-1">{title}</div>
      </div>
    </div>
  )
}

function VMRow({ vm }: { vm: VM }) {
  const stateColors = {
    running: 'bg-green-500',
    stopped: 'bg-red-500',
    paused: 'bg-yellow-500',
    unknown: 'bg-gray-500',
  }

  return (
    <div className="p-4 hover:bg-gray-700 transition cursor-pointer">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-3 h-3 rounded-full ${stateColors[vm.state]}`}></div>
          <div>
            <div className="font-medium">{vm.name}</div>
            <div className="text-sm text-gray-400">
              {vm.cpus} vCPUs • {vm.memory}MB RAM
            </div>
          </div>
        </div>
        <div className="text-sm text-gray-400 capitalize">{vm.state}</div>
      </div>
    </div>
  )
}

function ActivityItem({ time, type, message }: any) {
  const typeColors = {
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
