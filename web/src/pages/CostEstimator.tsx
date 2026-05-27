// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { apiFetch } from '../api/client'

interface ProviderEstimate {
  name: string
  pricePerGB: number
  color: string
  monthly: number
  annual: number
  total: number
}

const PROVIDERS = [
  { name: 'AWS S3', pricePerGB: 0.023, color: 'bg-orange-500' },
  { name: 'Azure Blob', pricePerGB: 0.018, color: 'bg-blue-500' },
  { name: 'GCS', pricePerGB: 0.020, color: 'bg-red-500' },
]

const ON_PREM_PRICE = 0.10

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

export default function CostEstimator() {
  const [vmCount, setVmCount] = useState(10)
  const [avgSizeGB, setAvgSizeGB] = useState(100)
  const [includeSnapshots, setIncludeSnapshots] = useState(false)
  const [durationMonths, setDurationMonths] = useState(12)
  const [calculated, setCalculated] = useState(false)
  const [estimates, setEstimates] = useState<ProviderEstimate[]>([])
  const [onPremMonthly, setOnPremMonthly] = useState(0)
  const [copied, setCopied] = useState(false)

  const totalGB = vmCount * avgSizeGB * (includeSnapshots ? 1.5 : 1)

  const handleCalculate = async () => {
    try {
      const resp = await apiFetch('/api/cost/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vm_count: vmCount,
          avg_size_gb: avgSizeGB,
          include_snapshots: includeSnapshots,
          duration_months: durationMonths,
        }),
      })
      if (resp.ok) {
        const data = await resp.json()
        if (data.estimates) {
          setEstimates(data.estimates)
          setOnPremMonthly(data.on_prem_monthly || totalGB * ON_PREM_PRICE)
          setCalculated(true)
          return
        }
      }
    } catch {
      // Fall through to client-side calculation
    }

    const results = PROVIDERS.map((p) => {
      const monthly = totalGB * p.pricePerGB
      return {
        ...p,
        monthly,
        annual: monthly * 12,
        total: monthly * durationMonths,
      }
    })
    setEstimates(results)
    setOnPremMonthly(totalGB * ON_PREM_PRICE)
    setCalculated(true)
  }

  const cheapest = estimates.length > 0
    ? estimates.reduce((min, e) => (e.monthly < min.monthly ? e : min), estimates[0])
    : null

  const maxMonthly = estimates.length > 0
    ? Math.max(...estimates.map((e) => e.monthly), onPremMonthly)
    : 1

  const handleCopy = () => {
    if (!calculated) return
    const lines = [
      'vmspawnd Storage Cost Estimate',
      '================================',
      `VMs: ${vmCount}`,
      `Avg Size: ${avgSizeGB} GB`,
      `Total Storage: ${totalGB.toFixed(0)} GB${includeSnapshots ? ' (incl. snapshots)' : ''}`,
      `Duration: ${durationMonths} months`,
      '',
      'Provider Estimates:',
      ...estimates.map(
        (e) =>
          `  ${e.name}: ${formatCurrency(e.monthly)}/mo | ${formatCurrency(e.annual)}/yr | ${formatCurrency(e.total)} total`
      ),
      '',
      `On-Prem Estimate: ${formatCurrency(onPremMonthly)}/mo`,
      cheapest
        ? `Cheapest Cloud: ${cheapest.name} (saves ${formatCurrency(onPremMonthly - cheapest.monthly)}/mo vs on-prem)`
        : '',
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Storage Cost Estimator</h2>
        <p className="text-sm text-slate-400 mt-1">
          Compare cloud storage costs for your VM infrastructure
        </p>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-5">
        <h3 className="text-sm font-semibold text-slate-200">Configuration</h3>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <label className="text-slate-400">Number of VMs</label>
            <span className="text-slate-200 font-medium">{vmCount}</span>
          </div>
          <input
            type="range"
            min={1}
            max={1000}
            value={vmCount}
            onChange={(e) => setVmCount(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-0.5">
            <span>1</span>
            <span>1000</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <label className="text-slate-400">Average VM Size (GB)</label>
            <span className="text-slate-200 font-medium">{avgSizeGB} GB</span>
          </div>
          <input
            type="range"
            min={10}
            max={2000}
            step={10}
            value={avgSizeGB}
            onChange={(e) => setAvgSizeGB(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-0.5">
            <span>10 GB</span>
            <span>2 TB</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <label className="text-slate-400">Storage Duration (months)</label>
            <span className="text-slate-200 font-medium">{durationMonths} months</span>
          </div>
          <input
            type="range"
            min={1}
            max={36}
            value={durationMonths}
            onChange={(e) => setDurationMonths(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-0.5">
            <span>1 mo</span>
            <span>36 mo</span>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={includeSnapshots} onChange={() => setIncludeSnapshots(!includeSnapshots)} className="sr-only peer" />
          <div className={`relative w-10 h-5 rounded-full transition-colors ${includeSnapshots ? 'bg-green-600' : 'bg-slate-600'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${includeSnapshots ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm text-slate-300">Include snapshots (+50% storage)</span>
        </label>

        <div className="bg-slate-900/40 rounded-lg px-3 py-2 text-xs text-slate-400">
          Total estimated storage:{' '}
          <span className="text-green-400 font-medium">
            {totalGB >= 1000 ? `${(totalGB / 1000).toFixed(1)} TB` : `${totalGB.toFixed(0)} GB`}
          </span>
        </div>

        <button
          onClick={handleCalculate}
          title="Calculate storage costs"
          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors"
        >
          Calculate Costs
        </button>
      </div>

      {calculated && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {estimates.map((est) => {
              const isCheapest = cheapest && est.name === cheapest.name
              return (
                <div
                  key={est.name}
                  className={`bg-slate-800/50 rounded-xl p-5 border transition-colors ${
                    isCheapest
                      ? 'border-green-500/60 ring-1 ring-green-500/20'
                      : 'border-slate-700/50'
                  }`}
                >
                  {isCheapest && (
                    <span className="text-xs font-semibold text-green-400 bg-green-500/10 px-2 py-0.5 rounded mb-2 inline-block">
                      Cheapest
                    </span>
                  )}
                  <h4 className="text-lg font-bold text-slate-200">{est.name}</h4>
                  <p className="text-xs text-slate-500 mb-3">${est.pricePerGB}/GB/month</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Monthly</span>
                      <span className="text-slate-200 font-medium">{formatCurrency(est.monthly)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Annual</span>
                      <span className="text-slate-200 font-medium">{formatCurrency(est.annual)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-slate-700/50 pt-2">
                      <span className="text-slate-400">Total ({durationMonths}mo)</span>
                      <span className="text-white font-semibold">{formatCurrency(est.total)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {cheapest && (
            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-5">
              <h4 className="text-sm font-semibold text-green-400 mb-2">
                Savings vs On-Premises Storage
              </h4>
              <p className="text-xs text-slate-400 mb-1">
                On-prem estimated cost: {formatCurrency(onPremMonthly)}/month ($
                {ON_PREM_PRICE}/GB/mo)
              </p>
              <p className="text-sm text-slate-200">
                Using <span className="text-green-400 font-semibold">{cheapest.name}</span> saves{' '}
                <span className="text-green-400 font-semibold">
                  {formatCurrency(onPremMonthly - cheapest.monthly)}
                </span>
                /month (
                {(((onPremMonthly - cheapest.monthly) / onPremMonthly) * 100).toFixed(0)}% savings)
              </p>
            </div>
          )}

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-slate-200 mb-4">Monthly Cost Comparison</h4>
            <div className="space-y-3">
              {estimates.map((est) => (
                <div key={est.name} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-24 shrink-0">{est.name}</span>
                  <div className="flex-1 bg-slate-900/60 rounded-full h-6 overflow-hidden">
                    <div
                      className={`${est.color} h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2`}
                      style={{ width: `${Math.max(5, (est.monthly / maxMonthly) * 100)}%` }}
                    >
                      <span className="text-xs text-white font-medium whitespace-nowrap">
                        {formatCurrency(est.monthly)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-24 shrink-0">On-Prem</span>
                <div className="flex-1 bg-slate-900/60 rounded-full h-6 overflow-hidden">
                  <div
                    className="bg-slate-500 h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                    style={{ width: `${Math.max(5, (onPremMonthly / maxMonthly) * 100)}%` }}
                  >
                    <span className="text-xs text-white font-medium whitespace-nowrap">
                      {formatCurrency(onPremMonthly)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCopy}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy Estimate to Clipboard'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
