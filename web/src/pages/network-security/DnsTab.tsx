// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import * as api from '../../api/network-security'
import type { DnsZone, CreateDnsZoneRequest, DnsPolicy, CreateDnsPolicyRequest, DnsRecordType } from '../../api/network-security'
import { ModalWrapper, InputField, HostBadge, HostManagedActions, isHostManaged, extractErrorMessage } from '../network/ModalShared'
import { LabelSelectorInput, LabelTags, StatusBadge } from './ModalShared'

interface DnsTabProps {
  zones: DnsZone[]
  policies: DnsPolicy[]
  onDeleteZone: (id: string) => void
  onDeletePolicy: (id: string) => void
  onAdoptZone?: (id: string) => void
  onCreate: () => void
  onSync: () => void
}

function DnsTabContent({ zones, policies, onDeleteZone, onDeletePolicy, onAdoptZone, onCreate, onSync }: DnsTabProps) {
  const [view, setView] = useState<'zones' | 'policies'>('zones')
  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">DNS Policy</h2>
          <div className="flex bg-slate-800 rounded-lg p-0.5">
            {(['zones', 'policies'] as const).map(v => (
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
            <Plus className="w-4 h-4" /> Add {view === 'zones' ? 'Zone' : 'Policy'}
          </button>
        </div>
      </div>

      {view === 'zones' && (
        zones.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No DNS zones configured.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">Name</th>
                  <th className="text-left p-4 font-medium text-slate-300">Domain</th>
                  <th className="text-left p-4 font-medium text-slate-300">Records</th>
                  <th className="text-left p-4 font-medium text-slate-300">Status</th>
                  <th className="text-left p-4 font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {zones.map(z => (
                  <tr key={z.id} className="hover:bg-white/[0.03] transition">
                    <td className="p-4 font-medium">
                      {z.name}
                      {isHostManaged(z) && <HostBadge />}
                      {z.description && <div className="text-xs text-slate-500 font-normal mt-0.5">{z.description}</div>}
                    </td>
                    <td className="p-4 font-mono text-sm text-blue-400">{z.domain ?? z.name}</td>
                    <td className="p-4 font-medium text-cyan-400">{z.records?.length ?? '—'}</td>
                    <td className="p-4">
                      <StatusBadge status={z.enabled === false ? 'disabled' : 'active'} color={z.enabled === false ? 'gray' : 'green'} />
                    </td>
                    <td className="p-4">
                      <HostManagedActions
                        item={{ id: z.id, managed: z.managed }}
                        onDelete={() => onDeleteZone(z.id)}
                        onAdopt={onAdoptZone ? () => onAdoptZone(z.id) : undefined}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {view === 'policies' && (
        policies.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No DNS policies configured.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">Name</th>
                  <th className="text-left p-4 font-medium text-slate-300">Labels</th>
                  <th className="text-left p-4 font-medium text-slate-300">Upstreams</th>
                  <th className="text-left p-4 font-medium text-slate-300">Blocked</th>
                  <th className="text-left p-4 font-medium text-slate-300">Status</th>
                  <th className="text-left p-4 font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {policies.map(p => (
                  <tr key={p.id} className="hover:bg-white/[0.03] transition">
                    <td className="p-4 font-medium">{p.name}</td>
                    <td className="p-4"><LabelTags labels={p.labels} /></td>
                    <td className="p-4 font-mono text-sm text-slate-400">{p.upstream_servers.length}</td>
                    <td className="p-4 font-mono text-sm text-red-400">{p.blocked_domains.length}</td>
                    <td className="p-4">
                      <StatusBadge status={p.enabled ? 'active' : 'disabled'} color={p.enabled ? 'green' : 'gray'} />
                    </td>
                    <td className="p-4">
                      <button onClick={() => onDeletePolicy(p.id)} className="p-2 hover:bg-red-600 rounded transition">
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

export function CreateDnsZoneModal({ onClose, onCreated }: { onClose: () => void; onCreated: (z: DnsZone) => void }) {
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [description, setDescription] = useState('')
  const [records, setRecords] = useState<{ name: string; record_type: DnsRecordType; value: string; ttl: number }[]>([])
  const [recName, setRecName] = useState('')
  const [recType, setRecType] = useState<DnsRecordType>('A')
  const [recValue, setRecValue] = useState('')
  const [recTtl, setRecTtl] = useState('300')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const addRecord = () => {
    if (!recName.trim() || !recValue.trim()) return
    setRecords(prev => [...prev, { name: recName.trim(), record_type: recType, value: recValue.trim(), ttl: parseInt(recTtl) || 300 }])
    setRecName('')
    setRecValue('')
  }

  const handleSubmit = async () => {
    if (!name.trim() || !domain.trim()) { setErr('Name and domain are required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateDnsZoneRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        domain: domain.trim(),
        records: records.length > 0 ? records : undefined,
      }
      const z = await api.createDnsZone(req)
      onCreated(z)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create DNS Zone" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="internal-zone" />
        <InputField label="Domain" value={domain} onChange={setDomain} placeholder="internal.local" />
        <InputField label="Description" value={description} onChange={setDescription} placeholder="Internal DNS zone" />
        <div className="border border-slate-700/50 rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium text-slate-300">Add Record</div>
          <div className="grid grid-cols-2 gap-2">
            <InputField label="Record Name" value={recName} onChange={setRecName} placeholder="web" />
            <div>
              <label className="block text-xs text-slate-400 mb-1">Type</label>
              <select value={recType} onChange={e => setRecType(e.target.value as DnsRecordType)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                {(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'PTR'] as DnsRecordType[]).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InputField label="Value" value={recValue} onChange={setRecValue} placeholder="10.0.0.1" />
            <InputField label="TTL" value={recTtl} onChange={setRecTtl} placeholder="300" type="number" />
          </div>
          <button type="button" onClick={addRecord} className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition">
            <Plus className="w-3 h-3" /> Add Record
          </button>
          {records.length > 0 && (
            <div className="space-y-1 mt-2">
              {records.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-slate-800 rounded px-2 py-1">
                  <StatusBadge status={r.record_type} color="blue" />
                  <span className="text-slate-300">{r.name}</span>
                  <span className="text-slate-400">{r.value}</span>
                  <span className="text-slate-500">TTL:{r.ttl}</span>
                  <button onClick={() => setRecords(prev => prev.filter((_, j) => j !== i))} className="ml-auto text-red-400 hover:text-red-300">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create Zone'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export function CreateDnsPolicyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: DnsPolicy) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [upstreams, setUpstreams] = useState('')
  const [blocked, setBlocked] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) { setErr('Name is required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateDnsPolicyRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        labels: Object.keys(labels).length > 0 ? labels : undefined,
        upstream_servers: upstreams.trim() ? upstreams.split(',').map(s => s.trim()) : undefined,
        blocked_domains: blocked.trim() ? blocked.split(',').map(s => s.trim()) : undefined,
      }
      const p = await api.createDnsPolicy(req)
      onCreated(p)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create DNS Policy" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="secure-dns" />
        <InputField label="Description" value={description} onChange={setDescription} placeholder="Secure DNS policy" />
        <LabelSelectorInput labels={labels} onChange={setLabels} />
        <InputField label="Upstream Servers (comma-separated)" value={upstreams} onChange={setUpstreams} placeholder="8.8.8.8, 1.1.1.1" />
        <InputField label="Blocked Domains (comma-separated)" value={blocked} onChange={setBlocked} placeholder="malware.com, ads.example.com" />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create DNS Policy'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export default DnsTabContent
