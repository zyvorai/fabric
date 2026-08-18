// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { Zap, CheckCircle, AlertTriangle, Loader2, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { apiFetch } from '../api/client'
import PageLoadBanner from '../components/PageLoadBanner'
import { PageHeader } from '../components/ui'
import { formatHttpErrorBody } from '../utils/apiError'
import { usePageLoader } from '../hooks/usePageLoader'
import { useToastContext } from '../contexts/ToastContext'
import { toastFailure } from '../utils/toastError'

interface Recommendation {
  resource: string
  current_value: string
  recommended_value: string
  reason: string
  impact: string
}

interface VMOptimization {
  vm_name: string
  recommendations: Recommendation[]
}

interface OptimizationResult {
  vm_name: string
  applied: string[]
  skipped: string[]
}

function impactColor(impact: string): string {
  switch (impact?.toLowerCase()) {
    case 'high': return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'medium': return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30'
  }
}

function impactIcon(impact: string) {
  switch (impact?.toLowerCase()) {
    case 'high': return <TrendingUp className="w-3.5 h-3.5" />
    case 'medium': return <Minus className="w-3.5 h-3.5" />
    default: return <TrendingDown className="w-3.5 h-3.5" />
  }
}

export default function ResourceOptimizer() {
  const toast = useToastContext()
  const [optimizations, setOptimizations] = useState<VMOptimization[]>([])
  const { loading, loadError, run } = usePageLoader('Failed to load recommendations')
    const [applying, setApplying] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, OptimizationResult>>({})

  const fetchRecommendations = useCallback(() => {
    return run(async () => {
      const res = await apiFetch('/api/system/optimization/recommendations')
      if (!res.ok) {
        const body = await res.text()
        throw new Error(formatHttpErrorBody(res.status, res.statusText, body))
      }
      const data = await res.json()
      setOptimizations(Array.isArray(data) ? data : data.recommendations || [])
    })
  }, [run])

  useEffect(() => { fetchRecommendations() }, [fetchRecommendations])

  const applyOptimization = async (vmName: string) => {
    setApplying(vmName)
    try {
      const res = await apiFetch(`/api/vms/${vmName}/optimize`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(formatHttpErrorBody(res.status, res.statusText, body))
      }
      const result = await res.json()
      setResults(prev => ({ ...prev, [vmName]: result }))
    } catch (err) {
      toastFailure(toast, `Failed to optimize ${vmName}`, err)
    } finally { setApplying(null) }
  }

  const totalRecs = optimizations.reduce((sum, o) => sum + o.recommendations.length, 0)
  const highImpact = optimizations.reduce((sum, o) => sum + o.recommendations.filter(r => r.impact?.toLowerCase() === 'high').length, 0)
  const medImpact = optimizations.reduce((sum, o) => sum + o.recommendations.filter(r => r.impact?.toLowerCase() === 'medium').length, 0)

  if (loading && optimizations.length === 0 && !loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Resource Optimizer" description="Right-sizing recommendations for your VMs" />
        <div className="flex items-center justify-center h-64 text-slate-400">
          <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mr-3" />
          Analyzing resources…
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resource Optimizer"
        description="Right-sizing recommendations for your VMs"
        onRefresh={() => void fetchRecommendations()}
        refreshing={loading}
      />
      <PageLoadBanner title="Could not load recommendations" headline={loadError} onRetry={() => void fetchRecommendations()} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="stat-card-blue rounded-xl border border-slate-700/50 px-4 py-3 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{optimizations.length}</div>
          <div className="text-xs text-slate-400 mt-1">VMs Analyzed</div>
        </div>
        <div className="stat-card-purple rounded-xl border border-slate-700/50 px-4 py-3 card-glow-purple transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{totalRecs}</div>
          <div className="text-xs text-slate-400 mt-1">Recommendations</div>
        </div>
        <div className="stat-card-red rounded-xl border border-slate-700/50 px-4 py-3 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{highImpact}</div>
          <div className="text-xs text-slate-400 mt-1">High Impact</div>
        </div>
        <div className="stat-card-orange rounded-xl border border-slate-700/50 px-4 py-3 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{medImpact}</div>
          <div className="text-xs text-slate-400 mt-1">Medium Impact</div>
        </div>
      </div>

      {optimizations.length === 0 ? (
        <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-10 text-center">
          <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="text-sm text-green-400 font-medium">All VMs are optimally configured</p>
          <p className="text-xs text-slate-500 mt-1">No right-sizing recommendations at this time</p>
        </div>
      ) : (
        <div className="space-y-4">
          {optimizations.map((opt) => {
            const result = results[opt.vm_name]
            return (
              <div key={opt.vm_name} className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-semibold text-white">{opt.vm_name}</h3>
                    <span className="text-xs font-medium text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">{opt.recommendations.length} recommendations</span>
                  </div>
                  <button
                    onClick={() => applyOptimization(opt.vm_name)}
                    disabled={applying === opt.vm_name || !!result}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-r from-yellow-600 to-amber-600 text-white hover:from-yellow-500 hover:to-amber-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-yellow-600/20"
                  >
                    {applying === opt.vm_name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    {result ? 'Applied' : applying === opt.vm_name ? 'Applying...' : 'Auto-Optimize'}
                  </button>
                </div>

                <div className="divide-y divide-slate-700/30">
                  {opt.recommendations.map((rec, idx) => (
                    <div key={idx} className="px-5 py-3 flex items-start gap-4">
                      <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium ${impactColor(rec.impact)}`}>
                        {impactIcon(rec.impact)}
                        {rec.impact}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white capitalize">{rec.resource}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{rec.reason}</div>
                        <div className="flex items-center gap-3 mt-2">
                          <div className="bg-slate-900/50 rounded-lg px-3 py-1.5">
                            <div className="text-[10px] text-slate-500">Current</div>
                            <div className="text-xs font-semibold text-slate-300">{rec.current_value}</div>
                          </div>
                          <span className="text-slate-600">&rarr;</span>
                          <div className="bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-1.5">
                            <div className="text-[10px] text-green-400/70">Recommended</div>
                            <div className="text-xs font-semibold text-green-400">{rec.recommended_value}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {result && (
                  <div className="px-5 py-3 bg-slate-900/30 border-t border-slate-700/50">
                    <div className="flex items-center gap-2 text-xs">
                      {result.applied.length > 0 && <span className="text-green-400"><CheckCircle className="w-3.5 h-3.5 inline mr-1" />{result.applied.length} applied</span>}
                      {result.skipped.length > 0 && <span className="text-amber-400"><AlertTriangle className="w-3.5 h-3.5 inline mr-1" />{result.skipped.length} skipped</span>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
