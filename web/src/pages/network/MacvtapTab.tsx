// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import * as api from '../../api/networkd'
import type { MacvtapConfig, CreateMacvtapRequest, MacvtapMode } from '../../api/networkd'
import { ModalWrapper, InputField, HostBadge, HostManagedActions, isHostManaged, extractErrorMessage } from './ModalShared'
import { ListControls, DEFAULT_PAGE_SIZE, paginateSlice } from './ListControls'

interface MacvtapTabProps {
  macvtaps: MacvtapConfig[]
  onDelete: (id: string) => void
  onAdopt: (id: string) => void
  onCreate: () => void
}

function MacvtapTabContent({ macvtaps, onDelete, onAdopt, onCreate }: MacvtapTabProps) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showAll, setShowAll] = useState(false)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = [...macvtaps].sort((a, b) => a.name.localeCompare(b.name))
    if (!q) return list
    return list.filter(m => [m.name, m.parent_interface, m.mode, m.mac_address ?? ''].join(' ').toLowerCase().includes(q))
  }, [macvtaps, search])
  const pageItems = paginateSlice(filtered, page, DEFAULT_PAGE_SIZE, showAll)

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Macvtap Devices</h2>
        <button onClick={onCreate} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg transition text-sm">
          <Plus className="w-4 h-4" /> Create Macvtap
        </button>
      </div>
      {macvtaps.length === 0 ? (
        <div className="p-12 text-center text-slate-400">No macvtap devices configured.</div>
      ) : (
        <>
          <ListControls search={search} onSearchChange={setSearch} searchPlaceholder="Search name, parent, mode…" total={macvtaps.length} filtered={filtered.length} page={page} pageSize={DEFAULT_PAGE_SIZE} onPageChange={setPage} showAll={showAll} onShowAllChange={setShowAll} />
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-left p-4 font-medium text-slate-300">Name</th>
                <th className="text-left p-4 font-medium text-slate-300">Parent</th>
                <th className="text-left p-4 font-medium text-slate-300">Mode</th>
                <th className="text-left p-4 font-medium text-slate-300">MAC Address</th>
                <th className="text-left p-4 font-medium text-slate-300">MTU</th>
                <th className="text-left p-4 font-medium text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {pageItems.map(m => (
                <tr key={m.id} className="hover:bg-white/[0.03] transition">
                  <td className="p-4 font-medium">{m.name}{isHostManaged(m) && <HostBadge />}</td>
                  <td className="p-4 text-slate-400">{m.parent_interface}</td>
                  <td className="p-4">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">{m.mode}</span>
                  </td>
                  <td className="p-4 text-slate-400 font-mono text-sm">{m.mac_address ?? '-'}</td>
                  <td className="p-4 text-slate-400">{m.mtu ?? '-'}</td>
                  <td className="p-4">
                    <HostManagedActions item={m} onDelete={() => onDelete(m.id)} onAdopt={() => onAdopt(m.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="p-8 text-center text-slate-500 text-sm">No macvtap devices match your search.</div>}
          </div>
        </>
      )}
    </div>
  )
}

export function CreateMacvtapModal({ onClose, onCreated }: { onClose: () => void; onCreated: (m: MacvtapConfig) => void }) {
  const [name, setName] = useState('')
  const [parent, setParent] = useState('')
  const [mode, setMode] = useState<MacvtapMode>('bridge')
  const [mtu, setMtu] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim() || !parent.trim()) { setErr('Name and parent interface are required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateMacvtapRequest = {
        name: name.trim(),
        parent_interface: parent.trim(),
        mode,
        mtu: mtu ? parseInt(mtu) : undefined,
      }
      const mvt = await api.createMacvtap(req)
      onCreated(mvt)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create Macvtap" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="macvtap0" />
        <InputField label="Parent Interface" value={parent} onChange={setParent} placeholder="eth0" />
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Mode</label>
          <select value={mode} onChange={e => setMode(e.target.value as MacvtapMode)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
            <option value="bridge">bridge</option>
            <option value="vepa">vepa</option>
            <option value="private">private</option>
            <option value="passthru">passthru</option>
            <option value="source">source</option>
          </select>
        </div>
        <InputField label="MTU" value={mtu} onChange={setMtu} placeholder="1500" type="number" />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create Macvtap'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export default MacvtapTabContent
