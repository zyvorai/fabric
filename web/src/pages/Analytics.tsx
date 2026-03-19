import { useEffect, useState } from 'react'
import { TrendingUp, AlertTriangle, Download, Clock, Activity } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  getSystemPerformance,
  getPerformanceInsights,
  getTopVMsByResource,
  exportPerformanceReport,
  getResourceUtilization,
  TimeRange,
  SystemPerformance,
  PerformanceInsight,
  ResourceUtilization
} from '../api/analytics'
import { useToastContext } from '../contexts/ToastContext'
import { PageHeader } from '../components/ui'

interface TopVMEntry {
  vm_name: string
  value: number
}

export default function Analytics() {
  const toast = useToastContext()
  const [systemPerf, setSystemPerf] = useState<SystemPerformance[]>([])
  const [insights, setInsights] = useState<PerformanceInsight[]>([])
  const [topVMs, setTopVMs] = useState<{ cpu: TopVMEntry[]; memory: TopVMEntry[]; network: TopVMEntry[] }>({
    cpu: [],
    memory: [],
    network: []
  })
  const [utilization, setUtilization] = useState<ResourceUtilization | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange])

  const loadData = async () => {
    try {
      const [perfData, insightsData, utilizationData, topCPU, topMemory, topNetwork] = await Promise.all([
        getSystemPerformance(timeRange),
        getPerformanceInsights(),
        getResourceUtilization(),
        getTopVMsByResource('cpu', 5),
        getTopVMsByResource('memory', 5),
        getTopVMsByResource('network', 5)
      ])
      setSystemPerf(perfData)
      setInsights(insightsData)
      setUtilization(utilizationData)
      setTopVMs({ cpu: topCPU, memory: topMemory, network: topNetwork })
    } catch (error) {
      console.error('Failed to load analytics:', error)
      toast.error('Failed to load analytics data')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async (format: 'pdf' | 'csv') => {
    setExporting(true)
    try {
      const blob = await exportPerformanceReport(timeRange, format)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `performance-report-${new Date().toISOString()}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success(`Report exported as ${format.toUpperCase()}`)
    } catch (_error) {
      toast.error('Failed to export report')
    } finally {
      setExporting(false)
    }
  }

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical': return 'bg-red-600'
      case 'warning': return 'bg-yellow-600'
      case 'info': return 'bg-blue-600'
      default: return 'bg-gray-600'
    }
  }

  const getUtilizationColor = (value: number): string => {
    if (value >= 90) return 'bg-red-500'
    if (value >= 75) return 'bg-yellow-500'
    if (value >= 50) return 'bg-blue-500'
    return 'bg-green-500'
  }

  if (loading) {
    return <div className="text-center py-8">Loading analytics...</div>
  }

  return (
    <div>
      <PageHeader
        title="Performance Analytics"
        description="Resource utilization and performance insights"
        actions={
          <>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="1h">Last Hour</option>
              <option value="6h">Last 6 Hours</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
            <div className="relative">
              <button
                onClick={() => document.getElementById('export-analytics')?.classList.toggle('hidden')}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 border border-gray-800 hover:bg-white/[0.03] rounded-lg transition disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              <div
                id="export-analytics"
                className="hidden absolute right-0 mt-2 w-48 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-10"
              >
                <button
                  onClick={() => { handleExport('pdf'); document.getElementById('export-analytics')?.classList.add('hidden') }}
                  className="w-full px-4 py-2 text-left hover:bg-white/[0.03] rounded-t-lg transition"
                >
                  Export as PDF
                </button>
                <button
                  onClick={() => { handleExport('csv'); document.getElementById('export-analytics')?.classList.add('hidden') }}
                  className="w-full px-4 py-2 text-left hover:bg-white/[0.03] rounded-b-lg transition"
                >
                  Export as CSV
                </button>
              </div>
            </div>
          </>
        }
      />

      {/* Resource Utilization Overview */}
      {utilization && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">CPU Utilization</span>
              <Activity className="w-5 h-5 text-blue-500" />
            </div>
            <div className="mb-2">
              <p className="text-2xl font-bold">{utilization.cpu_utilization.toFixed(1)}%</p>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${getUtilizationColor(utilization.cpu_utilization)}`}
                style={{ width: `${utilization.cpu_utilization}%` }}
              />
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Memory Utilization</span>
              <Activity className="w-5 h-5 text-purple-500" />
            </div>
            <div className="mb-2">
              <p className="text-2xl font-bold">{utilization.memory_utilization.toFixed(1)}%</p>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${getUtilizationColor(utilization.memory_utilization)}`}
                style={{ width: `${utilization.memory_utilization}%` }}
              />
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Disk Utilization</span>
              <Activity className="w-5 h-5 text-green-500" />
            </div>
            <div className="mb-2">
              <p className="text-2xl font-bold">{utilization.disk_utilization.toFixed(1)}%</p>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${getUtilizationColor(utilization.disk_utilization)}`}
                style={{ width: `${utilization.disk_utilization}%` }}
              />
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Network Utilization</span>
              <Activity className="w-5 h-5 text-cyan-500" />
            </div>
            <div className="mb-2">
              <p className="text-2xl font-bold">{utilization.network_utilization.toFixed(1)}%</p>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${getUtilizationColor(utilization.network_utilization)}`}
                style={{ width: `${utilization.network_utilization}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Performance Insights */}
      {insights.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Performance Insights
          </h2>
          <div className="space-y-3">
            {insights.slice(0, 5).map((insight, idx) => (
              <div
                key={idx}
                className="bg-gray-900 border border-gray-800 rounded-lg p-4"
              >
                <div className="flex items-start gap-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(insight.severity)}`}>
                    {insight.severity.toUpperCase()}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium mb-1">
                      {insight.vm_name}: {insight.resource} at {insight.value.toFixed(1)}%
                    </p>
                    <p className="text-sm text-gray-400">{insight.recommendation}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top VMs by Resource */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            Top VMs by CPU
          </h3>
          <div className="space-y-3">
            {topVMs.cpu.map((vm, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-sm font-medium">{vm.vm_name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${vm.value}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-400 w-12 text-right">
                    {vm.value.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-500" />
            Top VMs by Memory
          </h3>
          <div className="space-y-3">
            {topVMs.memory.map((vm, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-sm font-medium">{vm.vm_name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500"
                      style={{ width: `${vm.value}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-400 w-12 text-right">
                    {vm.value.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-500" />
            Top VMs by Network
          </h3>
          <div className="space-y-3">
            {topVMs.network.map((vm, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-sm font-medium">{vm.vm_name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500"
                      style={{ width: `${Math.min(vm.value, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-400 w-12 text-right">
                    {vm.value.toFixed(0)} Mbps
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* System Performance Chart Placeholder */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-500" />
            System Performance Over Time
          </h2>
          <p className="text-sm text-gray-400">{timeRange.toUpperCase()}</p>
        </div>
        {systemPerf.length > 0 ? (
          <ResponsiveContainer width="100%" height={256}>
            <AreaChart data={systemPerf}>
              <defs>
                <linearGradient id="colorSysCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorSysMem" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="timestamp"
                stroke="#9ca3af"
                fontSize={12}
                tickFormatter={(v) => new Date(v).toLocaleTimeString()}
              />
              <YAxis stroke="#9ca3af" fontSize={12} domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '0.5rem',
                }}
                labelFormatter={(v) => new Date(v).toLocaleString()}
              />
              <Area type="monotone" dataKey="total_cpu_usage" name="CPU %" stroke="#3b82f6" fillOpacity={1} fill="url(#colorSysCpu)" />
              <Area type="monotone" dataKey="total_memory_usage" name="Memory %" stroke="#a855f7" fillOpacity={1} fill="url(#colorSysMem)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center bg-gray-900 rounded border border-gray-800">
            <div className="text-center">
              <Activity className="w-12 h-12 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500">No performance data available</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-4 gap-4 mt-4 text-center text-sm">
          <div>
            <p className="text-gray-400">Avg CPU</p>
            <p className="font-bold text-blue-400">
              {systemPerf.length > 0
                ? (systemPerf.reduce((sum, p) => sum + p.total_cpu_usage, 0) / systemPerf.length).toFixed(1)
                : 0}%
            </p>
          </div>
          <div>
            <p className="text-gray-400">Avg Memory</p>
            <p className="font-bold text-purple-400">
              {systemPerf.length > 0
                ? (systemPerf.reduce((sum, p) => sum + p.total_memory_usage, 0) / systemPerf.length).toFixed(1)
                : 0}%
            </p>
          </div>
          <div>
            <p className="text-gray-400">Total VMs</p>
            <p className="font-bold text-green-400">
              {systemPerf.length > 0 ? systemPerf[systemPerf.length - 1].total_vms : 0}
            </p>
          </div>
          <div>
            <p className="text-gray-400">Running VMs</p>
            <p className="font-bold text-cyan-400">
              {systemPerf.length > 0 ? systemPerf[systemPerf.length - 1].running_vms : 0}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
