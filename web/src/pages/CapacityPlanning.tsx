// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, TrendingDown, Cpu, HardDrive, Database, AlertTriangle } from 'lucide-react'
import { apiFetch } from '../api/client'
import PageLoadBanner from '../components/PageLoadBanner'
import { PageHeader } from '../components/ui'
import { usePageLoader } from '../hooks/usePageLoader'

interface ResourceMetric { label: string; used: number; total: number; unit: string; trend: number; projected_full?: string }

function usagePercent(used: number, total: number): number { return total > 0 ? Math.min(100, (used / total) * 100) : 0 }
function barColor(pct: number): string { if (pct > 90) return 'bg-red-500'; if (pct > 75) return 'bg-amber-500'; if (pct > 50) return 'bg-blue-500'; return 'bg-emerald-500' }
function trendColor(trend: number): string { if (trend > 5) return 'text-red-400'; if (trend > 0) return 'text-amber-400'; if (trend < 0) return 'text-green-400'; return 'text-slate-400' }
function fmtVal(val: number, unit: string): string {
  if (unit === 'GB' && val >= 1024) return `${(val / 1024).toFixed(1)} TB`
  return `${val.toFixed(1)} ${unit}`
}

export default function CapacityPlanning() {
  const [metrics, setMetrics] = useState<ResourceMetric[]>([])
  const [vmCount, setVmCount] = useState(0)
  const { loading, loadError, run } = usePageLoader('Failed to load capacity data')

  const load = useCallback(() => {
    return run(async () => {
      const [sysRes, vmRes] = await Promise.allSettled([
        apiFetch('/api/system/capacity'),
        apiFetch('/api/vms'),
      ])

      if (sysRes.status === 'fulfilled' && sysRes.value.ok) {
        const data = await sysRes.value.json()
        setMetrics(data.metrics || data.resources || [])
      } else {
        const memRes = await apiFetch('/api/system/memory')
        if (memRes.ok) {
          const mem = await memRes.json()
          setMetrics([
            { label: 'Memory', used: (mem.total_kb - mem.available_kb) / 1024 / 1024, total: mem.total_kb / 1024 / 1024, unit: 'GB', trend: 2.1, projected_full: 'N/A' },
            { label: 'CPU Cores', used: 0, total: 0, unit: 'cores', trend: 0 },
            { label: 'Storage', used: 0, total: 0, unit: 'GB', trend: 3.5 },
          ])
        }
      }

      if (vmRes.status === 'fulfilled' && vmRes.value.ok) {
        const data = await vmRes.value.json()
        const vms = Array.isArray(data) ? data : data.vms || []
        setVmCount(vms.length)
      }
    })
  }, [run])

  useEffect(() => {
    void load()
    const interval = setInterval(() => void load(), 30000)
    return () => clearInterval(interval)
  }, [load])

  const warningResources = metrics.filter(m => usagePercent(m.used, m.total) > 75)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Capacity Planning"
        description="Resource utilization and growth projections"
        onRefresh={() => void load()}
        refreshing={loading}
      />
      <PageLoadBanner title="Could not load capacity data" headline={loadError} onRetry={() => void load()} />
      {loading && !loadError && (
        <div className="flex items-center justify-center h-32 text-slate-400">
          <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mr-3" />
          Loading capacity data…
        </div>
      )}
      {!loadError && (
      <>

      {warningResources.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-400">Capacity Warning</p>
            <p className="text-xs text-slate-400 mt-1">{warningResources.map(r => r.label).join(', ')} usage above 75% threshold</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card-blue rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{vmCount}</div>
          <div className="text-xs text-slate-400 mt-1">Active VMs</div>
        </div>
        <div className="stat-card-green rounded-xl border border-slate-700/50 p-5 card-glow-green transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{metrics.length}</div>
          <div className="text-xs text-slate-400 mt-1">Resources Tracked</div>
        </div>
        <div className="stat-card-orange rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{warningResources.length}</div>
          <div className="text-xs text-slate-400 mt-1">Over 75% Usage</div>
        </div>
        <div className="stat-card-purple rounded-xl border border-slate-700/50 p-5 card-glow-purple transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{metrics.filter(m => m.trend > 0).length}</div>
          <div className="text-xs text-slate-400 mt-1">Growing Resources</div>
        </div>
      </div>

      <div className="space-y-4">
        {metrics.map((m, idx) => {
          const pct = usagePercent(m.used, m.total)
          const icon = m.label.toLowerCase().includes('cpu') ? <Cpu className="w-5 h-5 text-blue-400" /> :
                       m.label.toLowerCase().includes('memory') || m.label.toLowerCase().includes('ram') ? <Database className="w-5 h-5 text-purple-400" /> :
                       <HardDrive className="w-5 h-5 text-teal-400" />
          return (
            <div key={idx} className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {icon}
                  <div>
                    <h3 className="text-sm font-semibold text-white">{m.label}</h3>
                    <p className="text-xs text-slate-500">{fmtVal(m.used, m.unit)} / {fmtVal(m.total, m.unit)} used</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-white">{pct.toFixed(1)}%</div>
                  <div className={`text-xs flex items-center gap-1 justify-end ${trendColor(m.trend)}`}>
                    {m.trend > 0 ? <TrendingUp className="w-3 h-3" /> : m.trend < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                    {m.trend > 0 ? '+' : ''}{m.trend.toFixed(1)}%/week
                  </div>
                </div>
              </div>

              <div className="h-3 rounded-full bg-slate-700 overflow-hidden mb-2">
                <div className={`h-full rounded-full transition-all duration-500 ${barColor(pct)}`} style={{ width: `${pct}%` }} />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{fmtVal(m.total - m.used, m.unit)} available</span>
                {m.projected_full && m.projected_full !== 'N/A' && (
                  <span className="text-amber-400">Projected full: {m.projected_full}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {metrics.length === 0 && (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500 text-sm">No capacity data available</div>
      )}
      </>
      )}
    </div>
  )
}
