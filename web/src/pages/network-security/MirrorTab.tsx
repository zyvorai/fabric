// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import * as api from '../../api/network-security'
import type { MirrorSession, CreateMirrorSessionRequest, MirrorDirection } from '../../api/network-security'
import { ModalWrapper, InputField, HostBadge, HostManagedActions, isHostManaged, extractErrorMessage } from '../network/ModalShared'
import { StatusBadge } from './ModalShared'
import { useReadOnly } from '../../contexts/ReadOnlyContext'

interface MirrorTabProps {
  sessions: MirrorSession[]
  onDelete: (id: string) => void
  onAdopt?: (id: string) => void
  onCreate: () => void
  onSync: () => void
}

function MirrorTabContent({ sessions, onDelete, onAdopt, onCreate, onSync }: MirrorTabProps) {
  const readOnly = useReadOnly()
  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Packet Mirror</h2>
        <div className="flex gap-2">
          {!readOnly && <button onClick={onSync} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition text-sm">
            <RefreshCw className="w-4 h-4" /> Sync
          </button>}
          {!readOnly && <button onClick={onCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition text-sm">
            <Plus className="w-4 h-4" /> Add Session
          </button>}
        </div>
      </div>
      {sessions.length === 0 ? (
        <div className="p-12 text-center text-slate-400">No mirror sessions configured. Create one to capture and mirror VM network traffic.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-left p-4 font-medium text-slate-300">Name</th>
                <th className="text-left p-4 font-medium text-slate-300">Source VM</th>
                <th className="text-left p-4 font-medium text-slate-300">Direction</th>
                <th className="text-left p-4 font-medium text-slate-300">Collector</th>
                <th className="text-left p-4 font-medium text-slate-300">Filter</th>
                <th className="text-left p-4 font-medium text-slate-300">Status</th>
                <th className="text-left p-4 font-medium text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {sessions.map(s => (
                <tr key={s.id} className="hover:bg-white/[0.03] transition">
                    <td className="p-4">
                      <div className="font-medium">{s.name}{isHostManaged(s) && <HostBadge />}</div>
                      {s.description && <div className="text-xs text-slate-500 mt-1">{s.description}</div>}
                    </td>
                    <td className="p-4 font-mono text-sm text-blue-400">
                      {s.source_vm ?? (Object.keys(s.selector?.match_labels ?? {}).length > 0 ? 'vm' : 'host')}
                    </td>
                  <td className="p-4">
                    <StatusBadge
                      status={s.direction}
                      color={s.direction === 'both' ? 'blue' : s.direction === 'ingress' ? 'green' : 'yellow'}
                    />
                  </td>
                    <td className="p-4 font-mono text-sm text-slate-400">
                      {s.collector_target ?? (s.collector_address ? `${s.collector_address}:${s.collector_port ?? ''}` : '—')}
                    </td>
                  <td className="p-4 text-sm text-slate-400">
                    {s.filter_protocol || s.filter_port || s.filter_cidr ? (
                      <span>{[s.filter_protocol, s.filter_port && `:${s.filter_port}`, s.filter_cidr].filter(Boolean).join(' ')}</span>
                    ) : (
                      <span className="text-slate-500">all</span>
                    )}
                  </td>
                  <td className="p-4">
                    <StatusBadge status={s.enabled ? 'active' : 'disabled'} color={s.enabled ? 'green' : 'gray'} />
                  </td>
                    <td className="p-4">
                      <HostManagedActions readOnly={readOnly}
                        item={{ id: s.id, managed: s.managed }}
                        onDelete={() => onDelete(s.id)}
                        onAdopt={onAdopt ? () => onAdopt(s.id) : undefined}
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

export function CreateMirrorModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: MirrorSession) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sourceVm, setSourceVm] = useState('')
  const [direction, setDirection] = useState<MirrorDirection>('both')
  const [collectorAddress, setCollectorAddress] = useState('')
  const [collectorPort, setCollectorPort] = useState('4789')
  const [filterProtocol, setFilterProtocol] = useState('')
  const [filterPort, setFilterPort] = useState('')
  const [filterCidr, setFilterCidr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim() || !sourceVm.trim() || !collectorAddress.trim()) {
      setErr('Name, source VM, and collector address are required')
      return
    }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateMirrorSessionRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        source_vm: sourceVm.trim(),
        direction,
        collector_address: collectorAddress.trim(),
        collector_port: parseInt(collectorPort) || 4789,
        filter_protocol: filterProtocol.trim() || undefined,
        filter_port: filterPort ? parseInt(filterPort) : undefined,
        filter_cidr: filterCidr.trim() || undefined,
      }
      const s = await api.createMirrorSession(req)
      onCreated(s)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create Mirror Session" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="debug-capture" />
        <InputField label="Description" value={description} onChange={setDescription} placeholder="Debug traffic capture" />
        <InputField label="Source VM" value={sourceVm} onChange={setSourceVm} placeholder="web-server-01" />
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Direction</label>
          <select value={direction} onChange={e => setDirection(e.target.value as MirrorDirection)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
            <option value="both">Both</option>
            <option value="ingress">Ingress</option>
            <option value="egress">Egress</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <InputField label="Collector Address" value={collectorAddress} onChange={setCollectorAddress} placeholder="10.0.0.50" />
          <InputField label="Collector Port" value={collectorPort} onChange={setCollectorPort} placeholder="4789" type="number" />
        </div>
        <div className="border border-slate-700/50 rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium text-slate-300">Filters (optional)</div>
          <div className="grid grid-cols-3 gap-2">
            <InputField label="Protocol" value={filterProtocol} onChange={setFilterProtocol} placeholder="tcp" />
            <InputField label="Port" value={filterPort} onChange={setFilterPort} placeholder="80" type="number" />
            <InputField label="CIDR" value={filterCidr} onChange={setFilterCidr} placeholder="10.0.0.0/8" />
          </div>
        </div>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create Session'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export default MirrorTabContent
