// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { Plus } from 'lucide-react'
import * as api from '../../api/networkd'
import type { BridgeConfig, CreateBridgeRequest } from '../../api/networkd'
import { ModalWrapper, InputField, CheckboxField, HostBadge, HostManagedActions, isHostManaged, extractErrorMessage } from './ModalShared'

interface BridgesTabProps {
  bridges: BridgeConfig[]
  onDelete: (id: string) => void
  onCreate: () => void
}

function BridgesTabContent({ bridges, onDelete, onCreate }: BridgesTabProps) {
  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Network Bridges</h2>
        <button onClick={onCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition text-sm">
          <Plus className="w-4 h-4" /> Create Bridge
        </button>
      </div>
      {bridges.length === 0 ? (
        <div className="p-12 text-center text-slate-400">No bridges configured. Create one to get started.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-left p-4 font-medium text-slate-300">Name</th>
                <th className="text-left p-4 font-medium text-slate-300">Addresses</th>
                <th className="text-left p-4 font-medium text-slate-300">STP</th>
                <th className="text-left p-4 font-medium text-slate-300">DHCP</th>
                <th className="text-left p-4 font-medium text-slate-300">MTU</th>
                <th className="text-left p-4 font-medium text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {bridges.map(b => (
                <tr key={b.id} className="hover:bg-white/[0.03] transition">
                  <td className="p-4 font-medium">
                    {b.name}
                    {isHostManaged(b) && <HostBadge />}
                  </td>
                  <td className="p-4 text-slate-400 font-mono text-sm">{b.addresses.join(', ') || '-'}</td>
                  <td className="p-4">{b.stp ? <span className="text-green-400">on</span> : <span className="text-slate-500">off</span>}</td>
                  <td className="p-4 text-slate-400">{b.dhcp}</td>
                  <td className="p-4 text-slate-400">{b.mtu ?? '-'}</td>
                  <td className="p-4">
                    <HostManagedActions item={b} onDelete={() => onDelete(b.id)} />
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

export function CreateBridgeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (b: BridgeConfig) => void }) {
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
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
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

export default BridgesTabContent
