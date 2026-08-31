// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { apiFetch } from '../api/client'
import { PageHeader } from '../components/ui'

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
      'Zyvor Fabric Storage Cost Estimate',
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
      <PageHeader
        title="Storage Cost Estimator"
        description="Compare cloud storage costs for your VM infrastructure"
      />

      <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl p-5 space-y-5">
        <h3 className="text-sm font-semibold text-[#1d1d1f]">Configuration</h3>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <label className="text-[#6e6e73]">Number of VMs</label>
            <span className="text-[#1d1d1f] font-medium">{vmCount}</span>
          </div>
          <input
            type="range"
            min={1}
            max={1000}
            value={vmCount}
            onChange={(e) => setVmCount(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-[#e8e8ed] rounded-lg appearance-none cursor-pointer accent-green-500"
          />
          <div className="flex justify-between text-xs text-[#6e6e73] mt-0.5">
            <span>1</span>
            <span>1000</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <label className="text-[#6e6e73]">Average VM Size (GB)</label>
            <span className="text-[#1d1d1f] font-medium">{avgSizeGB} GB</span>
          </div>
          <input
            type="range"
            min={10}
            max={2000}
            step={10}
            value={avgSizeGB}
            onChange={(e) => setAvgSizeGB(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-[#e8e8ed] rounded-lg appearance-none cursor-pointer accent-green-500"
          />
          <div className="flex justify-between text-xs text-[#6e6e73] mt-0.5">
            <span>10 GB</span>
            <span>2 TB</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <label className="text-[#6e6e73]">Storage Duration (months)</label>
            <span className="text-[#1d1d1f] font-medium">{durationMonths} months</span>
          </div>
          <input
            type="range"
            min={1}
            max={36}
            value={durationMonths}
            onChange={(e) => setDurationMonths(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-[#e8e8ed] rounded-lg appearance-none cursor-pointer accent-green-500"
          />
          <div className="flex justify-between text-xs text-[#6e6e73] mt-0.5">
            <span>1 mo</span>
            <span>36 mo</span>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={includeSnapshots} onChange={() => setIncludeSnapshots(!includeSnapshots)} className="sr-only peer" />
          <div className={`relative w-10 h-5 rounded-full transition-colors ${includeSnapshots ? 'bg-green-600' : 'bg-[#e8e8ed]'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${includeSnapshots ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm text-[#1d1d1f]">Include snapshots (+50% storage)</span>
        </label>

        <div className="bg-[#f5f5f7] rounded-lg px-3 py-2 text-xs text-[#6e6e73]">
          Total estimated storage:{' '}
          <span className="text-emerald-600 font-medium">
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
                  className={`bg-[#f5f5f7] rounded-xl p-5 border transition-colors ${
                    isCheapest
                      ? 'border-green-500/60 ring-1 ring-green-500/20'
                      : 'border-[#d2d2d7]'
                  }`}
                >
                  {isCheapest && (
                    <span className="text-xs font-semibold text-emerald-600 bg-green-500/10 px-2 py-0.5 rounded mb-2 inline-block">
                      Cheapest
                    </span>
                  )}
                  <h4 className="text-lg font-bold text-[#1d1d1f]">{est.name}</h4>
                  <p className="text-xs text-[#6e6e73] mb-3">${est.pricePerGB}/GB/month</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6e6e73]">Monthly</span>
                      <span className="text-[#1d1d1f] font-medium">{formatCurrency(est.monthly)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6e6e73]">Annual</span>
                      <span className="text-[#1d1d1f] font-medium">{formatCurrency(est.annual)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-[#d2d2d7] pt-2">
                      <span className="text-[#6e6e73]">Total ({durationMonths}mo)</span>
                      <span className="text-[#1d1d1f] font-semibold">{formatCurrency(est.total)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {cheapest && (
            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-5">
              <h4 className="text-sm font-semibold text-emerald-600 mb-2">
                Savings vs On-Premises Storage
              </h4>
              <p className="text-xs text-[#6e6e73] mb-1">
                On-prem estimated cost: {formatCurrency(onPremMonthly)}/month ($
                {ON_PREM_PRICE}/GB/mo)
              </p>
              <p className="text-sm text-[#1d1d1f]">
                Using <span className="text-emerald-600 font-semibold">{cheapest.name}</span> saves{' '}
                <span className="text-emerald-600 font-semibold">
                  {formatCurrency(onPremMonthly - cheapest.monthly)}
                </span>
                /month (
                {(((onPremMonthly - cheapest.monthly) / onPremMonthly) * 100).toFixed(0)}% savings)
              </p>
            </div>
          )}

          <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl p-5">
            <h4 className="text-sm font-semibold text-[#1d1d1f] mb-4">Monthly Cost Comparison</h4>
            <div className="space-y-3">
              {estimates.map((est) => (
                <div key={est.name} className="flex items-center gap-3">
                  <span className="text-xs text-[#6e6e73] w-24 shrink-0">{est.name}</span>
                  <div className="flex-1 bg-[#f5f5f7] rounded-full h-6 overflow-hidden">
                    <div
                      className={`${est.color} h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2`}
                      style={{ width: `${Math.max(5, (est.monthly / maxMonthly) * 100)}%` }}
                    >
                      <span className="text-xs text-[#1d1d1f] font-medium whitespace-nowrap">
                        {formatCurrency(est.monthly)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#6e6e73] w-24 shrink-0">On-Prem</span>
                <div className="flex-1 bg-[#f5f5f7] rounded-full h-6 overflow-hidden">
                  <div
                    className="bg-[#6e6e73] h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                    style={{ width: `${Math.max(5, (onPremMonthly / maxMonthly) * 100)}%` }}
                  >
                    <span className="text-xs text-[#1d1d1f] font-medium whitespace-nowrap">
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
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[#e8e8ed] hover:bg-[#d2d2d7] text-[#1d1d1f] transition-colors"
            >
              {copied ? 'Copied!' : 'Copy Estimate to Clipboard'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
