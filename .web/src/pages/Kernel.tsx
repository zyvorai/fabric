// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect } from 'react'
import { apiFetch } from '../api/client'

export default function Kernel() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [moduleFilter, setModuleFilter] = useState('')

  useEffect(() => {
    let active = true

    const fetchData = () => {
      apiFetch('/api/system/kernel')
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then((json) => {
          if (active) {
            setData(json)
            setError(null)
            setLoading(false)
          }
        })
        .catch((err) => {
          if (active) {
            setError(err.message)
            setLoading(false)
          }
        })
    }

    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="bg-red-500/10 rounded-xl border border-red-500/30 p-6 text-center">
        <p className="text-sm font-semibold text-red-400">Failed to load kernel data</p>
        <p className="text-xs text-red-400/70 mt-1">{error}</p>
        <button onClick={() => { setLoading(true); setError(null) }} className="mt-3 px-4 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors">Retry</button>
      </div>
    )
  }

  const modules: any[] = data?.modules || []
  const sysctls: any[] = data?.sysctl || (data?.sysctl_params ? Object.entries(data.sysctl_params).map(([k, v]) => ({ key: k, value: v })) : [])
  const filteredModules = moduleFilter
    ? modules.filter((m: any) => (typeof m === 'string' ? m : m.name || '').toLowerCase().includes(moduleFilter.toLowerCase()))
    : modules

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gradient-purple">Kernel</h1>
        <p className="text-sm text-slate-400 mt-1">Kernel information and configuration</p>
      </div>

      {error && (
        <div className="bg-amber-500/10 rounded-lg border border-amber-500/30 px-4 py-2 text-xs text-amber-400">
          Connection issue: {error} - showing last known data
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card-purple rounded-xl border border-slate-700/50 p-5 card-glow-purple transition-all hover:scale-[1.02]">
          <div className="text-xs text-slate-400 mb-1">Kernel Version</div>
          <div className="text-sm font-bold text-white truncate">{data?.version || data?.kernel_version || '-'}</div>
        </div>
        <div className="stat-card-blue rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="text-xs text-slate-400 mb-1">Hostname</div>
          <div className="text-sm font-bold text-white truncate">{data?.hostname || '-'}</div>
        </div>
        <div className="stat-card-cyan rounded-xl border border-slate-700/50 p-5 card-glow-cyan transition-all hover:scale-[1.02]">
          <div className="text-xs text-slate-400 mb-1">Architecture</div>
          <div className="text-sm font-bold text-white">{data?.architecture || data?.arch || '-'}</div>
        </div>
        <div className="stat-card-green rounded-xl border border-slate-700/50 p-5 card-glow-green transition-all hover:scale-[1.02]">
          <div className="text-xs text-slate-400 mb-1">Modules Loaded</div>
          <div className="text-2xl font-bold text-white">{modules.length}</div>
        </div>
      </div>

      {(data?.cmdline || data?.boot_cmdline) && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-base font-semibold text-white mb-3">Boot Command Line</h3>
          <pre className="text-xs text-slate-300 bg-slate-900/50 rounded-lg p-4 overflow-x-auto font-mono whitespace-pre-wrap break-all">
            {data.cmdline || data.boot_cmdline}
          </pre>
        </div>
      )}

      {modules.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold text-white">Kernel Modules</h3>
              <span className="text-xs font-medium text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">
                {filteredModules.length} / {modules.length}
              </span>
            </div>
            <input
              type="text"
              placeholder="Filter modules..."
              aria-label="Filter modules"
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-900/50 border border-slate-700/50 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
            />
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-800">
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Size</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Used By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {filteredModules.slice(0, 100).map((mod: any, i: number) => {
                  const name = typeof mod === 'string' ? mod : mod.name
                  const size = typeof mod === 'object' ? mod.size : undefined
                  const usedBy = typeof mod === 'object' ? (mod.used_by || mod.dependents) : undefined
                  return (
                    <tr key={i} className="table-row-hover">
                      <td className="px-5 py-2 text-xs text-white font-mono">{name}</td>
                      <td className="px-5 py-2 text-xs text-right text-slate-400">{size ?? '-'}</td>
                      <td className="px-5 py-2 text-xs text-right text-slate-400">
                        {Array.isArray(usedBy) ? usedBy.join(', ') : usedBy ?? '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sysctls.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Sysctl Parameters</h3>
            <span className="text-xs font-medium text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">
              {sysctls.length} params
            </span>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-800">
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Key</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {sysctls.map((param: any, i: number) => (
                  <tr key={i} className="table-row-hover">
                    <td className="px-5 py-2 text-xs text-white font-mono">{param.key || param.name || '-'}</td>
                    <td className="px-5 py-2 text-xs text-slate-300 font-mono break-all">{String(param.value ?? '-')}</td>
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
