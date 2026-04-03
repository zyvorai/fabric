import { useState, useEffect, useCallback, useMemo } from 'react'
import { apiFetch } from '../api/client'

interface VMInterface { type: string; source: string; model: string; mac: string }
interface NetworkVM { name: string; state: string; interfaces: VMInterface[] }
interface NetworkInfo { name: string; state: string; autostart: string }

export default function NetworkTopology() {
  const [vms, setVMs] = useState<NetworkVM[]>([])
  const [networks, setNetworks] = useState<NetworkInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTopology = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const resp = await apiFetch('/api/network/topology')
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setVMs(data.vms || []); setNetworks(data.networks || [])
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to fetch network topology') } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchTopology() }, [fetchTopology])

  const vmsByNetwork = useMemo(() => {
    const grouped: Record<string, NetworkVM[]> = {}
    for (const net of networks) grouped[net.name] = []
    for (const vm of vms) {
      const assigned = new Set<string>()
      if (vm.interfaces) {
        for (const iface of vm.interfaces) {
          if (iface.source) {
            if (!grouped[iface.source]) grouped[iface.source] = []
            if (!assigned.has(iface.source)) { grouped[iface.source].push(vm); assigned.add(iface.source) }
          }
        }
      }
      if (assigned.size === 0) { if (!grouped['unattached']) grouped['unattached'] = []; grouped['unattached'].push(vm) }
    }
    return grouped
  }, [vms, networks])

  if (loading) return <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 flex flex-col items-center justify-center text-slate-500 gap-3"><div className="w-6 h-6 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" /><span className="text-sm">Loading network topology...</span></div>
  if (error) return <div className="bg-slate-800/50 rounded-xl p-6 border border-red-700/50"><div className="text-red-400 text-sm mb-3">Failed to load topology: {error}</div><button onClick={fetchTopology} className="px-4 py-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors">Retry</button></div>
  if (vms.length === 0 && networks.length === 0) return <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 flex flex-col items-center justify-center text-slate-500 gap-3"><span className="text-sm">No networks or VMs found</span></div>

  const networkNames = Object.keys(vmsByNetwork).sort((a, b) => { if (a === 'unattached') return 1; if (b === 'unattached') return -1; return a.localeCompare(b) })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gradient-blue">Network Topology</h1>
        <p className="text-sm text-slate-400 mt-1">VMs grouped by network with interface details</p>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">{networks.length} network{networks.length !== 1 ? 's' : ''}, {vms.length} VM{vms.length !== 1 ? 's' : ''}</div>
        <button onClick={fetchTopology} title="Refresh topology" className="px-4 py-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors">Refresh</button>
      </div>

      {networkNames.map((netName) => {
        const netInfo = networks.find((n) => n.name === netName)
        const netVMs = vmsByNetwork[netName]
        return (
          <div key={netName} className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between bg-slate-800/80">
              <div className="flex items-center gap-3">
                <span className="text-blue-400">&#127760;</span>
                <div>
                  <span className="text-sm font-semibold text-white">{netName}</span>
                  {netInfo && <span className="text-xs text-slate-500 ml-2">{netInfo.state} {netInfo.autostart === 'yes' ? '(autostart)' : ''}</span>}
                </div>
              </div>
              <span className="text-xs text-slate-500">{netVMs.length} VM{netVMs.length !== 1 ? 's' : ''}</span>
            </div>
            {netVMs.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 text-center">No VMs attached</div>
            ) : (
              <div className="p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {netVMs.map((vm) => (
                  <div key={vm.name} className="bg-slate-900/50 rounded-lg border border-slate-700/30 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-white truncate">{vm.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${vm.state === 'running' ? 'bg-green-500/20 text-green-400' : vm.state === 'shut off' ? 'bg-slate-500/20 text-slate-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{vm.state}</span>
                    </div>
                    {vm.interfaces && vm.interfaces.length > 0 && (
                      <div className="space-y-1.5">
                        {vm.interfaces.filter((iface) => iface.source === netName).map((iface, idx) => (
                          <div key={idx} className="text-xs text-slate-400 flex items-center gap-2">
                            <span className="font-mono text-slate-500">{iface.mac}</span>
                            <span className="text-slate-600">|</span>
                            <span>{iface.model}</span>
                            <span className="text-slate-600">|</span>
                            <span>{iface.type}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
