// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import { PageHeader } from '../components/ui'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

export default function Kernel() {
  const toast = useToastContext()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [moduleFilter, setModuleFilter] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/system/kernel')
      if (!res.ok) {
        const body = await res.text()
        throw new Error(formatHttpErrorBody(res.status, res.statusText, body))
      }
      setData(await res.json())
      setLoadError(null)
      setRefreshError(null)
    } catch (err) {
      const msg = formatUserError(err)
      setData((prev: any) => {
        if (prev == null) {
          setLoadError(msg)
          toastFailure(toast, 'Failed to load kernel data', err)
        } else {
          setRefreshError(msg)
        }
        return prev
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  const modules: any[] = data?.modules || []
  const sysctls: any[] = data?.sysctl || (data?.sysctl_params ? Object.entries(data.sysctl_params).map(([k, v]) => ({ key: k, value: v })) : [])
  const filteredModules = moduleFilter
    ? modules.filter((m: any) => (typeof m === 'string' ? m : m.name || '').toLowerCase().includes(moduleFilter.toLowerCase()))
    : modules

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kernel"
        description="Kernel information and configuration"
        onRefresh={fetchData}
        refreshing={loading}
      />

      {loadError && (
        <ErrorBanner
          title="Could not load kernel data"
          headline={loadError}
          hints={hintsForError(loadError)}
          onRetry={fetchData}
        />
      )}

      {refreshError && !loadError && (
        <div className="bg-amber-500/10 rounded-lg border border-amber-500/30 px-4 py-2 text-xs text-amber-400">
          Refresh failed: {refreshError} — showing last known data
        </div>
      )}

      {loading && !data && !loadError ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !loadError ? (
        <>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="stat-card-purple rounded-xl border border-[#d2d2d7] px-4 py-3 card-glow-purple transition-all hover:scale-[1.02]">
          <div className="text-xs text-[#6e6e73] mb-1">Kernel Version</div>
          <div className="text-sm font-bold text-[#1d1d1f] truncate">{data?.version || data?.kernel_version || '-'}</div>
        </div>
        <div className="stat-card-blue rounded-xl border border-[#d2d2d7] px-4 py-3 card-glow transition-all hover:scale-[1.02]">
          <div className="text-xs text-[#6e6e73] mb-1">Hostname</div>
          <div className="text-sm font-bold text-[#1d1d1f] truncate">{data?.hostname || '-'}</div>
        </div>
        <div className="stat-card-cyan rounded-xl border border-[#d2d2d7] px-4 py-3 card-glow-cyan transition-all hover:scale-[1.02]">
          <div className="text-xs text-[#6e6e73] mb-1">Architecture</div>
          <div className="text-sm font-bold text-[#1d1d1f]">{data?.architecture || data?.arch || '-'}</div>
        </div>
        <div className="stat-card-green rounded-xl border border-[#d2d2d7] px-4 py-3 card-glow-green transition-all hover:scale-[1.02]">
          <div className="text-xs text-[#6e6e73] mb-1">Modules Loaded</div>
          <div className="text-2xl font-bold text-[#1d1d1f]">{modules.length}</div>
        </div>
      </div>

      {(data?.cmdline || data?.boot_cmdline) && (
        <div className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] p-5">
          <h3 className="text-base font-semibold text-[#1d1d1f] mb-3">Boot Command Line</h3>
          <pre className="text-xs text-[#1d1d1f] bg-white rounded-lg p-4 overflow-x-auto font-mono whitespace-pre-wrap break-all">
            {data.cmdline || data.boot_cmdline}
          </pre>
        </div>
      )}

      {modules.length > 0 && (
        <div className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#d2d2d7] flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold text-[#1d1d1f]">Kernel Modules</h3>
              <span className="text-xs font-medium text-[#6e6e73] bg-[#e8e8ed] px-2.5 py-1 rounded-full">
                {filteredModules.length} / {modules.length}
              </span>
            </div>
            <input
              type="text"
              placeholder="Filter modules..."
              aria-label="Filter modules"
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-[#d2d2d7] rounded-lg text-[#1d1d1f] placeholder-[#6e6e73] focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
            />
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-[#d2d2d7]">
                  <th className="text-left px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Name</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Size</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Used By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d2d2d7]/30">
                {filteredModules.slice(0, 100).map((mod: any, i: number) => {
                  const name = typeof mod === 'string' ? mod : mod.name
                  const size = typeof mod === 'object' ? mod.size : undefined
                  const usedBy = typeof mod === 'object' ? (mod.used_by || mod.dependents) : undefined
                  return (
                    <tr key={i} className="table-row-hover">
                      <td className="px-5 py-2 text-xs text-[#1d1d1f] font-mono">{name}</td>
                      <td className="px-5 py-2 text-xs text-right text-[#6e6e73]">{size ?? '-'}</td>
                      <td className="px-5 py-2 text-xs text-right text-[#6e6e73]">
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
        <div className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#d2d2d7] flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#1d1d1f]">Sysctl Parameters</h3>
            <span className="text-xs font-medium text-[#6e6e73] bg-[#e8e8ed] px-2.5 py-1 rounded-full">
              {sysctls.length} params
            </span>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-[#d2d2d7]">
                  <th className="text-left px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Key</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d2d2d7]/30">
                {sysctls.map((param: any, i: number) => (
                  <tr key={i} className="table-row-hover">
                    <td className="px-5 py-2 text-xs text-[#1d1d1f] font-mono">{param.key || param.name || '-'}</td>
                    <td className="px-5 py-2 text-xs text-[#1d1d1f] font-mono break-all">{String(param.value ?? '-')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      ) : null}
    </div>
  )
}
