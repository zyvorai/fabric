// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { Search, Monitor, Cpu, HardDrive } from 'lucide-react'
import { Link } from 'react-router'
import { apiFetch } from '../api/client'
import PageLoadBanner from '../components/PageLoadBanner'
import { PageHeader } from '../components/ui'
import { formatHttpErrorBody } from '../utils/apiError'
import { usePageLoader } from '../hooks/usePageLoader'

function stateColor(state: string): string {
  const s = (state || '').toLowerCase()
  if (s === 'running') return 'bg-emerald-500/10 text-emerald-400'
  if (s === 'stopped' || s === 'shutoff') return 'bg-red-500/10 text-red-400'
  if (s === 'paused') return 'bg-amber-500/10 text-amber-400'
  return 'bg-slate-500/10 text-slate-400'
}

function fmtMem(bytes: number): string {
  if (!bytes) return '0'
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export default function VMBrowser() {
  const [vms, setVMs] = useState<any[]>([])
  const { loading, loadError, run } = usePageLoader('Failed to load VMs')
  const [search, setSearch] = useState('')

  const loadVMs = useCallback(() => {
    return run(async () => {
      const res = await apiFetch('/api/vms')
      if (!res.ok) {
        const body = await res.text()
        throw new Error(formatHttpErrorBody(res.status, res.statusText, body))
      }
      const data = await res.json()
      setVMs(Array.isArray(data) ? data : data.vms || [])
    })
  }, [run])

  useEffect(() => {
    void loadVMs()
  }, [loadVMs])

  const filtered = vms.filter(vm => {
    if (!search) return true
    const q = search.toLowerCase()
    return vm.name?.toLowerCase().includes(q) || (vm.state || '').toLowerCase().includes(q) || (vm.image || '').toLowerCase().includes(q)
  })

  const runningCount = vms.filter(v => (v.state || '').toLowerCase() === 'running').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="VM Browser"
        description={loading ? 'Loading…' : `${vms.length} VMs, ${runningCount} running`}
        onRefresh={() => void loadVMs()}
        refreshing={loading}
      />
      <PageLoadBanner title="Could not load VMs" headline={loadError} onRetry={() => void loadVMs()} />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input type="text" placeholder="Search VMs by name, state, or image..." aria-label="Search VMs" value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
      </div>

      {loading && !loadError ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-slate-800/50 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500"><Monitor className="w-10 h-10 mx-auto mb-3 opacity-50" /><p className="text-sm">{vms.length === 0 ? 'No VMs found' : 'No VMs match your search'}</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(vm => (
            <Link key={vm.name} to={`/vms/${vm.name}`} className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 transition-all hover:scale-[1.01] card-glow block">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-white truncate">{vm.name}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${stateColor(vm.state)}`}>{vm.state || 'unknown'}</span>
              </div>
              {vm.image && <div className="text-[10px] text-slate-500 truncate mb-3 font-mono">{vm.image}</div>}
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{vm.cpus || 0} vCPU</span>
                <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{fmtMem(vm.memory || 0)}</span>
                {vm.ip && <span className="font-mono">{vm.ip}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
