// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import * as api from '../../api/networkd'
import type { PortForwardConfig, CreatePortForwardRequest, Protocol } from '../../api/networkd'
import { ModalWrapper, InputField, HostBadge, HostManagedActions, isHostManaged, extractErrorMessage } from './ModalShared'

interface PortForwardsTabProps {
  portForwards: PortForwardConfig[]
  onDelete: (id: string) => void
  onAdopt?: (id: string) => void
  onCreate: () => void
  onSync: () => void
}

function PortForwardsTabContent({ portForwards, onDelete, onAdopt, onCreate, onSync }: PortForwardsTabProps) {
  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Port Forwards (nftables DNAT)</h2>
        <div className="flex gap-2">
          <button onClick={onSync} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition text-sm">
            <RefreshCw className="w-4 h-4" /> Sync Rules
          </button>
          <button onClick={onCreate} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition text-sm">
            <Plus className="w-4 h-4" /> Add Port Forward
          </button>
        </div>
      </div>
      {portForwards.length === 0 ? (
        <div className="p-12 text-center text-slate-400">No port forwards configured. Add one to expose a VM service to the host network.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-left p-4 font-medium text-slate-300">Name</th>
                <th className="text-left p-4 font-medium text-slate-300">Protocol</th>
                <th className="text-left p-4 font-medium text-slate-300">Host Port</th>
                <th className="text-left p-4 font-medium text-slate-300">Guest IP:Port</th>
                <th className="text-left p-4 font-medium text-slate-300">Enabled</th>
                <th className="text-left p-4 font-medium text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {portForwards.map(pf => (
                <tr key={pf.id} className="hover:bg-white/[0.03] transition">
                  <td className="p-4 font-medium">
                    <span className="flex items-center gap-2 flex-wrap">
                      {pf.name}
                      {isHostManaged(pf) && <HostBadge />}
                    </span>
                    {pf.description && (
                      <span className="block text-xs text-slate-500 font-normal mt-0.5">{pf.description}</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">{pf.protocol}</span>
                  </td>
                  <td className="p-4 font-mono text-sm text-blue-400">{pf.host_port}</td>
                  <td className="p-4 font-mono text-sm text-slate-400">{pf.guest_ip}:{pf.guest_port}</td>
                  <td className="p-4">{pf.enabled ? <span className="text-green-400">yes</span> : <span className="text-slate-500">no</span>}</td>
                  <td className="p-4">
                    <HostManagedActions
                      item={pf}
                      onDelete={() => onDelete(pf.id)}
                      onAdopt={onAdopt ? () => onAdopt(pf.id) : undefined}
                    />
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

export function CreatePortForwardModal({ onClose, onCreated }: { onClose: () => void; onCreated: (pf: PortForwardConfig) => void }) {
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
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Add Port Forward" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="web-server" />
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Protocol</label>
          <select value={protocol} onChange={e => setProtocol(e.target.value as Protocol)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
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

export default PortForwardsTabContent
