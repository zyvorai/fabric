// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Network } from 'lucide-react'
import { apiFetch } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import { PageHeader, EmptyState } from '../components/ui'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

interface VMInterface {
  type: string
  source: string
  model: string
  mac: string
}

interface NetworkVM {
  name: string
  state: string
  interfaces: VMInterface[]
}

interface NetworkInfo {
  name: string
  state: string
  autostart: string
}

export default function NetworkTopology() {
  const toast = useToastContext()
  const [vms, setVMs] = useState<NetworkVM[]>([])
  const [networks, setNetworks] = useState<NetworkInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchTopology = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const resp = await apiFetch('/api/network/topology')
      if (!resp.ok) {
        const body = await resp.text()
        throw new Error(formatHttpErrorBody(resp.status, resp.statusText, body))
      }
      const data = await resp.json()
      setVMs(data.vms || [])
      setNetworks(data.networks || [])
    } catch (err) {
      const msg = formatUserError(err)
      setLoadError(msg)
      toastFailure(toast, 'Failed to load network topology', err)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchTopology()
  }, [fetchTopology])

  const vmsByNetwork = useMemo(() => {
    const grouped: Record<string, NetworkVM[]> = {}
    for (const net of networks) grouped[net.name] = []
    for (const vm of vms) {
      const assigned = new Set<string>()
      if (vm.interfaces) {
        for (const iface of vm.interfaces) {
          if (iface.source) {
            if (!grouped[iface.source]) grouped[iface.source] = []
            if (!assigned.has(iface.source)) {
              grouped[iface.source].push(vm)
              assigned.add(iface.source)
            }
          }
        }
      }
      if (assigned.size === 0) {
        if (!grouped['unattached']) grouped['unattached'] = []
        grouped['unattached'].push(vm)
      }
    }
    return grouped
  }, [vms, networks])

  const networkNames = Object.keys(vmsByNetwork).sort((a, b) => {
    if (a === 'unattached') return 1
    if (b === 'unattached') return -1
    return a.localeCompare(b)
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Network Topology"
        description="VMs grouped by network with interface details"
        onRefresh={fetchTopology}
        refreshing={loading}
      />

      {loadError && (
        <ErrorBanner
          title="Could not load network topology"
          headline={loadError}
          hints={hintsForError(loadError, 'network')}
          onRetry={fetchTopology}
        />
      )}

      {loading && !loadError ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 flex flex-col items-center justify-center text-slate-500 gap-3">
          <div className="w-6 h-6 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-sm">Loading network topology…</span>
        </div>
      ) : !loadError && vms.length === 0 && networks.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50">
          <EmptyState
            icon={<Network className="w-10 h-10" />}
            title="No networks or VMs found"
            description="Configure bridges and attach VM interfaces to see topology"
          />
        </div>
      ) : !loadError ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {networks.length} network{networks.length !== 1 ? 's' : ''} · {vms.length} VM
              {vms.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {networkNames.map((netName) => {
              const netVMs = vmsByNetwork[netName] || []
              const netInfo = networks.find((n) => n.name === netName)
              return (
                <div key={netName} className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white capitalize">
                      {netName === 'unattached' ? 'Unattached VMs' : netName}
                    </h3>
                    {netInfo && (
                      <span className="text-xs text-slate-500">
                        {netInfo.state} · autostart {netInfo.autostart}
                      </span>
                    )}
                  </div>
                  {netVMs.length === 0 ? (
                    <p className="text-xs text-slate-500">No VMs on this network</p>
                  ) : (
                    <ul className="space-y-2">
                      {netVMs.map((vm) => (
                        <li
                          key={vm.name}
                          className="text-sm bg-slate-900/40 rounded-lg px-3 py-2 border border-slate-700/30"
                        >
                          <div className="font-medium text-white">{vm.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{vm.state}</div>
                          {vm.interfaces?.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {vm.interfaces.map((iface, i) => (
                                <div key={i} className="text-[11px] text-slate-400 font-mono">
                                  {iface.type} · {iface.model} · {iface.mac || 'no MAC'}
                                </div>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
