// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { Plus } from 'lucide-react'
import * as api from '../../api/networkd'
import type { TapConfig, CreateTapRequest } from '../../api/networkd'
import { ModalWrapper, InputField, CheckboxField, HostBadge, HostManagedActions, isHostManaged, extractErrorMessage } from './ModalShared'

interface TapsTabProps {
  taps: TapConfig[]
  onDelete: (id: string) => void
  onCreate: () => void
}

function TapsTabContent({ taps, onDelete, onCreate }: TapsTabProps) {
  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Tap Devices</h2>
        <button onClick={onCreate} className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded-lg transition text-sm">
          <Plus className="w-4 h-4" /> Create Tap
        </button>
      </div>
      {taps.length === 0 ? (
        <div className="p-12 text-center text-slate-400">No tap devices configured.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-left p-4 font-medium text-slate-300">Name</th>
                <th className="text-left p-4 font-medium text-slate-300">Bridge</th>
                <th className="text-left p-4 font-medium text-slate-300">User</th>
                <th className="text-left p-4 font-medium text-slate-300">MultiQueue</th>
                <th className="text-left p-4 font-medium text-slate-300">VNet Header</th>
                <th className="text-left p-4 font-medium text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {taps.map(t => (
                <tr key={t.id} className="hover:bg-white/[0.03] transition">
                  <td className="p-4 font-medium">{t.name}{isHostManaged(t) && <HostBadge />}</td>
                  <td className="p-4 text-slate-400">{t.bridge ?? '-'}</td>
                  <td className="p-4 text-slate-400">{t.user ?? '-'}</td>
                  <td className="p-4">{t.multi_queue ? <span className="text-green-400">yes</span> : <span className="text-slate-500">no</span>}</td>
                  <td className="p-4">{t.vnet_hdr ? <span className="text-green-400">yes</span> : <span className="text-slate-500">no</span>}</td>
                  <td className="p-4">
                    <HostManagedActions item={t} onDelete={() => onDelete(t.id)} />
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

export function CreateTapModal({ onClose, onCreated }: { onClose: () => void; onCreated: (t: TapConfig) => void }) {
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
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
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

export default TapsTabContent
