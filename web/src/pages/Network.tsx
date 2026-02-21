import { useState, useEffect, useCallback } from 'react'
import { Network as NetworkIcon, Plus, Trash2, RefreshCw, X, Server, Layers, Cable, Terminal, Link2, Settings, FileText, ArrowRightLeft } from 'lucide-react'
import * as api from '../api/networkd'
import type {
  BridgeConfig, VlanConfig, MacvtapConfig, TapConfig, LinkInfo,
  BondConfig, NetworkFileConfig, LinkFileConfig, PortForwardConfig,
  CreateBridgeRequest, CreateVlanRequest, CreateMacvtapRequest, CreateTapRequest,
  CreateBondRequest, CreateNetworkFileRequest, CreateLinkFileRequest,
  CreatePortForwardRequest,
  MacvtapMode, BondMode, Protocol,
} from '../api/networkd'

type Tab = 'bridges' | 'bonds' | 'vlans' | 'macvtap' | 'taps' | 'netfiles' | 'linkfiles' | 'portforwards' | 'status'

export default function Network() {
  const [activeTab, setActiveTab] = useState<Tab>('bridges')
  const [bridges, setBridges] = useState<BridgeConfig[]>([])
  const [bonds, setBonds] = useState<BondConfig[]>([])
  const [vlans, setVlans] = useState<VlanConfig[]>([])
  const [macvtaps, setMacvtaps] = useState<MacvtapConfig[]>([])
  const [taps, setTaps] = useState<TapConfig[]>([])
  const [netfiles, setNetfiles] = useState<NetworkFileConfig[]>([])
  const [linkfiles, setLinkfiles] = useState<LinkFileConfig[]>([])
  const [portForwards, setPortForwards] = useState<PortForwardConfig[]>([])
  const [links, setLinks] = useState<LinkInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [showCreateBridge, setShowCreateBridge] = useState(false)
  const [showCreateBond, setShowCreateBond] = useState(false)
  const [showCreateVlan, setShowCreateVlan] = useState(false)
  const [showCreateMacvtap, setShowCreateMacvtap] = useState(false)
  const [showCreateTap, setShowCreateTap] = useState(false)
  const [showCreateNetfile, setShowCreateNetfile] = useState(false)
  const [showCreateLinkfile, setShowCreateLinkfile] = useState(false)
  const [showCreatePortForward, setShowCreatePortForward] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [b, bo, v, m, t, nf, lf, pf, l] = await Promise.all([
        api.listBridges(),
        api.listBonds(),
        api.listVlans(),
        api.listMacvtaps(),
        api.listTaps(),
        api.listNetworkFiles(),
        api.listLinkFiles(),
        api.listPortForwards(),
        api.listLinks().catch(() => []),
      ])
      setBridges(b)
      setBonds(bo)
      setVlans(v)
      setMacvtaps(m)
      setTaps(t)
      setNetfiles(nf)
      setLinkfiles(lf)
      setPortForwards(pf)
      setLinks(l)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleReload = async () => {
    try {
      await api.reloadNetworkd()
      await fetchAll()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleDeleteBridge = async (id: string) => {
    if (!confirm('Delete this bridge and its systemd-networkd config files?')) return
    try {
      await api.deleteBridge(id)
      setBridges(prev => prev.filter(b => b.id !== id))
    } catch (e: any) { setError(e.message) }
  }

  const handleDeleteVlan = async (id: string) => {
    if (!confirm('Delete this VLAN?')) return
    try {
      await api.deleteVlan(id)
      setVlans(prev => prev.filter(v => v.id !== id))
    } catch (e: any) { setError(e.message) }
  }

  const handleDeleteMacvtap = async (id: string) => {
    if (!confirm('Delete this macvtap device?')) return
    try {
      await api.deleteMacvtap(id)
      setMacvtaps(prev => prev.filter(m => m.id !== id))
    } catch (e: any) { setError(e.message) }
  }

  const handleDeleteTap = async (id: string) => {
    if (!confirm('Delete this tap device?')) return
    try {
      await api.deleteTap(id)
      setTaps(prev => prev.filter(t => t.id !== id))
    } catch (e: any) { setError(e.message) }
  }

  const handleDeleteBond = async (id: string) => {
    if (!confirm('Delete this bond and its systemd-networkd config files?')) return
    try {
      await api.deleteBond(id)
      setBonds(prev => prev.filter(b => b.id !== id))
    } catch (e: any) { setError(e.message) }
  }

  const handleDeleteNetfile = async (id: string) => {
    if (!confirm('Delete this network file config?')) return
    try {
      await api.deleteNetworkFile(id)
      setNetfiles(prev => prev.filter(n => n.id !== id))
    } catch (e: any) { setError(e.message) }
  }

  const handleDeleteLinkfile = async (id: string) => {
    if (!confirm('Delete this link file config?')) return
    try {
      await api.deleteLinkFile(id)
      setLinkfiles(prev => prev.filter(l => l.id !== id))
    } catch (e: any) { setError(e.message) }
  }

  const handleDeletePortForward = async (id: string) => {
    if (!confirm('Delete this port forward rule?')) return
    try {
      await api.deletePortForward(id)
      setPortForwards(prev => prev.filter(p => p.id !== id))
    } catch (e: any) { setError(e.message) }
  }

  const handleSyncPortForwards = async () => {
    try {
      await api.syncPortForwards()
      await fetchAll()
    } catch (e: any) { setError(e.message) }
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'bridges', label: 'Bridges', icon: <Server className="w-4 h-4" /> },
    { key: 'bonds', label: 'Bonds', icon: <Link2 className="w-4 h-4" /> },
    { key: 'vlans', label: 'VLANs', icon: <Layers className="w-4 h-4" /> },
    { key: 'macvtap', label: 'Macvtap', icon: <Cable className="w-4 h-4" /> },
    { key: 'taps', label: 'Tap', icon: <Terminal className="w-4 h-4" /> },
    { key: 'netfiles', label: 'Interfaces', icon: <Settings className="w-4 h-4" /> },
    { key: 'linkfiles', label: 'Link Files', icon: <FileText className="w-4 h-4" /> },
    { key: 'portforwards', label: 'Port Forwards', icon: <ArrowRightLeft className="w-4 h-4" /> },
    { key: 'status', label: 'Status', icon: <RefreshCw className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <NetworkIcon className="w-8 h-8" />
          Network Configuration
        </h1>
        <button onClick={handleReload} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition">
          <RefreshCw className="w-4 h-4" />
          Reload networkd
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-gray-400 text-xs mb-1">Bridges</div>
          <div className="text-2xl font-bold text-blue-400">{bridges.length}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-gray-400 text-xs mb-1">Bonds</div>
          <div className="text-2xl font-bold text-cyan-400">{bonds.length}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-gray-400 text-xs mb-1">VLANs</div>
          <div className="text-2xl font-bold text-purple-400">{vlans.length}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-gray-400 text-xs mb-1">Macvtap</div>
          <div className="text-2xl font-bold text-green-400">{macvtaps.length}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-gray-400 text-xs mb-1">Tap</div>
          <div className="text-2xl font-bold text-orange-400">{taps.length}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-gray-400 text-xs mb-1">Interfaces</div>
          <div className="text-2xl font-bold text-yellow-400">{netfiles.length}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-gray-400 text-xs mb-1">Link Files</div>
          <div className="text-2xl font-bold text-pink-400">{linkfiles.length}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-gray-400 text-xs mb-1">Port Forwards</div>
          <div className="text-2xl font-bold text-red-400">{portForwards.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-700">
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === t.key
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading...</div>
      ) : (
        <>
          {activeTab === 'bridges' && (
            <BridgesTab bridges={bridges} onDelete={handleDeleteBridge} onCreate={() => setShowCreateBridge(true)} />
          )}
          {activeTab === 'bonds' && (
            <BondsTab bonds={bonds} onDelete={handleDeleteBond} onCreate={() => setShowCreateBond(true)} />
          )}
          {activeTab === 'vlans' && (
            <VlansTab vlans={vlans} onDelete={handleDeleteVlan} onCreate={() => setShowCreateVlan(true)} />
          )}
          {activeTab === 'macvtap' && (
            <MacvtapTab macvtaps={macvtaps} onDelete={handleDeleteMacvtap} onCreate={() => setShowCreateMacvtap(true)} />
          )}
          {activeTab === 'taps' && (
            <TapsTab taps={taps} onDelete={handleDeleteTap} onCreate={() => setShowCreateTap(true)} />
          )}
          {activeTab === 'netfiles' && (
            <NetfilesTab netfiles={netfiles} onDelete={handleDeleteNetfile} onCreate={() => setShowCreateNetfile(true)} />
          )}
          {activeTab === 'linkfiles' && (
            <LinkfilesTab linkfiles={linkfiles} onDelete={handleDeleteLinkfile} onCreate={() => setShowCreateLinkfile(true)} />
          )}
          {activeTab === 'portforwards' && (
            <PortForwardsTab portForwards={portForwards} onDelete={handleDeletePortForward} onCreate={() => setShowCreatePortForward(true)} onSync={handleSyncPortForwards} />
          )}
          {activeTab === 'status' && <StatusTab links={links} onRefresh={fetchAll} />}
        </>
      )}

      {/* Modals */}
      {showCreateBridge && <CreateBridgeModal onClose={() => setShowCreateBridge(false)} onCreated={(b) => { setBridges(prev => [...prev, b]); setShowCreateBridge(false) }} />}
      {showCreateBond && <CreateBondModal onClose={() => setShowCreateBond(false)} onCreated={(b) => { setBonds(prev => [...prev, b]); setShowCreateBond(false) }} />}
      {showCreateVlan && <CreateVlanModal onClose={() => setShowCreateVlan(false)} onCreated={(v) => { setVlans(prev => [...prev, v]); setShowCreateVlan(false) }} />}
      {showCreateMacvtap && <CreateMacvtapModal onClose={() => setShowCreateMacvtap(false)} onCreated={(m) => { setMacvtaps(prev => [...prev, m]); setShowCreateMacvtap(false) }} />}
      {showCreateTap && <CreateTapModal onClose={() => setShowCreateTap(false)} onCreated={(t) => { setTaps(prev => [...prev, t]); setShowCreateTap(false) }} />}
      {showCreateNetfile && <CreateNetfileModal onClose={() => setShowCreateNetfile(false)} onCreated={(n) => { setNetfiles(prev => [...prev, n]); setShowCreateNetfile(false) }} />}
      {showCreateLinkfile && <CreateLinkfileModal onClose={() => setShowCreateLinkfile(false)} onCreated={(l) => { setLinkfiles(prev => [...prev, l]); setShowCreateLinkfile(false) }} />}
      {showCreatePortForward && <CreatePortForwardModal onClose={() => setShowCreatePortForward(false)} onCreated={(pf) => { setPortForwards(prev => [...prev, pf]); setShowCreatePortForward(false) }} />}
    </div>
  )
}

// ─── Tab Components ───────────────────────────────────────────────────────────

function BridgesTab({ bridges, onDelete, onCreate }: { bridges: BridgeConfig[]; onDelete: (id: string) => void; onCreate: () => void }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <div className="p-6 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Network Bridges</h2>
        <button onClick={onCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition text-sm">
          <Plus className="w-4 h-4" /> Create Bridge
        </button>
      </div>
      {bridges.length === 0 ? (
        <div className="p-12 text-center text-gray-400">No bridges configured. Create one to get started.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4 font-medium text-gray-300">Name</th>
                <th className="text-left p-4 font-medium text-gray-300">Addresses</th>
                <th className="text-left p-4 font-medium text-gray-300">STP</th>
                <th className="text-left p-4 font-medium text-gray-300">DHCP</th>
                <th className="text-left p-4 font-medium text-gray-300">MTU</th>
                <th className="text-left p-4 font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {bridges.map(b => (
                <tr key={b.id} className="hover:bg-gray-700 transition">
                  <td className="p-4 font-medium">{b.name}</td>
                  <td className="p-4 text-gray-400 font-mono text-sm">{b.addresses.join(', ') || '-'}</td>
                  <td className="p-4">{b.stp ? <span className="text-green-400">on</span> : <span className="text-gray-500">off</span>}</td>
                  <td className="p-4 text-gray-400">{b.dhcp}</td>
                  <td className="p-4 text-gray-400">{b.mtu ?? '-'}</td>
                  <td className="p-4">
                    <button onClick={() => onDelete(b.id)} className="p-2 hover:bg-red-600 rounded transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function VlansTab({ vlans, onDelete, onCreate }: { vlans: VlanConfig[]; onDelete: (id: string) => void; onCreate: () => void }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <div className="p-6 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-xl font-semibold">VLANs</h2>
        <button onClick={onCreate} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg transition text-sm">
          <Plus className="w-4 h-4" /> Create VLAN
        </button>
      </div>
      {vlans.length === 0 ? (
        <div className="p-12 text-center text-gray-400">No VLANs configured.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4 font-medium text-gray-300">Name</th>
                <th className="text-left p-4 font-medium text-gray-300">VLAN ID</th>
                <th className="text-left p-4 font-medium text-gray-300">Parent</th>
                <th className="text-left p-4 font-medium text-gray-300">Addresses</th>
                <th className="text-left p-4 font-medium text-gray-300">DHCP</th>
                <th className="text-left p-4 font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {vlans.map(v => (
                <tr key={v.id} className="hover:bg-gray-700 transition">
                  <td className="p-4 font-medium">{v.name}</td>
                  <td className="p-4 font-mono text-purple-400">{v.vlan_id}</td>
                  <td className="p-4 text-gray-400">{v.parent_interface}</td>
                  <td className="p-4 text-gray-400 font-mono text-sm">{v.addresses.join(', ') || '-'}</td>
                  <td className="p-4 text-gray-400">{v.dhcp}</td>
                  <td className="p-4">
                    <button onClick={() => onDelete(v.id)} className="p-2 hover:bg-red-600 rounded transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MacvtapTab({ macvtaps, onDelete, onCreate }: { macvtaps: MacvtapConfig[]; onDelete: (id: string) => void; onCreate: () => void }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <div className="p-6 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Macvtap Devices</h2>
        <button onClick={onCreate} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg transition text-sm">
          <Plus className="w-4 h-4" /> Create Macvtap
        </button>
      </div>
      {macvtaps.length === 0 ? (
        <div className="p-12 text-center text-gray-400">No macvtap devices configured.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4 font-medium text-gray-300">Name</th>
                <th className="text-left p-4 font-medium text-gray-300">Parent</th>
                <th className="text-left p-4 font-medium text-gray-300">Mode</th>
                <th className="text-left p-4 font-medium text-gray-300">MAC Address</th>
                <th className="text-left p-4 font-medium text-gray-300">MTU</th>
                <th className="text-left p-4 font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {macvtaps.map(m => (
                <tr key={m.id} className="hover:bg-gray-700 transition">
                  <td className="p-4 font-medium">{m.name}</td>
                  <td className="p-4 text-gray-400">{m.parent_interface}</td>
                  <td className="p-4">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">{m.mode}</span>
                  </td>
                  <td className="p-4 text-gray-400 font-mono text-sm">{m.mac_address ?? '-'}</td>
                  <td className="p-4 text-gray-400">{m.mtu ?? '-'}</td>
                  <td className="p-4">
                    <button onClick={() => onDelete(m.id)} className="p-2 hover:bg-red-600 rounded transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TapsTab({ taps, onDelete, onCreate }: { taps: TapConfig[]; onDelete: (id: string) => void; onCreate: () => void }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <div className="p-6 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Tap Devices</h2>
        <button onClick={onCreate} className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded-lg transition text-sm">
          <Plus className="w-4 h-4" /> Create Tap
        </button>
      </div>
      {taps.length === 0 ? (
        <div className="p-12 text-center text-gray-400">No tap devices configured.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4 font-medium text-gray-300">Name</th>
                <th className="text-left p-4 font-medium text-gray-300">Bridge</th>
                <th className="text-left p-4 font-medium text-gray-300">User</th>
                <th className="text-left p-4 font-medium text-gray-300">MultiQueue</th>
                <th className="text-left p-4 font-medium text-gray-300">VNet Header</th>
                <th className="text-left p-4 font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {taps.map(t => (
                <tr key={t.id} className="hover:bg-gray-700 transition">
                  <td className="p-4 font-medium">{t.name}</td>
                  <td className="p-4 text-gray-400">{t.bridge ?? '-'}</td>
                  <td className="p-4 text-gray-400">{t.user ?? '-'}</td>
                  <td className="p-4">{t.multi_queue ? <span className="text-green-400">yes</span> : <span className="text-gray-500">no</span>}</td>
                  <td className="p-4">{t.vnet_hdr ? <span className="text-green-400">yes</span> : <span className="text-gray-500">no</span>}</td>
                  <td className="p-4">
                    <button onClick={() => onDelete(t.id)} className="p-2 hover:bg-red-600 rounded transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusTab({ links, onRefresh }: { links: LinkInfo[]; onRefresh: () => void }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <div className="p-6 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-xl font-semibold">networkctl link status</h2>
        <button onClick={onRefresh} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded-lg transition text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>
      {links.length === 0 ? (
        <div className="p-12 text-center text-gray-400">No link data available. networkctl may not be accessible.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4 font-medium text-gray-300">Index</th>
                <th className="text-left p-4 font-medium text-gray-300">Name</th>
                <th className="text-left p-4 font-medium text-gray-300">Type</th>
                <th className="text-left p-4 font-medium text-gray-300">Operational</th>
                <th className="text-left p-4 font-medium text-gray-300">Setup</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {links.map(l => (
                <tr key={l.index} className="hover:bg-gray-700 transition">
                  <td className="p-4 font-mono text-sm">{l.index}</td>
                  <td className="p-4 font-medium">{l.name}</td>
                  <td className="p-4 text-gray-400">{l.kind}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      l.operational_state === 'routable' ? 'bg-green-500/10 text-green-400' :
                      l.operational_state === 'carrier' ? 'bg-blue-500/10 text-blue-400' :
                      l.operational_state === 'degraded' ? 'bg-yellow-500/10 text-yellow-400' :
                      'bg-gray-500/10 text-gray-400'
                    }`}>{l.operational_state}</span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      l.setup_state === 'configured' ? 'bg-green-500/10 text-green-400' :
                      l.setup_state === 'configuring' ? 'bg-yellow-500/10 text-yellow-400' :
                      'bg-gray-500/10 text-gray-400'
                    }`}>{l.setup_state || '-'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Create Modals ────────────────────────────────────────────────────────────

function BondsTab({ bonds, onDelete, onCreate }: { bonds: BondConfig[]; onDelete: (id: string) => void; onCreate: () => void }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <div className="p-6 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Bonds</h2>
        <button onClick={onCreate} className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white py-2 px-4 rounded-lg transition text-sm">
          <Plus className="w-4 h-4" /> Create Bond
        </button>
      </div>
      {bonds.length === 0 ? (
        <div className="p-12 text-center text-gray-400">No bonds configured.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4 font-medium text-gray-300">Name</th>
                <th className="text-left p-4 font-medium text-gray-300">Mode</th>
                <th className="text-left p-4 font-medium text-gray-300">Slaves</th>
                <th className="text-left p-4 font-medium text-gray-300">Addresses</th>
                <th className="text-left p-4 font-medium text-gray-300">DHCP</th>
                <th className="text-left p-4 font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {bonds.map(b => (
                <tr key={b.id} className="hover:bg-gray-700 transition">
                  <td className="p-4 font-medium">{b.name}</td>
                  <td className="p-4">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">{b.mode}</span>
                  </td>
                  <td className="p-4 text-gray-400 font-mono text-sm">{b.slave_interfaces.join(', ') || '-'}</td>
                  <td className="p-4 text-gray-400 font-mono text-sm">{b.addresses.join(', ') || '-'}</td>
                  <td className="p-4 text-gray-400">{b.dhcp}</td>
                  <td className="p-4">
                    <button onClick={() => onDelete(b.id)} className="p-2 hover:bg-red-600 rounded transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function NetfilesTab({ netfiles, onDelete, onCreate }: { netfiles: NetworkFileConfig[]; onDelete: (id: string) => void; onCreate: () => void }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <div className="p-6 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Interface Configuration (.network)</h2>
        <button onClick={onCreate} className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded-lg transition text-sm">
          <Plus className="w-4 h-4" /> Configure Interface
        </button>
      </div>
      {netfiles.length === 0 ? (
        <div className="p-12 text-center text-gray-400">No interface configurations. Configure a physical interface to assign IPs, bridge membership, etc.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4 font-medium text-gray-300">Interface</th>
                <th className="text-left p-4 font-medium text-gray-300">Addresses</th>
                <th className="text-left p-4 font-medium text-gray-300">DHCP</th>
                <th className="text-left p-4 font-medium text-gray-300">Bridge</th>
                <th className="text-left p-4 font-medium text-gray-300">Bond</th>
                <th className="text-left p-4 font-medium text-gray-300">MTU</th>
                <th className="text-left p-4 font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {netfiles.map(n => (
                <tr key={n.id} className="hover:bg-gray-700 transition">
                  <td className="p-4 font-medium">{n.match_name}</td>
                  <td className="p-4 text-gray-400 font-mono text-sm">{n.addresses.join(', ') || '-'}</td>
                  <td className="p-4 text-gray-400">{n.dhcp}</td>
                  <td className="p-4 text-gray-400">{n.bridge ?? '-'}</td>
                  <td className="p-4 text-gray-400">{n.bond ?? '-'}</td>
                  <td className="p-4 text-gray-400">{n.mtu ?? '-'}</td>
                  <td className="p-4">
                    <button onClick={() => onDelete(n.id)} className="p-2 hover:bg-red-600 rounded transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LinkfilesTab({ linkfiles, onDelete, onCreate }: { linkfiles: LinkFileConfig[]; onDelete: (id: string) => void; onCreate: () => void }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <div className="p-6 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Link Configuration (.link)</h2>
        <button onClick={onCreate} className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white py-2 px-4 rounded-lg transition text-sm">
          <Plus className="w-4 h-4" /> Create Link File
        </button>
      </div>
      {linkfiles.length === 0 ? (
        <div className="p-12 text-center text-gray-400">No link files configured. Use these to rename interfaces, set MTU, MAC, or Wake-on-LAN.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4 font-medium text-gray-300">Match</th>
                <th className="text-left p-4 font-medium text-gray-300">Rename To</th>
                <th className="text-left p-4 font-medium text-gray-300">MTU</th>
                <th className="text-left p-4 font-medium text-gray-300">MAC Override</th>
                <th className="text-left p-4 font-medium text-gray-300">WoL</th>
                <th className="text-left p-4 font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {linkfiles.map(l => (
                <tr key={l.id} className="hover:bg-gray-700 transition">
                  <td className="p-4 font-mono text-sm text-gray-400">
                    {l.match_mac ?? l.match_original_name ?? l.match_driver ?? l.match_path ?? '-'}
                  </td>
                  <td className="p-4 font-medium">{l.name ?? '-'}</td>
                  <td className="p-4 text-gray-400">{l.mtu ?? '-'}</td>
                  <td className="p-4 text-gray-400 font-mono text-sm">{l.mac_address ?? '-'}</td>
                  <td className="p-4 text-gray-400">{l.wake_on_lan ?? '-'}</td>
                  <td className="p-4">
                    <button onClick={() => onDelete(l.id)} className="p-2 hover:bg-red-600 rounded transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Create Modals ────────────────────────────────────────────────────────────

function ModalWrapper({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function InputField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
      />
    </div>
  )
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded bg-gray-700 border-gray-600" />
      <span className="text-sm text-gray-300">{label}</span>
    </label>
  )
}

function CreateBridgeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (b: BridgeConfig) => void }) {
  const [name, setName] = useState('')
  const [addresses, setAddresses] = useState('')
  const [gateway, setGateway] = useState('')
  const [dns, setDns] = useState('')
  const [stp, setStp] = useState(false)
  const [mtu, setMtu] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) { setErr('Name is required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateBridgeRequest = {
        name: name.trim(),
        stp: stp || undefined,
        mtu: mtu ? parseInt(mtu) : undefined,
        addresses: addresses ? addresses.split(',').map(s => s.trim()).filter(Boolean) : [],
        gateway: gateway.trim() || undefined,
        dns: dns ? dns.split(',').map(s => s.trim()).filter(Boolean) : [],
      }
      const bridge = await api.createBridge(req)
      onCreated(bridge)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create Bridge" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="br0" />
        <InputField label="Addresses (comma-separated)" value={addresses} onChange={setAddresses} placeholder="10.0.0.1/24, 192.168.1.1/24" />
        <InputField label="Gateway" value={gateway} onChange={setGateway} placeholder="10.0.0.254" />
        <InputField label="DNS (comma-separated)" value={dns} onChange={setDns} placeholder="8.8.8.8, 1.1.1.1" />
        <InputField label="MTU" value={mtu} onChange={setMtu} placeholder="1500" type="number" />
        <CheckboxField label="Enable STP (Spanning Tree Protocol)" checked={stp} onChange={setStp} />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create Bridge'}
        </button>
      </div>
    </ModalWrapper>
  )
}

function CreateVlanModal({ onClose, onCreated }: { onClose: () => void; onCreated: (v: VlanConfig) => void }) {
  const [name, setName] = useState('')
  const [vlanId, setVlanId] = useState('')
  const [parent, setParent] = useState('')
  const [addresses, setAddresses] = useState('')
  const [gateway, setGateway] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim() || !vlanId || !parent.trim()) { setErr('Name, VLAN ID, and parent interface are required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateVlanRequest = {
        name: name.trim(),
        vlan_id: parseInt(vlanId),
        parent_interface: parent.trim(),
        addresses: addresses ? addresses.split(',').map(s => s.trim()).filter(Boolean) : [],
        gateway: gateway.trim() || undefined,
      }
      const vlan = await api.createVlan(req)
      onCreated(vlan)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create VLAN" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="vlan100" />
        <InputField label="VLAN ID" value={vlanId} onChange={setVlanId} placeholder="100" type="number" />
        <InputField label="Parent Interface" value={parent} onChange={setParent} placeholder="eth0" />
        <InputField label="Addresses (comma-separated)" value={addresses} onChange={setAddresses} placeholder="192.168.100.1/24" />
        <InputField label="Gateway" value={gateway} onChange={setGateway} placeholder="192.168.100.254" />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create VLAN'}
        </button>
      </div>
    </ModalWrapper>
  )
}

function CreateMacvtapModal({ onClose, onCreated }: { onClose: () => void; onCreated: (m: MacvtapConfig) => void }) {
  const [name, setName] = useState('')
  const [parent, setParent] = useState('')
  const [mode, setMode] = useState<MacvtapMode>('bridge')
  const [mtu, setMtu] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim() || !parent.trim()) { setErr('Name and parent interface are required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateMacvtapRequest = {
        name: name.trim(),
        parent_interface: parent.trim(),
        mode,
        mtu: mtu ? parseInt(mtu) : undefined,
      }
      const mvt = await api.createMacvtap(req)
      onCreated(mvt)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create Macvtap" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="macvtap0" />
        <InputField label="Parent Interface" value={parent} onChange={setParent} placeholder="eth0" />
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Mode</label>
          <select value={mode} onChange={e => setMode(e.target.value as MacvtapMode)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
            <option value="bridge">bridge</option>
            <option value="vepa">vepa</option>
            <option value="private">private</option>
            <option value="passthru">passthru</option>
            <option value="source">source</option>
          </select>
        </div>
        <InputField label="MTU" value={mtu} onChange={setMtu} placeholder="1500" type="number" />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create Macvtap'}
        </button>
      </div>
    </ModalWrapper>
  )
}

function CreateTapModal({ onClose, onCreated }: { onClose: () => void; onCreated: (t: TapConfig) => void }) {
  const [name, setName] = useState('')
  const [bridge, setBridge] = useState('')
  const [user, setUser] = useState('')
  const [group, setGroup] = useState('')
  const [multiQueue, setMultiQueue] = useState(false)
  const [vnetHdr, setVnetHdr] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) { setErr('Name is required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateTapRequest = {
        name: name.trim(),
        bridge: bridge.trim() || undefined,
        user: user.trim() || undefined,
        group: group.trim() || undefined,
        multi_queue: multiQueue || undefined,
        vnet_hdr: vnetHdr || undefined,
      }
      const tap = await api.createTap(req)
      onCreated(tap)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create Tap Device" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="tap0" />
        <InputField label="Bridge (attach to)" value={bridge} onChange={setBridge} placeholder="br0" />
        <InputField label="User" value={user} onChange={setUser} placeholder="qemu" />
        <InputField label="Group" value={group} onChange={setGroup} placeholder="kvm" />
        <CheckboxField label="Multi-queue" checked={multiQueue} onChange={setMultiQueue} />
        <CheckboxField label="VNet header" checked={vnetHdr} onChange={setVnetHdr} />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create Tap'}
        </button>
      </div>
    </ModalWrapper>
  )
}

function CreateBondModal({ onClose, onCreated }: { onClose: () => void; onCreated: (b: BondConfig) => void }) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<BondMode>('802.3ad')
  const [slaves, setSlaves] = useState('')
  const [miiMonitor, setMiiMonitor] = useState('100')
  const [addresses, setAddresses] = useState('')
  const [gateway, setGateway] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) { setErr('Name is required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateBondRequest = {
        name: name.trim(),
        mode,
        mii_monitor_sec: miiMonitor ? parseInt(miiMonitor) : undefined,
        slave_interfaces: slaves ? slaves.split(',').map(s => s.trim()).filter(Boolean) : [],
        addresses: addresses ? addresses.split(',').map(s => s.trim()).filter(Boolean) : [],
        gateway: gateway.trim() || undefined,
      }
      const bond = await api.createBond(req)
      onCreated(bond)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create Bond" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="bond0" />
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Mode</label>
          <select value={mode} onChange={e => setMode(e.target.value as BondMode)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
            <option value="802.3ad">802.3ad (LACP)</option>
            <option value="active-backup">active-backup</option>
            <option value="balance-rr">balance-rr</option>
            <option value="balance-xor">balance-xor</option>
            <option value="broadcast">broadcast</option>
            <option value="balance-tlb">balance-tlb</option>
            <option value="balance-alb">balance-alb</option>
          </select>
        </div>
        <InputField label="Slave Interfaces (comma-separated)" value={slaves} onChange={setSlaves} placeholder="eth0, eth1" />
        <InputField label="MII Monitor (ms)" value={miiMonitor} onChange={setMiiMonitor} placeholder="100" type="number" />
        <InputField label="Addresses (comma-separated)" value={addresses} onChange={setAddresses} placeholder="10.0.0.1/24" />
        <InputField label="Gateway" value={gateway} onChange={setGateway} placeholder="10.0.0.254" />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create Bond'}
        </button>
      </div>
    </ModalWrapper>
  )
}

function CreateNetfileModal({ onClose, onCreated }: { onClose: () => void; onCreated: (n: NetworkFileConfig) => void }) {
  const [matchName, setMatchName] = useState('')
  const [addresses, setAddresses] = useState('')
  const [gateway, setGateway] = useState('')
  const [dns, setDns] = useState('')
  const [dhcp, setDhcp] = useState('no')
  const [bridge, setBridge] = useState('')
  const [bond, setBond] = useState('')
  const [mtu, setMtu] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!matchName.trim()) { setErr('Interface name is required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateNetworkFileRequest = {
        match_name: matchName.trim(),
        addresses: addresses ? addresses.split(',').map(s => s.trim()).filter(Boolean) : [],
        gateway: gateway.trim() || undefined,
        dns: dns ? dns.split(',').map(s => s.trim()).filter(Boolean) : [],
        dhcp: (dhcp as any) || undefined,
        bridge: bridge.trim() || undefined,
        bond: bond.trim() || undefined,
        mtu: mtu ? parseInt(mtu) : undefined,
      }
      const netfile = await api.createNetworkFile(req)
      onCreated(netfile)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Configure Interface" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Interface Name" value={matchName} onChange={setMatchName} placeholder="enp3s0" />
        <InputField label="Addresses (comma-separated)" value={addresses} onChange={setAddresses} placeholder="192.168.1.10/24" />
        <InputField label="Gateway" value={gateway} onChange={setGateway} placeholder="192.168.1.1" />
        <InputField label="DNS (comma-separated)" value={dns} onChange={setDns} placeholder="8.8.8.8, 1.1.1.1" />
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">DHCP</label>
          <select value={dhcp} onChange={e => setDhcp(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
            <option value="no">no</option>
            <option value="yes">yes</option>
            <option value="ipv4">ipv4</option>
            <option value="ipv6">ipv6</option>
          </select>
        </div>
        <InputField label="Bridge (attach to)" value={bridge} onChange={setBridge} placeholder="br0" />
        <InputField label="Bond (attach to)" value={bond} onChange={setBond} placeholder="bond0" />
        <InputField label="MTU" value={mtu} onChange={setMtu} placeholder="1500" type="number" />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Configure Interface'}
        </button>
      </div>
    </ModalWrapper>
  )
}

function PortForwardsTab({ portForwards, onDelete, onCreate, onSync }: {
  portForwards: PortForwardConfig[]; onDelete: (id: string) => void; onCreate: () => void; onSync: () => void
}) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <div className="p-6 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Port Forwards (nftables DNAT)</h2>
        <div className="flex gap-2">
          <button onClick={onSync} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition text-sm">
            <RefreshCw className="w-4 h-4" /> Sync Rules
          </button>
          <button onClick={onCreate} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition text-sm">
            <Plus className="w-4 h-4" /> Add Port Forward
          </button>
        </div>
      </div>
      {portForwards.length === 0 ? (
        <div className="p-12 text-center text-gray-400">No port forwards configured. Add one to expose a VM service to the host network.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4 font-medium text-gray-300">Name</th>
                <th className="text-left p-4 font-medium text-gray-300">Protocol</th>
                <th className="text-left p-4 font-medium text-gray-300">Host Port</th>
                <th className="text-left p-4 font-medium text-gray-300">Guest IP:Port</th>
                <th className="text-left p-4 font-medium text-gray-300">Enabled</th>
                <th className="text-left p-4 font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {portForwards.map(pf => (
                <tr key={pf.id} className="hover:bg-gray-700 transition">
                  <td className="p-4 font-medium">{pf.name}</td>
                  <td className="p-4">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">{pf.protocol}</span>
                  </td>
                  <td className="p-4 font-mono text-sm text-blue-400">{pf.host_port}</td>
                  <td className="p-4 font-mono text-sm text-gray-400">{pf.guest_ip}:{pf.guest_port}</td>
                  <td className="p-4">{pf.enabled ? <span className="text-green-400">yes</span> : <span className="text-gray-500">no</span>}</td>
                  <td className="p-4">
                    <button onClick={() => onDelete(pf.id)} className="p-2 hover:bg-red-600 rounded transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CreatePortForwardModal({ onClose, onCreated }: { onClose: () => void; onCreated: (pf: PortForwardConfig) => void }) {
  const [name, setName] = useState('')
  const [protocol, setProtocol] = useState<Protocol>('tcp')
  const [hostPort, setHostPort] = useState('')
  const [guestIp, setGuestIp] = useState('')
  const [guestPort, setGuestPort] = useState('')
  const [iface, setIface] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim() || !hostPort || !guestIp.trim() || !guestPort) {
      setErr('Name, host port, guest IP, and guest port are required')
      return
    }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreatePortForwardRequest = {
        name: name.trim(),
        protocol,
        host_port: parseInt(hostPort),
        guest_ip: guestIp.trim(),
        guest_port: parseInt(guestPort),
        interface: iface.trim() || undefined,
      }
      const pf = await api.createPortForward(req)
      onCreated(pf)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Add Port Forward" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="web-server" />
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Protocol</label>
          <select value={protocol} onChange={e => setProtocol(e.target.value as Protocol)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
            <option value="both">Both (TCP + UDP)</option>
          </select>
        </div>
        <InputField label="Host Port" value={hostPort} onChange={setHostPort} placeholder="8080" type="number" />
        <InputField label="Guest IP" value={guestIp} onChange={setGuestIp} placeholder="192.168.100.10" />
        <InputField label="Guest Port" value={guestPort} onChange={setGuestPort} placeholder="80" type="number" />
        <InputField label="Interface (optional)" value={iface} onChange={setIface} placeholder="eth0" />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Add Port Forward'}
        </button>
      </div>
    </ModalWrapper>
  )
}

function CreateLinkfileModal({ onClose, onCreated }: { onClose: () => void; onCreated: (l: LinkFileConfig) => void }) {
  const [matchMac, setMatchMac] = useState('')
  const [matchOrigName, setMatchOrigName] = useState('')
  const [name, setName] = useState('')
  const [mtu, setMtu] = useState('')
  const [macAddress, setMacAddress] = useState('')
  const [wol, setWol] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!matchMac.trim() && !matchOrigName.trim()) { setErr('At least one match criterion is required (MAC or original name)'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateLinkFileRequest = {
        match_mac: matchMac.trim() || undefined,
        match_original_name: matchOrigName.trim() || undefined,
        name: name.trim() || undefined,
        mtu: mtu ? parseInt(mtu) : undefined,
        mac_address: macAddress.trim() || undefined,
        wake_on_lan: wol.trim() || undefined,
      }
      const linkfile = await api.createLinkFile(req)
      onCreated(linkfile)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create Link File" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Match MAC Address" value={matchMac} onChange={setMatchMac} placeholder="00:11:22:33:44:55" />
        <InputField label="Match Original Name" value={matchOrigName} onChange={setMatchOrigName} placeholder="en*" />
        <InputField label="Rename To" value={name} onChange={setName} placeholder="lan0" />
        <InputField label="MTU" value={mtu} onChange={setMtu} placeholder="9000" type="number" />
        <InputField label="Override MAC Address" value={macAddress} onChange={setMacAddress} placeholder="52:54:00:aa:bb:cc" />
        <InputField label="Wake-on-LAN" value={wol} onChange={setWol} placeholder="magic" />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create Link File'}
        </button>
      </div>
    </ModalWrapper>
  )
}
