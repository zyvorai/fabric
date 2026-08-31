// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../api/client'
import { PageHeader } from '../components/ui'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'

type PanelKey = 'top' | 'iostat' | 'vmstat' | 'netstat'

const PANELS: { key: PanelKey; label: string; endpoint: string }[] = [
  { key: 'top', label: 'Top', endpoint: '/api/system/debug/top' },
  { key: 'iostat', label: 'IOStat', endpoint: '/api/system/debug/iostat' },
  { key: 'vmstat', label: 'VMStat', endpoint: '/api/system/debug/vmstat' },
  { key: 'netstat', label: 'NetStat', endpoint: '/api/system/debug/netstat' },
]

interface PanelState {
  lines: string[]
  loading: boolean
  error: string | null
}

export default function Debug() {
  const [panels, setPanels] = useState<Record<PanelKey, PanelState>>({
    top: { lines: [], loading: false, error: null },
    iostat: { lines: [], loading: false, error: null },
    vmstat: { lines: [], loading: false, error: null },
    netstat: { lines: [], loading: false, error: null },
  })
  const [autoRefresh, setAutoRefresh] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchPanel = useCallback(async (key: PanelKey) => {
    const panel = PANELS.find((p) => p.key === key)!
    setPanels((prev) => ({ ...prev, [key]: { ...prev[key], loading: true, error: null } }))
    try {
      const res = await apiFetch(panel.endpoint)
      if (!res.ok) {
        const body = await res.text()
        throw new Error(formatHttpErrorBody(res.status, res.statusText, body))
      }
      const data = await res.json()
      const lines = Array.isArray(data.lines) ? data.lines : []
      setPanels((prev) => ({ ...prev, [key]: { lines, loading: false, error: null } }))
    } catch (err) {
      setPanels((prev) => ({ ...prev, [key]: { ...prev[key], loading: false, error: formatUserError(err) } }))
    }
  }, [])

  const fetchAll = useCallback(() => {
    PANELS.forEach((p) => fetchPanel(p.key))
  }, [fetchPanel])

  useEffect(() => {
    if (autoRefresh) {
      fetchAll()
      intervalRef.current = setInterval(fetchAll, 3000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [autoRefresh, fetchAll])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Debug"
        description="System diagnostic tools"
        onRefresh={fetchAll}
        actions={
        <div className="flex items-center gap-3">
          <button
            onClick={fetchAll}
            title="Refresh all panels"
            className="px-4 py-2 bg-[#0066cc] hover:bg-[#0077ed] text-white text-sm font-medium rounded-lg transition-colors"
          >
            Refresh All
          </button>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={() => setAutoRefresh((v) => !v)} className="sr-only" />
            <div className={`w-10 h-5 rounded-full transition-colors relative ${autoRefresh ? 'bg-[#0066cc]' : 'bg-[#e8e8ed]'}`}>
              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${autoRefresh ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-[#1d1d1f]">Auto-refresh (3s)</span>
          </label>
        </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {PANELS.map((panel) => {
          const state = panels[panel.key]
          return (
            <div key={panel.key} className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#d2d2d7] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#1d1d1f]">{panel.label}</h3>
                <button
                  onClick={() => fetchPanel(panel.key)}
                  disabled={state.loading}
                  className="px-3 py-1 text-xs bg-[#e8e8ed] hover:bg-[#d2d2d7] text-[#1d1d1f] rounded-lg transition-colors disabled:opacity-50"
                >
                  {state.loading ? 'Loading...' : 'Refresh'}
                </button>
              </div>
              <div className="p-2">
                {state.error ? (
                  <div className="p-4 text-center text-red-600 text-sm">{state.error}</div>
                ) : state.lines.length === 0 && !state.loading ? (
                  <div className="p-4 text-center text-[#6e6e73] text-sm">
                    Click Refresh to load data
                  </div>
                ) : (
                  <pre className="bg-[#f5f5f7] rounded-lg p-4 text-emerald-600 text-xs font-mono overflow-x-auto max-h-80 overflow-y-auto whitespace-pre">
                    {state.lines.join('\n')}
                  </pre>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
