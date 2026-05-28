// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import * as api from '../../api/networkd'
import type { VlanConfig, CreateVlanRequest } from '../../api/networkd'
import { ModalWrapper, InputField, HostBadge, HostManagedActions, isHostManaged, extractErrorMessage } from './ModalShared'
import { ListControls, DEFAULT_PAGE_SIZE, paginateSlice } from './ListControls'
import { useReadOnly } from '../../contexts/ReadOnlyContext'

interface VlansTabProps {
  vlans: VlanConfig[]
  onDelete: (id: string) => void
  onAdopt: (id: string) => void
  onCreate: () => void
}

function VlansTabContent({ vlans, onDelete, onAdopt, onCreate }: VlansTabProps) {
  const readOnly = useReadOnly()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showAll, setShowAll] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = [...vlans].sort((a, b) => a.name.localeCompare(b.name))
    if (!q) return list
    return list.filter(v => {
      const hay = [v.name, String(v.vlan_id), v.parent_interface, v.addresses.join(' ')].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [vlans, search])

  const pageItems = paginateSlice(filtered, page, DEFAULT_PAGE_SIZE, showAll)

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <h2 className="text-xl font-semibold">VLANs</h2>
        {!readOnly && <button onClick={onCreate} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg transition text-sm">
          <Plus className="w-4 h-4" /> Create VLAN
        </button>}
      </div>
      {vlans.length === 0 ? (
        <div className="p-12 text-center text-slate-400">No VLANs configured.</div>
      ) : (
        <>
          <ListControls
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search name, VLAN ID, parent…"
            total={vlans.length}
            filtered={filtered.length}
            page={page}
            pageSize={DEFAULT_PAGE_SIZE}
            onPageChange={setPage}
            showAll={showAll}
            onShowAllChange={setShowAll}
          />
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-left p-4 font-medium text-slate-300">Name</th>
                <th className="text-left p-4 font-medium text-slate-300">VLAN ID</th>
                <th className="text-left p-4 font-medium text-slate-300">Parent</th>
                <th className="text-left p-4 font-medium text-slate-300">Addresses</th>
                <th className="text-left p-4 font-medium text-slate-300">DHCP</th>
                <th className="text-left p-4 font-medium text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {pageItems.map(v => (
                <tr key={v.id} className="hover:bg-white/[0.03] transition">
                  <td className="p-4 font-medium">{v.name}{isHostManaged(v) && <HostBadge />}</td>
                  <td className="p-4 font-mono text-purple-400">{v.vlan_id}</td>
                  <td className="p-4 text-slate-400">{v.parent_interface}</td>
                  <td className="p-4 text-slate-400 font-mono text-sm">{v.addresses.join(', ') || '-'}</td>
                  <td className="p-4 text-slate-400">{v.dhcp}</td>
                  <td className="p-4">
                    <HostManagedActions readOnly={readOnly} item={v} onDelete={() => onDelete(v.id)} onAdopt={() => onAdopt(v.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-sm">No VLANs match your search.</div>
          )}
          </div>
        </>
      )}
    </div>
  )
}

export function CreateVlanModal({ onClose, onCreated }: { onClose: () => void; onCreated: (v: VlanConfig) => void }) {
  const [name, setName] = useState('')
  const [vlanId, setVlanId] = useState('')
  const [parent, setParent] = useState('')
  const [addresses, setAddresses] = useState('')
  const [gateway, setGateway] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim() || !vlanId || !parent.trim()) { setErr('Name, VLAN ID, and parent interface are required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateVlanRequest = {
        name: name.trim(),
        vlan_id: parseInt(vlanId),
        parent_interface: parent.trim(),
        addresses: addresses ? addresses.split(',').map(s => s.trim()).filter(Boolean) : [],
        gateway: gateway.trim() || undefined,
      }
      const vlan = await api.createVlan(req)
      onCreated(vlan)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create VLAN" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="vlan100" />
        <InputField label="VLAN ID" value={vlanId} onChange={setVlanId} placeholder="100" type="number" />
        <InputField label="Parent Interface" value={parent} onChange={setParent} placeholder="eth0" />
        <InputField label="Addresses (comma-separated)" value={addresses} onChange={setAddresses} placeholder="192.168.100.1/24" />
        <InputField label="Gateway" value={gateway} onChange={setGateway} placeholder="192.168.100.254" />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create VLAN'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export default VlansTabContent
