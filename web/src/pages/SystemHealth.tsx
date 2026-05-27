// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect } from 'react'
import { apiFetch } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import { formatUserError } from '../utils/apiError'
import { hintsForError } from '../utils/daemonHints'

interface CpuCore { id: number; usage_percent: number }
interface FilesystemInfo { mountpoint: string; fs_type: string; total_bytes: number; used_bytes: number; usage_percent: number }
interface DiskInfo { device: string; reads_completed: number; writes_completed: number; read_bytes: number; write_bytes: number; avg_latency_ms: number; queue_depth: number }
interface NetworkInterface { name: string; rx_bytes: number; tx_bytes: number; rx_errors: number; tx_errors: number }
interface ProcessInfo { pid: number; name: string; cpu_percent: number; memory_mb: number }
interface SystemInfoData {
  health: { score: number; status: string; bottleneck?: string; summary?: string }
  cpu: { usage_percent: number; core_count: number; load_avg_1: number; load_avg_5: number; cores: CpuCore[] }
  memory: { usage_percent: number; used_bytes: number; total_bytes: number; available_bytes: number; cached_bytes: number; swap_percent: number; swap_used_bytes: number; swap_total_bytes: number }
  disks: DiskInfo[]
  filesystems: FilesystemInfo[]
  network: { interfaces: NetworkInterface[]; tcp_states: Record<string, number>; total_rx_bytes: number; total_tx_bytes: number; retransmits: number }
  processes: { total: number; top_cpu: ProcessInfo[]; top_memory: ProcessInfo[] }
}

function usageBarColor(pct: number): string {
  if (pct > 90) return 'bg-red-500'
  if (pct > 70) return 'bg-amber-500'
  return 'bg-blue-500'
}

function healthTextColor(score: number): string {
  if (score > 80) return 'text-emerald-400'
  if (score > 60) return 'text-amber-400'
  return 'text-red-400'
}

function healthBorderColor(score: number): string {
  if (score > 80) return 'border-emerald-500'
  if (score > 60) return 'border-amber-500'
  return 'border-red-500'
}

function Bar({ pct, label, detail }: { pct: number; label: string; detail?: string }) {
  const v = Math.min(100, Math.max(0, pct || 0))
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-xs font-medium text-slate-300">{v.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-700">
        <div className={`h-full rounded-full transition-all duration-500 ${usageBarColor(v)}`} style={{ width: `${v}%` }} />
      </div>
      {detail && <div className="text-[10px] text-slate-500 mt-0.5">{detail}</div>}
    </div>
  )
}

function fmtB(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + u[i]
}

export default function SystemHealth() {
  const [data, setData] = useState<SystemInfoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    let ok = true
    const load = () => {
      apiFetch('/api/system/info')
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
        .then(j => { if (ok) { setData(j); setErr(''); setLoading(false) } })
        .catch(e => { if (ok) { setErr(e.message); setLoading(false) } })
    }
    load()
    const t = setInterval(load, 2000)
    return () => { ok = false; clearInterval(t) }
  }, [])

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
  if (err && !data) {
    return (
      <ErrorBanner
        title="Could not load system health"
        headline={formatUserError(err)}
        hints={hintsForError(err)}
        onRetry={() => {
          setLoading(true)
          apiFetch('/api/system/info')
            .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
            .then((j) => { setData(j); setErr(''); setLoading(false) })
            .catch((e) => { setErr(formatUserError(e)); setLoading(false) })
        }}
      />
    )
  }

  const health = data?.health
  const cpu = data?.cpu
  const mem = data?.memory
  const disks = data?.disks ?? []
  const fs = data?.filesystems ?? []
  const net = data?.network
  const procs = data?.processes
  const score = health?.score ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gradient-blue">System Health</h1>
        <p className="text-sm text-slate-400 mt-1">Real-time host monitoring &middot; auto-refresh 2s</p>
      </div>

      {err && <div className="bg-amber-500/10 rounded-lg border border-amber-500/30 px-4 py-2 text-xs text-amber-400">Connection issue: {err}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 flex flex-col items-center justify-center">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 ${healthBorderColor(score)} bg-slate-900/50`}>
            <span className={`text-3xl font-bold ${healthTextColor(score)}`}>{score}</span>
          </div>
          <span className="text-xs text-slate-400 mt-2">Health Score</span>
          <span className={`text-xs font-medium mt-1 px-2 py-0.5 rounded-full ${score > 80 ? 'bg-emerald-500/10 text-emerald-400' : score > 60 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
            {health?.status || 'unknown'}
          </span>
        </div>

        <div className="lg:col-span-2 bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-white">Summary</span>
            {health?.bottleneck && health.bottleneck !== 'healthy' && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">{health.bottleneck}</span>
            )}
          </div>
          <p className="text-sm text-slate-300">{health?.summary || 'System is healthy'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-base font-semibold text-white mb-4">CPU</h3>
          <Bar pct={cpu?.usage_percent ?? 0} label="Overall Usage" />
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-slate-900/50 rounded-lg p-3">
              <div className="text-[10px] text-slate-500">Cores</div>
              <div className="text-sm font-semibold text-white">{cpu?.core_count ?? '-'}</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3">
              <div className="text-[10px] text-slate-500">Load 1m</div>
              <div className="text-sm font-semibold text-white">{(cpu?.load_avg_1 ?? 0).toFixed(2)}</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3">
              <div className="text-[10px] text-slate-500">Load 5m</div>
              <div className="text-sm font-semibold text-white">{(cpu?.load_avg_5 ?? 0).toFixed(2)}</div>
            </div>
          </div>
          {(cpu?.cores?.length ?? 0) > 0 && (
            <div className="mt-4">
              <span className="text-xs text-slate-500">Per-Core Usage</span>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mt-2">
                {cpu?.cores?.map((c: CpuCore, i: number) => (
                  <div key={i} className="bg-slate-900/50 rounded-lg p-2 text-center">
                    <div className="text-[10px] text-slate-500">C{c.id ?? i}</div>
                    <div className="text-xs font-semibold text-white">{(c.usage_percent ?? 0).toFixed(0)}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-base font-semibold text-white mb-4">Memory</h3>
          <Bar pct={mem?.usage_percent ?? 0} label="RAM Usage" detail={`${fmtB(mem?.used_bytes ?? 0)} / ${fmtB(mem?.total_bytes ?? 0)}`} />
          <Bar pct={mem?.swap_percent ?? 0} label="Swap Usage" detail={`${fmtB(mem?.swap_used_bytes ?? 0)} / ${fmtB(mem?.swap_total_bytes ?? 0)}`} />
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-slate-900/50 rounded-lg p-3">
              <div className="text-[10px] text-slate-500">Total</div>
              <div className="text-sm font-semibold text-white">{fmtB(mem?.total_bytes ?? 0)}</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3">
              <div className="text-[10px] text-slate-500">Available</div>
              <div className="text-sm font-semibold text-white">{fmtB(mem?.available_bytes ?? 0)}</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3">
              <div className="text-[10px] text-slate-500">Cached</div>
              <div className="text-sm font-semibold text-white">{fmtB(mem?.cached_bytes ?? 0)}</div>
            </div>
          </div>
        </div>
      </div>

      {fs.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-base font-semibold text-white mb-4">Filesystems</h3>
          <div className="space-y-3">
            {fs.filter((f: FilesystemInfo) => f.total_bytes > 0).slice(0, 10).map((f: any, i: number) => (
              <Bar key={i} pct={f.usage_percent} label={`${f.mountpoint} (${f.fs_type})`} detail={`${fmtB(f.used_bytes)} / ${fmtB(f.total_bytes)}`} />
            ))}
          </div>
        </div>
      )}

      {disks.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-base font-semibold text-white mb-4">Disk I/O</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {disks.map((dk: DiskInfo, i: number) => (
              <div key={i} className="bg-slate-900/50 rounded-lg p-3">
                <div className="text-sm font-medium text-white mb-2">{dk.device}</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <div>Reads: {dk.reads_completed?.toLocaleString()}</div>
                  <div>Writes: {dk.writes_completed?.toLocaleString()}</div>
                  <div>Read: {fmtB(dk.read_bytes)}</div>
                  <div>Written: {fmtB(dk.write_bytes)}</div>
                  <div>Latency: {(dk.avg_latency_ms ?? 0).toFixed(2)} ms</div>
                  <div>Queue: {dk.queue_depth ?? 0}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-base font-semibold text-white mb-4">Network</h3>
        {(net?.interfaces?.length ?? 0) > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {net!.interfaces!.filter((iface: NetworkInterface) => iface.rx_bytes > 0 || iface.tx_bytes > 0).slice(0, 12).map((iface: NetworkInterface, i: number) => (
              <div key={i} className="bg-slate-900/50 rounded-lg p-3">
                <div className="text-sm font-medium text-blue-400 mb-1">{iface.name}</div>
                <div className="flex gap-4 text-xs text-slate-400">
                  <span>RX: {fmtB(iface.rx_bytes)}</span>
                  <span>TX: {fmtB(iface.tx_bytes)}</span>
                </div>
                {(iface.rx_errors > 0 || iface.tx_errors > 0) && (
                  <div className="text-[10px] text-red-400 mt-1">Errors: RX {iface.rx_errors} / TX {iface.tx_errors}</div>
                )}
              </div>
            ))}
          </div>
        )}
        {net?.tcp_states && Object.keys(net.tcp_states).length > 0 && (
          <div>
            <span className="text-xs text-slate-500">TCP States</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {Object.entries(net!.tcp_states!).map(([state, count]) => (
                <span key={state} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300">
                  {state}: {count as number}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-4 text-xs text-slate-500 mt-3">
          <span>Total RX: {fmtB(net?.total_rx_bytes ?? 0)}</span>
          <span>Total TX: {fmtB(net?.total_tx_bytes ?? 0)}</span>
          <span>Retransmits: {(net?.retransmits ?? 0).toLocaleString()}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(procs?.top_cpu?.length ?? 0) > 0 && (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700/50">
              <h3 className="text-sm font-semibold text-white">Top CPU ({procs?.total ?? 0} processes)</h3>
            </div>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-700/30">
                <th className="text-left px-4 py-2 text-slate-500">PID</th>
                <th className="text-left px-4 py-2 text-slate-500">Name</th>
                <th className="text-right px-4 py-2 text-slate-500">CPU%</th>
                <th className="text-right px-4 py-2 text-slate-500">Mem MB</th>
              </tr></thead>
              <tbody>{procs?.top_cpu?.map((p: ProcessInfo, i: number) => (
                <tr key={i} className="border-b border-slate-700/20 hover:bg-slate-700/20">
                  <td className="px-4 py-1.5 text-slate-400 font-mono">{p.pid}</td>
                  <td className="px-4 py-1.5 text-white">{p.name}</td>
                  <td className="px-4 py-1.5 text-right text-slate-300">{(p.cpu_percent ?? 0).toFixed(1)}</td>
                  <td className="px-4 py-1.5 text-right text-slate-300">{(p.memory_mb ?? 0).toFixed(0)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {(procs?.top_memory?.length ?? 0) > 0 && (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700/50">
              <h3 className="text-sm font-semibold text-white">Top Memory</h3>
            </div>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-700/30">
                <th className="text-left px-4 py-2 text-slate-500">PID</th>
                <th className="text-left px-4 py-2 text-slate-500">Name</th>
                <th className="text-right px-4 py-2 text-slate-500">Mem MB</th>
                <th className="text-right px-4 py-2 text-slate-500">CPU%</th>
              </tr></thead>
              <tbody>{procs?.top_memory?.map((p: ProcessInfo, i: number) => (
                <tr key={i} className="border-b border-slate-700/20 hover:bg-slate-700/20">
                  <td className="px-4 py-1.5 text-slate-400 font-mono">{p.pid}</td>
                  <td className="px-4 py-1.5 text-white">{p.name}</td>
                  <td className="px-4 py-1.5 text-right text-slate-300">{(p.memory_mb ?? 0).toFixed(0)}</td>
                  <td className="px-4 py-1.5 text-right text-slate-300">{(p.cpu_percent ?? 0).toFixed(1)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
