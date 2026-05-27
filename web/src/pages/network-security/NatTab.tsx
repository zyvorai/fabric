// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import * as api from '../../api/network-security'
import type { NatRule, CreateNatRuleRequest, NatPool, CreateNatPoolRequest, NatGatewayConfig, CreateNatGatewayRequest, NatType } from '../../api/network-security'
import { ModalWrapper, InputField, extractErrorMessage } from '../network/ModalShared'
import { LabelSelectorInput, LabelTags, StatusBadge } from './ModalShared'

interface NatTabProps {
  rules: NatRule[]
  pools: NatPool[]
  gateways: NatGatewayConfig[]
  onDeleteRule: (id: string) => void
  onDeletePool: (id: string) => void
  onDeleteGateway: (id: string) => void
  onCreate: () => void
  onSync: () => void
}

function NatTabContent({ rules, pools, gateways, onDeleteRule, onDeletePool, onDeleteGateway, onCreate, onSync }: NatTabProps) {
  const [view, setView] = useState<'rules' | 'pools' | 'gateways'>('rules')
  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">NAT Gateway</h2>
          <div className="flex bg-slate-800 rounded-lg p-0.5">
            {(['rules', 'pools', 'gateways'] as const).map(v => (
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
            <Plus className="w-4 h-4" /> Add {view === 'rules' ? 'Rule' : view === 'pools' ? 'Pool' : 'Gateway'}
          </button>
        </div>
      </div>

      {view === 'rules' && (
        rules.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No NAT rules configured.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">Name</th>
                  <th className="text-left p-4 font-medium text-slate-300">Type</th>
                  <th className="text-left p-4 font-medium text-slate-300">Source</th>
                  <th className="text-left p-4 font-medium text-slate-300">Destination</th>
                  <th className="text-left p-4 font-medium text-slate-300">Translate To</th>
                  <th className="text-left p-4 font-medium text-slate-300">Status</th>
                  <th className="text-left p-4 font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {rules.map(r => (
                  <tr key={r.id} className="hover:bg-white/[0.03] transition">
                    <td className="p-4">
                      <div className="font-medium">{r.name}</div>
                      {r.description && <div className="text-xs text-slate-500 mt-1">{r.description}</div>}
                    </td>
                    <td className="p-4">
                      <StatusBadge
                        status={r.nat_type}
                        color={r.nat_type === 'masquerade' ? 'blue' : r.nat_type === 'snat' ? 'green' : r.nat_type === 'dnat' ? 'yellow' : 'red'}
                      />
                    </td>
                    <td className="p-4 font-mono text-sm text-slate-400">{r.source_cidr ?? '*'}</td>
                    <td className="p-4 font-mono text-sm text-slate-400">{r.dest_cidr ?? '*'}</td>
                    <td className="p-4 font-mono text-sm text-blue-400">
                      {r.translate_address ?? '-'}{r.translate_port ? `:${r.translate_port}` : ''}
                    </td>
                    <td className="p-4">
                      <StatusBadge status={r.enabled ? 'active' : 'disabled'} color={r.enabled ? 'green' : 'gray'} />
                    </td>
                    <td className="p-4">
                      <button onClick={() => onDeleteRule(r.id)} className="p-2 hover:bg-red-600 rounded transition">
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

      {view === 'pools' && (
        pools.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No NAT pools configured.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">Name</th>
                  <th className="text-left p-4 font-medium text-slate-300">Address Range</th>
                  <th className="text-left p-4 font-medium text-slate-300">Port Range</th>
                  <th className="text-left p-4 font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {pools.map(p => (
                  <tr key={p.id} className="hover:bg-white/[0.03] transition">
                    <td className="p-4 font-medium">{p.name}</td>
                    <td className="p-4 font-mono text-sm text-blue-400">{p.address_range}</td>
                    <td className="p-4 font-mono text-sm text-slate-400">
                      {p.port_range_start && p.port_range_end ? `${p.port_range_start}-${p.port_range_end}` : '-'}
                    </td>
                    <td className="p-4">
                      <button onClick={() => onDeletePool(p.id)} className="p-2 hover:bg-red-600 rounded transition">
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

      {view === 'gateways' && (
        gateways.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No NAT gateways configured.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">Name</th>
                  <th className="text-left p-4 font-medium text-slate-300">Labels</th>
                  <th className="text-left p-4 font-medium text-slate-300">Rules</th>
                  <th className="text-left p-4 font-medium text-slate-300">Status</th>
                  <th className="text-left p-4 font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {gateways.map(g => (
                  <tr key={g.id} className="hover:bg-white/[0.03] transition">
                    <td className="p-4 font-medium">{g.name}</td>
                    <td className="p-4"><LabelTags labels={g.labels} /></td>
                    <td className="p-4 font-medium text-cyan-400">{g.rule_ids.length}</td>
                    <td className="p-4">
                      <StatusBadge status={g.enabled ? 'active' : 'disabled'} color={g.enabled ? 'green' : 'gray'} />
                    </td>
                    <td className="p-4">
                      <button onClick={() => onDeleteGateway(g.id)} className="p-2 hover:bg-red-600 rounded transition">
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

export function CreateNatRuleModal({ onClose, onCreated }: { onClose: () => void; onCreated: (r: NatRule) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [natType, setNatType] = useState<NatType>('masquerade')
  const [sourceCidr, setSourceCidr] = useState('')
  const [destCidr, setDestCidr] = useState('')
  const [protocol, setProtocol] = useState('')
  const [port, setPort] = useState('')
  const [translateAddress, setTranslateAddress] = useState('')
  const [translatePort, setTranslatePort] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) { setErr('Name is required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateNatRuleRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        nat_type: natType,
        source_cidr: sourceCidr.trim() || undefined,
        dest_cidr: destCidr.trim() || undefined,
        protocol: protocol.trim() || undefined,
        port: port ? parseInt(port) : undefined,
        translate_address: translateAddress.trim() || undefined,
        translate_port: translatePort ? parseInt(translatePort) : undefined,
      }
      const r = await api.createNatRule(req)
      onCreated(r)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create NAT Rule" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="outbound-masq" />
        <InputField label="Description" value={description} onChange={setDescription} placeholder="Outbound masquerade" />
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">NAT Type</label>
          <select value={natType} onChange={e => setNatType(e.target.value as NatType)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
            <option value="masquerade">Masquerade</option>
            <option value="snat">SNAT</option>
            <option value="dnat">DNAT</option>
            <option value="hairpin">Hairpin</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <InputField label="Source CIDR" value={sourceCidr} onChange={setSourceCidr} placeholder="192.168.0.0/16" />
          <InputField label="Dest CIDR" value={destCidr} onChange={setDestCidr} placeholder="0.0.0.0/0" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <InputField label="Protocol" value={protocol} onChange={setProtocol} placeholder="tcp" />
          <InputField label="Port" value={port} onChange={setPort} placeholder="80" type="number" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <InputField label="Translate Address" value={translateAddress} onChange={setTranslateAddress} placeholder="203.0.113.1" />
          <InputField label="Translate Port" value={translatePort} onChange={setTranslatePort} placeholder="8080" type="number" />
        </div>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create NAT Rule'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export function CreateNatPoolModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: NatPool) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [addressRange, setAddressRange] = useState('')
  const [portStart, setPortStart] = useState('')
  const [portEnd, setPortEnd] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim() || !addressRange.trim()) { setErr('Name and address range are required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateNatPoolRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        address_range: addressRange.trim(),
        port_range_start: portStart ? parseInt(portStart) : undefined,
        port_range_end: portEnd ? parseInt(portEnd) : undefined,
      }
      const p = await api.createNatPool(req)
      onCreated(p)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create NAT Pool" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="public-pool" />
        <InputField label="Description" value={description} onChange={setDescription} placeholder="Public IP pool" />
        <InputField label="Address Range" value={addressRange} onChange={setAddressRange} placeholder="203.0.113.0/24" />
        <div className="grid grid-cols-2 gap-2">
          <InputField label="Port Range Start" value={portStart} onChange={setPortStart} placeholder="1024" type="number" />
          <InputField label="Port Range End" value={portEnd} onChange={setPortEnd} placeholder="65535" type="number" />
        </div>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create Pool'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export function CreateNatGatewayModal({ onClose, onCreated }: { onClose: () => void; onCreated: (g: NatGatewayConfig) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) { setErr('Name is required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateNatGatewayRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        labels: Object.keys(labels).length > 0 ? labels : undefined,
      }
      const g = await api.createNatGateway(req)
      onCreated(g)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create NAT Gateway" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="main-gateway" />
        <InputField label="Description" value={description} onChange={setDescription} placeholder="Main NAT gateway" />
        <LabelSelectorInput labels={labels} onChange={setLabels} />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create Gateway'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export default NatTabContent
