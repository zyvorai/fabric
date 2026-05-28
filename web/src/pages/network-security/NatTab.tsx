// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import * as api from '../../api/network-security'
import type { NatRule, CreateNatRuleRequest, NatPool, CreateNatPoolRequest, NatGatewayConfig, CreateNatGatewayRequest, NatRuleType } from '../../api/network-security'
import { ModalWrapper, InputField, HostBadge, HostManagedActions, isHostManaged, extractErrorMessage } from '../network/ModalShared'
import { StatusBadge } from './ModalShared'
import { useReadOnly } from '../../contexts/ReadOnlyContext'

interface NatTabProps {
  rules: NatRule[]
  pools: NatPool[]
  gateways: NatGatewayConfig[]
  onDeleteRule: (id: string) => void
  onDeletePool: (id: string) => void
  onDeleteGateway: (id: string) => void
  onAdoptRule?: (id: string) => void
  onCreate: () => void
  onSync: () => void
}

function NatTabContent({ rules, pools, gateways, onDeleteRule, onDeletePool, onDeleteGateway, onAdoptRule, onCreate, onSync }: NatTabProps) {
  const readOnly = useReadOnly()
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
          {!readOnly && <button onClick={onSync} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition text-sm">
            <RefreshCw className="w-4 h-4" /> Sync
          </button>}
          {!readOnly && <button onClick={onCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition text-sm">
            <Plus className="w-4 h-4" /> Add {view === 'rules' ? 'Rule' : view === 'pools' ? 'Pool' : 'Gateway'}
          </button>}
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
                      <div className="font-medium">{r.name}{isHostManaged(r) && <HostBadge />}</div>
                      {r.description && <div className="text-xs text-slate-500 mt-1">{r.description}</div>}
                    </td>
                    <td className="p-4">
                      <StatusBadge
                        status={r.rule_type}
                        color={r.rule_type === 'masquerade' ? 'blue' : r.rule_type === 'snat' ? 'green' : r.rule_type === 'dnat' ? 'yellow' : 'red'}
                      />
                    </td>
                    <td className="p-4 font-mono text-sm text-slate-400">{r.source_cidr ?? '*'}</td>
                    <td className="p-4 font-mono text-sm text-slate-400">{r.dest_cidr ?? '*'}</td>
                    <td className="p-4 font-mono text-sm text-blue-400">
                      {r.translate_to ?? '-'}{r.translate_port ? `:${r.translate_port}` : ''}
                    </td>
                    <td className="p-4">
                      <StatusBadge status={r.enabled ? 'active' : 'disabled'} color={r.enabled ? 'green' : 'gray'} />
                    </td>
                    <td className="p-4">
                      <HostManagedActions readOnly={readOnly}
                        item={{ id: r.id, managed: r.managed }}
                        onDelete={() => onDeleteRule(r.id)}
                        onAdopt={onAdoptRule ? () => onAdoptRule(r.id) : undefined}
                        adoptLabel="Adopt"
                      />
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
                    <td className="p-4 font-mono text-sm text-blue-400">{p.ip_ranges.join(', ')}</td>
                    <td className="p-4 font-mono text-sm text-slate-400">{p.port_range ?? '-'}</td>
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
                  <th className="text-left p-4 font-medium text-slate-300">Subnet</th>
                  <th className="text-left p-4 font-medium text-slate-300">Outbound</th>
                  <th className="text-left p-4 font-medium text-slate-300">Status</th>
                  <th className="text-left p-4 font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {gateways.map(g => (
                  <tr key={g.id} className="hover:bg-white/[0.03] transition">
                    <td className="p-4 font-medium">{g.name}</td>
                    <td className="p-4 font-mono text-sm text-slate-400">{g.subnet}</td>
                    <td className="p-4 font-mono text-sm text-cyan-400">{g.outbound_interface}</td>
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
  const [ruleType, setRuleType] = useState<NatRuleType>('masquerade')
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
        rule_type: ruleType,
        source_cidr: sourceCidr.trim() || undefined,
        dest_cidr: destCidr.trim() || undefined,
        protocol: (protocol.trim() || undefined) as CreateNatRuleRequest['protocol'],
        dest_port: port ? parseInt(port) : undefined,
        translate_to: translateAddress.trim() || undefined,
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
          <select value={ruleType} onChange={e => setRuleType(e.target.value as NatRuleType)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
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
  const [ipRanges, setIpRanges] = useState('')
  const [portRange, setPortRange] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim() || !ipRanges.trim()) { setErr('Name and IP ranges are required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateNatPoolRequest = {
        name: name.trim(),
        ip_ranges: ipRanges.split(',').map(s => s.trim()).filter(Boolean),
        port_range: portRange.trim() || undefined,
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
        <InputField label="IP Ranges (comma-separated)" value={ipRanges} onChange={setIpRanges} placeholder="203.0.113.10-203.0.113.20" />
        <InputField label="Port Range" value={portRange} onChange={setPortRange} placeholder="1024-65535" />
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
  const [subnet, setSubnet] = useState('')
  const [outboundInterface, setOutboundInterface] = useState('eth0')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim() || !subnet.trim() || !outboundInterface.trim()) {
      setErr('Name, subnet, and outbound interface are required')
      return
    }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateNatGatewayRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        subnet: subnet.trim(),
        outbound_interface: outboundInterface.trim(),
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
        <InputField label="Subnet" value={subnet} onChange={setSubnet} placeholder="10.0.0.0/24" />
        <InputField label="Outbound Interface" value={outboundInterface} onChange={setOutboundInterface} placeholder="eth0" />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create Gateway'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export default NatTabContent
