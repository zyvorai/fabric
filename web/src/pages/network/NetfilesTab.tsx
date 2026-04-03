import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import * as api from '../../api/networkd'
import type { NetworkFileConfig, CreateNetworkFileRequest } from '../../api/networkd'
import { ModalWrapper, InputField, extractErrorMessage } from './ModalShared'

interface NetfilesTabProps {
  netfiles: NetworkFileConfig[]
  onDelete: (id: string) => void
  onCreate: () => void
}

function NetfilesTabContent({ netfiles, onDelete, onCreate }: NetfilesTabProps) {
  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Interface Configuration (.network)</h2>
        <button onClick={onCreate} className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded-lg transition text-sm">
          <Plus className="w-4 h-4" /> Configure Interface
        </button>
      </div>
      {netfiles.length === 0 ? (
        <div className="p-12 text-center text-slate-400">No interface configurations. Configure a physical interface to assign IPs, bridge membership, etc.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-left p-4 font-medium text-slate-300">Interface</th>
                <th className="text-left p-4 font-medium text-slate-300">Addresses</th>
                <th className="text-left p-4 font-medium text-slate-300">DHCP</th>
                <th className="text-left p-4 font-medium text-slate-300">Bridge</th>
                <th className="text-left p-4 font-medium text-slate-300">Bond</th>
                <th className="text-left p-4 font-medium text-slate-300">MTU</th>
                <th className="text-left p-4 font-medium text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {netfiles.map(n => (
                <tr key={n.id} className="hover:bg-white/[0.03] transition">
                  <td className="p-4 font-medium">{n.match_name}</td>
                  <td className="p-4 text-slate-400 font-mono text-sm">{n.addresses.join(', ') || '-'}</td>
                  <td className="p-4 text-slate-400">{n.dhcp}</td>
                  <td className="p-4 text-slate-400">{n.bridge ?? '-'}</td>
                  <td className="p-4 text-slate-400">{n.bond ?? '-'}</td>
                  <td className="p-4 text-slate-400">{n.mtu ?? '-'}</td>
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

export function CreateNetfileModal({ onClose, onCreated }: { onClose: () => void; onCreated: (n: NetworkFileConfig) => void }) {
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
        dhcp: (dhcp as CreateNetworkFileRequest['dhcp']) || undefined,
        bridge: bridge.trim() || undefined,
        bond: bond.trim() || undefined,
        mtu: mtu ? parseInt(mtu) : undefined,
      }
      const netfile = await api.createNetworkFile(req)
      onCreated(netfile)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
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
          <label className="block text-sm font-medium text-slate-300 mb-1">DHCP</label>
          <select value={dhcp} onChange={e => setDhcp(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
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

export default NetfilesTabContent
