import { useState, useEffect, useRef, useCallback } from 'react'
import { Activity, Cpu, Database, HardDrive, Network, Pause, Play } from 'lucide-react'
import { apiFetch } from '../api/client'

interface MetricPoint { timestamp: number; cpu: number; memory: number; disk_read: number; disk_write: number; net_rx: number; net_tx: number }

const MAX_POINTS = 60

function MiniChart({ data, color, max }: { data: number[]; color: string; max?: number }) {
  if (data.length === 0) return <svg viewBox="0 0 100 40" className="w-full h-10" />
  const height = 40
  const maxVal = max || Math.max(...data, 1)
  const points = data.map((v, i) => {
    const x = (i / (MAX_POINTS - 1)) * 100
    const y = height - (v / maxVal) * height
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full h-10">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function fmtB(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + u[i]
}

export default function LiveMetrics() {
  const [history, setHistory] = useState<MetricPoint[]>([])
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pausedRef = useRef(false)

  const fetchMetrics = useCallback(async () => {
    if (pausedRef.current) return
    try {
      const res = await apiFetch('/api/system/metrics')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const point: MetricPoint = {
        timestamp: Date.now(),
        cpu: data.cpu_percent ?? data.cpu ?? 0,
        memory: data.memory_percent ?? data.memory ?? 0,
        disk_read: data.disk_read_bytes ?? 0,
        disk_write: data.disk_write_bytes ?? 0,
        net_rx: data.net_rx_bytes ?? 0,
        net_tx: data.net_tx_bytes ?? 0,
      }
      setHistory(prev => [...prev.slice(-(MAX_POINTS - 1)), point])
      setError(null)
    } catch (err: any) { setError(err.message) }
  }, [])

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 1000)
    return () => clearInterval(interval)
  }, [fetchMetrics])

  const latest = history[history.length - 1] || { cpu: 0, memory: 0, disk_read: 0, disk_write: 0, net_rx: 0, net_tx: 0 }
  const cpuData = history.map(h => h.cpu)
  const memData = history.map(h => h.memory)
  const diskReadData = history.map(h => h.disk_read)
  const diskWriteData = history.map(h => h.disk_write)
  const netRxData = history.map(h => h.net_rx)
  const netTxData = history.map(h => h.net_tx)

  const metrics = [
    { label: 'CPU Usage', value: `${latest.cpu.toFixed(1)}%`, data: cpuData, color: '#3b82f6', icon: <Cpu className="w-4 h-4 text-blue-400" />, max: 100 },
    { label: 'Memory Usage', value: `${latest.memory.toFixed(1)}%`, data: memData, color: '#a855f7', icon: <Database className="w-4 h-4 text-purple-400" />, max: 100 },
    { label: 'Disk Read', value: `${fmtB(latest.disk_read)}/s`, data: diskReadData, color: '#06b6d4', icon: <HardDrive className="w-4 h-4 text-cyan-400" /> },
    { label: 'Disk Write', value: `${fmtB(latest.disk_write)}/s`, data: diskWriteData, color: '#f59e0b', icon: <HardDrive className="w-4 h-4 text-amber-400" /> },
    { label: 'Network RX', value: `${fmtB(latest.net_rx)}/s`, data: netRxData, color: '#22c55e', icon: <Network className="w-4 h-4 text-green-400" /> },
    { label: 'Network TX', value: `${fmtB(latest.net_tx)}/s`, data: netTxData, color: '#ef4444', icon: <Network className="w-4 h-4 text-red-400" /> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Activity className="w-6 h-6 text-green-400" /> Live Metrics</h1>
          <p className="text-sm text-slate-400 mt-1">Real-time system performance (1s interval, {MAX_POINTS}s window)</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setPaused(!paused)} title={paused ? 'Resume metrics streaming' : 'Pause metrics streaming'} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${paused ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
            {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${paused ? 'bg-amber-400' : error ? 'bg-red-400' : 'bg-green-400 animate-pulse'}`} />
            <span className="text-xs text-slate-500">{paused ? 'Paused' : error ? 'Error' : 'Streaming'}</span>
          </div>
        </div>
      </div>

      {error && <div className="bg-amber-500/10 rounded-lg border border-amber-500/30 px-4 py-2 text-xs text-amber-400">Connection issue: {error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map(m => (
          <div key={m.label} className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 card-glow transition-all hover:scale-[1.01]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {m.icon}
                <span className="text-xs text-slate-400">{m.label}</span>
              </div>
              <span className="text-lg font-bold text-white tabular-nums">{m.value}</span>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-2">
              <MiniChart data={m.data} color={m.color} max={m.max} />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-slate-600">
              <span>{MAX_POINTS}s ago</span>
              <span>now</span>
            </div>
          </div>
        ))}
      </div>

      {history.length === 0 && !error && (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500 text-sm">Waiting for metrics data...</div>
      )}
    </div>
  )
}
