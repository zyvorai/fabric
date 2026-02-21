import { useState, useEffect, useCallback } from 'react'
import { Network as NetworkIcon, Plus, Trash2, RefreshCw, X, Server, Layers, Cable, Terminal } from 'lucide-react'
import * as api from '../api/networkd'
import type {
  BridgeConfig, VlanConfig, MacvtapConfig, TapConfig, LinkInfo,
  CreateBridgeRequest, CreateVlanRequest, CreateMacvtapRequest, CreateTapRequest,
  MacvtapMode,
} from '../api/networkd'

type Tab = 'bridges' | 'vlans' | 'macvtap' | 'taps' | 'status'

export default function Network() {
  const [activeTab, setActiveTab] = useState<Tab>('bridges')
  const [bridges, setBridges] = useState<BridgeConfig[]>([])
  const [vlans, setVlans] = useState<VlanConfig[]>([])
  const [macvtaps, setMacvtaps] = useState<MacvtapConfig[]>([])
  const [taps, setTaps] = useState<TapConfig[]>([])
  const [links, setLinks] = useState<LinkInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [showCreateBridge, setShowCreateBridge] = useState(false)
  const [showCreateVlan, setShowCreateVlan] = useState(false)
  const [showCreateMacvtap, setShowCreateMacvtap] = useState(false)
  const [showCreateTap, setShowCreateTap] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [b, v, m, t, l] = await Promise.all([
        api.listBridges(),
        api.listVlans(),
        api.listMacvtaps(),
        api.listTaps(),
        api.listLinks().catch(() => []),
      ])
      setBridges(b)
      setVlans(v)
      setMacvtaps(m)
      setTaps(t)
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

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'bridges', label: 'Bridges', icon: <Server className="w-4 h-4" /> },
    { key: 'vlans', label: 'VLANs', icon: <Layers className="w-4 h-4" /> },
    { key: 'macvtap', label: 'Macvtap', icon: <Cable className="w-4 h-4" /> },
    { key: 'taps', label: 'Tap', icon: <Terminal className="w-4 h-4" /> },
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-2">Bridges</div>
          <div className="text-3xl font-bold text-blue-400">{bridges.length}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-2">VLANs</div>
          <div className="text-3xl font-bold text-purple-400">{vlans.length}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-2">Macvtap</div>
          <div className="text-3xl font-bold text-green-400">{macvtaps.length}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-2">Tap Devices</div>
          <div className="text-3xl font-bold text-orange-400">{taps.length}</div>
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
          {activeTab === 'vlans' && (
            <VlansTab vlans={vlans} onDelete={handleDeleteVlan} onCreate={() => setShowCreateVlan(true)} />
          )}
          {activeTab === 'macvtap' && (
            <MacvtapTab macvtaps={macvtaps} onDelete={handleDeleteMacvtap} onCreate={() => setShowCreateMacvtap(true)} />
          )}
          {activeTab === 'taps' && (
            <TapsTab taps={taps} onDelete={handleDeleteTap} onCreate={() => setShowCreateTap(true)} />
          )}
          {activeTab === 'status' && <StatusTab links={links} onRefresh={fetchAll} />}
        </>
      )}

      {/* Modals */}
      {showCreateBridge && <CreateBridgeModal onClose={() => setShowCreateBridge(false)} onCreated={(b) => { setBridges(prev => [...prev, b]); setShowCreateBridge(false) }} />}
      {showCreateVlan && <CreateVlanModal onClose={() => setShowCreateVlan(false)} onCreated={(v) => { setVlans(prev => [...prev, v]); setShowCreateVlan(false) }} />}
      {showCreateMacvtap && <CreateMacvtapModal onClose={() => setShowCreateMacvtap(false)} onCreated={(m) => { setMacvtaps(prev => [...prev, m]); setShowCreateMacvtap(false) }} />}
      {showCreateTap && <CreateTapModal onClose={() => setShowCreateTap(false)} onCreated={(t) => { setTaps(prev => [...prev, t]); setShowCreateTap(false) }} />}
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
