// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import * as api from '../../api/network-security'
import type { QoSPolicy, CreateQoSPolicyRequest } from '../../api/network-security'
import { ModalWrapper, InputField, extractErrorMessage } from '../network/ModalShared'
import { LabelSelectorInput, LabelTags, StatusBadge } from './ModalShared'

interface QosTabProps {
  policies: QoSPolicy[]
  onDelete: (id: string) => void
  onCreate: () => void
  onSync: () => void
}

function QosTabContent({ policies, onDelete, onCreate, onSync }: QosTabProps) {
  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <h2 className="text-xl font-semibold">QoS / Traffic Shaping</h2>
        <div className="flex gap-2">
          <button onClick={onSync} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition text-sm">
            <RefreshCw className="w-4 h-4" /> Sync
          </button>
          <button onClick={onCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition text-sm">
            <Plus className="w-4 h-4" /> Add QoS Policy
          </button>
        </div>
      </div>
      {policies.length === 0 ? (
        <div className="p-12 text-center text-slate-400">No QoS policies configured. Create one to shape VM network traffic.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-left p-4 font-medium text-slate-300">Name</th>
                <th className="text-left p-4 font-medium text-slate-300">Labels</th>
                <th className="text-left p-4 font-medium text-slate-300">Guaranteed</th>
                <th className="text-left p-4 font-medium text-slate-300">Max Rate</th>
                <th className="text-left p-4 font-medium text-slate-300">Burst</th>
                <th className="text-left p-4 font-medium text-slate-300">Priority</th>
                <th className="text-left p-4 font-medium text-slate-300">VMs</th>
                <th className="text-left p-4 font-medium text-slate-300">Status</th>
                <th className="text-left p-4 font-medium text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {policies.map(p => (
                <tr key={p.id} className="hover:bg-white/[0.03] transition">
                  <td className="p-4">
                    <div className="font-medium">{p.name}</div>
                    {p.description && <div className="text-xs text-slate-500 mt-1">{p.description}</div>}
                  </td>
                  <td className="p-4"><LabelTags labels={p.labels} /></td>
                  <td className="p-4 font-mono text-sm text-green-400">{p.guaranteed_rate ?? '-'}</td>
                  <td className="p-4 font-mono text-sm text-yellow-400">{p.max_rate ?? '-'}</td>
                  <td className="p-4 font-mono text-sm text-slate-400">{p.burst ?? '-'}</td>
                  <td className="p-4 font-mono text-sm">{p.priority}</td>
                  <td className="p-4 text-blue-400 font-medium">{p.matched_vms}</td>
                  <td className="p-4">
                    <StatusBadge status={p.enabled ? 'active' : 'disabled'} color={p.enabled ? 'green' : 'gray'} />
                  </td>
                  <td className="p-4">
                    <button onClick={() => onDelete(p.id)} className="p-2 hover:bg-red-600 rounded transition">
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

export function CreateQosModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: QoSPolicy) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [guaranteedRate, setGuaranteedRate] = useState('')
  const [maxRate, setMaxRate] = useState('')
  const [burst, setBurst] = useState('')
  const [priority, setPriority] = useState('100')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) { setErr('Name is required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateQoSPolicyRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        labels: Object.keys(labels).length > 0 ? labels : undefined,
        guaranteed_rate: guaranteedRate.trim() || undefined,
        max_rate: maxRate.trim() || undefined,
        burst: burst.trim() || undefined,
        priority: parseInt(priority) || 100,
      }
      const p = await api.createQosPolicy(req)
      onCreated(p)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create QoS Policy" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="high-priority" />
        <InputField label="Description" value={description} onChange={setDescription} placeholder="High priority traffic shaping" />
        <LabelSelectorInput labels={labels} onChange={setLabels} />
        <div className="grid grid-cols-2 gap-2">
          <InputField label="Guaranteed Rate" value={guaranteedRate} onChange={setGuaranteedRate} placeholder="100mbit" />
          <InputField label="Max Rate" value={maxRate} onChange={setMaxRate} placeholder="1gbit" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <InputField label="Burst" value={burst} onChange={setBurst} placeholder="32kbit" />
          <InputField label="Priority" value={priority} onChange={setPriority} placeholder="100" type="number" />
        </div>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create QoS Policy'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export default QosTabContent
