// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { GitCompare } from 'lucide-react'
import { apiFetch } from '../api/client'
import { listVMs } from '../api/vm'
import ErrorBanner from '../components/ErrorBanner'
import { PageHeader } from '../components/ui'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

interface VMOption {
  name: string
  state?: string
}

interface CompareField {
  label: string
  source: string
  target: string
  match: boolean
}

interface CompareResult {
  source_name: string
  target_name: string
  fields: CompareField[]
  timestamp: string
}

export default function VMCompare() {
  const toast = useToastContext()
  const [vms, setVMs] = useState<VMOption[]>([])
  const [sourceVM, setSourceVM] = useState('')
  const [targetVM, setTargetVM] = useState('')
  const [result, setResult] = useState<CompareResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingVMs, setLoadingVMs] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [compareError, setCompareError] = useState<string | null>(null)

  const fetchVMs = useCallback(async () => {
    setLoadingVMs(true)
    setLoadError(null)
    try {
      setVMs((await listVMs()).map((vm) => ({ name: vm.name, state: vm.state })))
    } catch (err) {
      const msg = formatUserError(err)
      setLoadError(msg)
      toastFailure(toast, 'Failed to load VMs', err)
    } finally {
      setLoadingVMs(false)
    }
  }, [toast])

  useEffect(() => {
    fetchVMs()
  }, [fetchVMs])

  const handleCompare = async () => {
    if (!sourceVM || !targetVM) return
    setLoading(true)
    setCompareError(null)
    setResult(null)
    try {
      const res = await apiFetch(
        `/api/vms/compare?source=${encodeURIComponent(sourceVM)}&target=${encodeURIComponent(targetVM)}`,
      )
      if (!res.ok) {
        const body = await res.text()
        throw new Error(formatHttpErrorBody(res.status, res.statusText, body))
      }
      setResult(await res.json())
    } catch (err) {
      const msg = formatUserError(err)
      setCompareError(msg)
      toastFailure(toast, 'VM comparison failed', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="VM Comparison"
        description="Compare two VM configurations side-by-side"
        onRefresh={fetchVMs}
        refreshing={loadingVMs}
      />

      {loadError && (
        <ErrorBanner
          title="Could not load virtual machines"
          headline={loadError}
          hints={hintsForError(loadError, 'vm')}
          onRetry={fetchVMs}
        />
      )}

      {compareError && (
        <ErrorBanner
          title="Comparison failed"
          headline={compareError}
          hints={hintsForError(compareError, 'vm')}
        />
      )}

      {loadingVMs && !loadError ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 flex flex-col items-center justify-center text-slate-500 gap-3">
          <div className="w-6 h-6 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-sm">Loading VM list…</span>
        </div>
      ) : !loadError ? (
        <>
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Source VM</label>
                <select
                  value={sourceVM}
                  onChange={(e) => setSourceVM(e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select source VM…</option>
                  {vms.map((vm) => (
                    <option key={vm.name} value={vm.name}>
                      {vm.name} {vm.state ? `(${vm.state})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Target VM</label>
                <select
                  value={targetVM}
                  onChange={(e) => setTargetVM(e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select target VM…</option>
                  {vms
                    .filter((v) => v.name !== sourceVM)
                    .map((vm) => (
                      <option key={vm.name} value={vm.name}>
                        {vm.name} {vm.state ? `(${vm.state})` : ''}
                      </option>
                    ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleCompare}
                disabled={loading || !sourceVM || !targetVM}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <GitCompare className="w-4 h-4" />
                {loading ? 'Comparing…' : 'Compare'}
              </button>
            </div>
          </div>

          {result && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  {result.source_name} vs {result.target_name}
                </h3>
                <span className="text-xs text-slate-500">
                  {new Date(result.timestamp).toLocaleString()}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-700/20">
                    <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase">Field</th>
                    <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase">Source</th>
                    <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase">Target</th>
                    <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase w-20">Match</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {result.fields.map((field) => (
                    <tr key={field.label} className="hover:bg-slate-700/20">
                      <td className="p-3 text-slate-300 font-medium">{field.label}</td>
                      <td className="p-3 text-slate-400 font-mono text-xs">{field.source}</td>
                      <td className="p-3 text-slate-400 font-mono text-xs">{field.target}</td>
                      <td className="p-3">
                        <span
                          className={`text-xs font-medium ${field.match ? 'text-green-400' : 'text-amber-400'}`}
                        >
                          {field.match ? 'Yes' : 'No'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
