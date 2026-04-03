import { useState, useCallback } from 'react'
import { apiFetch } from '../api/client'

type MetricKey = 'cpu' | 'memory' | 'disk' | 'network'

const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'cpu', label: 'CPU' },
  { key: 'memory', label: 'Memory' },
  { key: 'disk', label: 'Disk' },
  { key: 'network', label: 'Network' },
]

function statusBadgeClasses(status: string): string {
  switch (status?.toLowerCase()) {
    case 'critical': return 'bg-red-500/20 text-red-400'
    case 'elevated':
    case 'warning': return 'bg-amber-500/20 text-amber-400'
    case 'normal':
    case 'healthy': return 'bg-emerald-500/20 text-emerald-400'
    default: return 'bg-slate-500/20 text-slate-400'
  }
}

function impactBadgeClasses(impact: string): string {
  switch (impact?.toLowerCase()) {
    case 'high': return 'bg-red-500/20 text-red-400'
    case 'medium': return 'bg-amber-500/20 text-amber-400'
    case 'low': return 'bg-blue-500/20 text-blue-400'
    default: return 'bg-slate-500/20 text-slate-400'
  }
}

function trendArrow(trend: string): string {
  switch (trend?.toLowerCase()) {
    case 'up':
    case 'increasing': return '\u2191'
    case 'down':
    case 'decreasing': return '\u2193'
    default: return '\u2192'
  }
}

export default function Explain() {
  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null)
  const [explanation, setExplanation] = useState<any | null>(null)
  const [timeseries, setTimeseries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchExplanation = useCallback(async (metric: MetricKey) => {
    setActiveMetric(metric)
    setLoading(true)
    setError(null)
    setExplanation(null)
    setTimeseries([])

    try {
      const [explainRes, tsRes] = await Promise.all([
        apiFetch(`/api/system/explain/${metric}`),
        apiFetch(`/api/system/timeseries?period=1h&metric=${metric}`),
      ])

      if (!explainRes.ok) throw new Error(`HTTP ${explainRes.status}`)
      const explainData = await explainRes.json()
      setExplanation(explainData)

      if (tsRes.ok) {
        const tsData = await tsRes.json()
        setTimeseries(Array.isArray(tsData) ? tsData : tsData.points ?? [])
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const maxValue = Math.max(...timeseries.map((s: any) => s.value ?? 0), 1)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Explain</h1>
        <p className="text-sm text-slate-400 mt-1">AI-powered metric explanations and recommendations</p>
      </div>

      <div className="flex gap-3">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => fetchExplanation(m.key)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeMetric === m.key
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800/50 border border-slate-700/50 text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40 text-slate-400">
          <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mr-3" />
          Analyzing {activeMetric}...
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 rounded-xl border border-red-500/30 p-6 text-center">
          <p className="text-red-400 font-medium">Failed to load explanation</p>
          <p className="text-red-400/70 text-sm mt-1">{error}</p>
          {activeMetric && <button onClick={() => fetchExplanation(activeMetric)} className="mt-3 px-4 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors">Retry</button>}
        </div>
      )}

      {!activeMetric && !loading && (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500 text-sm">
          Select a metric above to view its explanation
        </div>
      )}

      {explanation && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-2">Current Value</div>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold text-white">
                  {explanation.current_value ?? explanation.value ?? '-'}
                </span>
                <span className="text-2xl">
                  {trendArrow(explanation.trend)}
                </span>
              </div>
              {explanation.unit && (
                <div className="text-xs text-slate-500 mt-1">{explanation.unit}</div>
              )}
            </div>
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-2">Status</div>
              <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${statusBadgeClasses(explanation.status)}`}>
                {explanation.status ?? 'unknown'}
              </span>
              {explanation.summary && (
                <p className="text-sm text-slate-400 mt-3">{explanation.summary}</p>
              )}
            </div>
          </div>

          {timeseries.length > 0 && (
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <h3 className="text-sm font-semibold text-white mb-4">Last Hour</h3>
              <div className="flex items-end gap-px h-32">
                {timeseries.map((sample: any, idx: number) => {
                  const value = sample.value ?? 0
                  const heightPct = Math.max((value / maxValue) * 100, 1)
                  return (
                    <div
                      key={idx}
                      className="flex-1 bg-blue-500 hover:bg-blue-400 rounded-t-sm transition-colors min-w-[2px]"
                      style={{ height: `${heightPct}%` }}
                      title={`${value.toFixed(1)} at ${sample.timestamp ?? idx}`}
                    />
                  )
                })}
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-xs text-slate-500">1h ago</span>
                <span className="text-xs text-slate-500">now</span>
              </div>
            </div>
          )}

          {explanation.factors && explanation.factors.length > 0 && (
            <div>
              <h3 className="text-base font-semibold text-white mb-3">Contributing Factors</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {explanation.factors.map((factor: any, idx: number) => (
                  <div
                    key={idx}
                    className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-white">{factor.name ?? factor.title ?? `Factor ${idx + 1}`}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${impactBadgeClasses(factor.impact)}`}>
                        {factor.impact ?? 'unknown'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400">{factor.description ?? factor.detail ?? ''}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {explanation.recommendations && explanation.recommendations.length > 0 && (
            <div>
              <h3 className="text-base font-semibold text-white mb-3">Recommendations</h3>
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 divide-y divide-slate-700/30">
                {explanation.recommendations.map((rec: any, idx: number) => {
                  const text = typeof rec === 'string' ? rec : rec.text ?? rec.description ?? ''
                  return (
                    <div key={idx} className="px-4 py-3 flex items-start gap-3">
                      <span className="text-emerald-400 mt-0.5 flex-shrink-0">&#10003;</span>
                      <span className="text-sm text-slate-300">{text}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
