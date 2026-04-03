import { useState } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import * as api from '../../api/network-security'
import type { VpnTunnel, CreateVpnTunnelRequest, VpnNetwork, CreateVpnNetworkRequest, VpnTopology } from '../../api/network-security'
import { ModalWrapper, InputField, extractErrorMessage } from '../network/ModalShared'
import { LabelSelectorInput, LabelTags, StatusBadge } from './ModalShared'

interface VpnTabProps {
  tunnels: VpnTunnel[]
  networks: VpnNetwork[]
  onDeleteTunnel: (id: string) => void
  onDeleteNetwork: (id: string) => void
  onCreate: () => void
  onSync: () => void
}

function VpnTabContent({ tunnels, networks, onDeleteTunnel, onDeleteNetwork, onCreate, onSync }: VpnTabProps) {
  const [view, setView] = useState<'tunnels' | 'networks'>('tunnels')
  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">VPN Mesh</h2>
          <div className="flex bg-slate-800 rounded-lg p-0.5">
            {(['tunnels', 'networks'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1 rounded text-sm transition ${view === v ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onSync} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition text-sm">
            <RefreshCw className="w-4 h-4" /> Sync
          </button>
          <button onClick={onCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition text-sm">
            <Plus className="w-4 h-4" /> Add {view === 'tunnels' ? 'Tunnel' : 'Network'}
          </button>
        </div>
      </div>

      {view === 'tunnels' && (
        tunnels.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No VPN tunnels configured. Create a WireGuard tunnel to connect VMs.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">Name</th>
                  <th className="text-left p-4 font-medium text-slate-300">Interface</th>
                  <th className="text-left p-4 font-medium text-slate-300">Port</th>
                  <th className="text-left p-4 font-medium text-slate-300">Peers</th>
                  <th className="text-left p-4 font-medium text-slate-300">Key</th>
                  <th className="text-left p-4 font-medium text-slate-300">Status</th>
                  <th className="text-left p-4 font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {tunnels.map(t => (
                  <tr key={t.id} className="hover:bg-white/[0.03] transition">
                    <td className="p-4">
                      <div className="font-medium">{t.name}</div>
                      {t.description && <div className="text-xs text-slate-500 mt-1">{t.description}</div>}
                    </td>
                    <td className="p-4 font-mono text-sm text-blue-400">{t.interface_name}</td>
                    <td className="p-4 font-mono text-sm">{t.listen_port}</td>
                    <td className="p-4 font-medium text-cyan-400">{t.peers.length}</td>
                    <td className="p-4">
                      <StatusBadge status={t.private_key_set ? 'set' : 'missing'} color={t.private_key_set ? 'green' : 'red'} />
                    </td>
                    <td className="p-4">
                      <StatusBadge status={t.enabled ? 'active' : 'disabled'} color={t.enabled ? 'green' : 'gray'} />
                    </td>
                    <td className="p-4">
                      <button onClick={() => onDeleteTunnel(t.id)} className="p-2 hover:bg-red-600 rounded transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {view === 'networks' && (
        networks.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No VPN networks configured.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">Name</th>
                  <th className="text-left p-4 font-medium text-slate-300">Topology</th>
                  <th className="text-left p-4 font-medium text-slate-300">Address Range</th>
                  <th className="text-left p-4 font-medium text-slate-300">Labels</th>
                  <th className="text-left p-4 font-medium text-slate-300">Tunnels</th>
                  <th className="text-left p-4 font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {networks.map(n => (
                  <tr key={n.id} className="hover:bg-white/[0.03] transition">
                    <td className="p-4 font-medium">{n.name}</td>
                    <td className="p-4">
                      <StatusBadge status={n.topology} color="blue" />
                    </td>
                    <td className="p-4 font-mono text-sm text-slate-400">{n.address_range}</td>
                    <td className="p-4"><LabelTags labels={n.labels} /></td>
                    <td className="p-4 font-medium text-cyan-400">{n.tunnel_ids.length}</td>
                    <td className="p-4">
                      <button onClick={() => onDeleteNetwork(n.id)} className="p-2 hover:bg-red-600 rounded transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

export function CreateVpnTunnelModal({ onClose, onCreated }: { onClose: () => void; onCreated: (t: VpnTunnel) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [interfaceName, setInterfaceName] = useState('')
  const [listenPort, setListenPort] = useState('51820')
  const [privateKey, setPrivateKey] = useState('')
  const [peerKey, setPeerKey] = useState('')
  const [peerEndpoint, setPeerEndpoint] = useState('')
  const [peerAllowedIps, setPeerAllowedIps] = useState('')
  const [peers, setPeers] = useState<{ public_key: string; endpoint?: string; allowed_ips: string[] }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const addPeer = () => {
    if (!peerKey.trim()) return
    setPeers(prev => [...prev, {
      public_key: peerKey.trim(),
      endpoint: peerEndpoint.trim() || undefined,
      allowed_ips: peerAllowedIps.trim() ? peerAllowedIps.split(',').map(s => s.trim()) : [],
    }])
    setPeerKey('')
    setPeerEndpoint('')
    setPeerAllowedIps('')
  }

  const handleSubmit = async () => {
    if (!name.trim()) { setErr('Name is required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateVpnTunnelRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        interface_name: interfaceName.trim() || undefined,
        listen_port: parseInt(listenPort) || 51820,
        private_key: privateKey.trim() || undefined,
        peers: peers.length > 0 ? peers : undefined,
      }
      const t = await api.createVpnTunnel(req)
      onCreated(t)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create VPN Tunnel" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="wg-site-a" />
        <InputField label="Description" value={description} onChange={setDescription} placeholder="Site A WireGuard tunnel" />
        <div className="grid grid-cols-2 gap-2">
          <InputField label="Interface Name" value={interfaceName} onChange={setInterfaceName} placeholder="wg0" />
          <InputField label="Listen Port" value={listenPort} onChange={setListenPort} placeholder="51820" type="number" />
        </div>
        <InputField label="Private Key" value={privateKey} onChange={setPrivateKey} placeholder="Base64 private key" />
        <div className="border border-slate-700/50 rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium text-slate-300">Add Peer</div>
          <InputField label="Public Key" value={peerKey} onChange={setPeerKey} placeholder="Base64 public key" />
          <div className="grid grid-cols-2 gap-2">
            <InputField label="Endpoint" value={peerEndpoint} onChange={setPeerEndpoint} placeholder="1.2.3.4:51820" />
            <InputField label="Allowed IPs (comma-separated)" value={peerAllowedIps} onChange={setPeerAllowedIps} placeholder="10.0.0.0/24" />
          </div>
          <button type="button" onClick={addPeer} className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition">
            <Plus className="w-3 h-3" /> Add Peer
          </button>
          {peers.length > 0 && (
            <div className="space-y-1 mt-2">
              {peers.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-slate-800 rounded px-2 py-1">
                  <span className="text-slate-300 truncate">{p.public_key.slice(0, 20)}...</span>
                  {p.endpoint && <span className="text-slate-400">{p.endpoint}</span>}
                  <button onClick={() => setPeers(prev => prev.filter((_, j) => j !== i))} className="ml-auto text-red-400 hover:text-red-300">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create Tunnel'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export function CreateVpnNetworkModal({ onClose, onCreated }: { onClose: () => void; onCreated: (n: VpnNetwork) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [topology, setTopology] = useState<VpnTopology>('full-mesh')
  const [addressRange, setAddressRange] = useState('')
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim() || !addressRange.trim()) { setErr('Name and address range are required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateVpnNetworkRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        topology,
        address_range: addressRange.trim(),
        labels: Object.keys(labels).length > 0 ? labels : undefined,
      }
      const n = await api.createVpnNetwork(req)
      onCreated(n)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create VPN Network" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="site-network" />
        <InputField label="Description" value={description} onChange={setDescription} placeholder="Multi-site VPN network" />
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Topology</label>
          <select value={topology} onChange={e => setTopology(e.target.value as VpnTopology)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
            <option value="full-mesh">Full Mesh</option>
            <option value="hub-spoke">Hub & Spoke</option>
            <option value="point-to-point">Point to Point</option>
          </select>
        </div>
        <InputField label="Address Range" value={addressRange} onChange={setAddressRange} placeholder="10.10.0.0/16" />
        <LabelSelectorInput labels={labels} onChange={setLabels} />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create Network'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export default VpnTabContent
