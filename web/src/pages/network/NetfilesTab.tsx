// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import * as api from '../../api/networkd'
import type { NetworkFileConfig, CreateNetworkFileRequest } from '../../api/networkd'
import { ModalWrapper, InputField, HostBadge, HostManagedActions, isHostManaged, extractErrorMessage } from './ModalShared'
import {
  ListControls,
  DEFAULT_PAGE_SIZE,
  netfileTypeOf,
  paginateSlice,
  type NetfileTypeFilter,
} from './ListControls'

interface NetfilesTabProps {
  netfiles: NetworkFileConfig[]
  onDelete: (id: string) => void
  onAdopt: (id: string) => void
  onCreate: () => void
}

export function countNetfileTypes(netfiles: NetworkFileConfig[]) {
  let physical = 0
  let container = 0
  for (const n of netfiles) {
    if (netfileTypeOf(n.description, n.match_name) === 'container') container++
    else physical++
  }
  return { physical, container, total: netfiles.length }
}

function NetfilesTabContent({ netfiles, onDelete, onAdopt, onCreate }: NetfilesTabProps) {
  const readOnly = useReadOnly()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<NetfileTypeFilter>('all')
  const [page, setPage] = useState(1)
  const [showAll, setShowAll] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'state'>('name')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = netfiles.filter(n => {
      if (typeFilter !== 'all' && netfileTypeOf(n.description, n.match_name) !== typeFilter) {
        return false
      }
      if (!q) return true
      const hay = [
        n.match_name,
        n.description ?? '',
        n.addresses.join(' '),
        n.operational_state ?? '',
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
    list = [...list].sort((a, b) => {
      if (sortBy === 'state') {
        return (a.operational_state ?? '').localeCompare(b.operational_state ?? '')
      }
      return a.match_name.localeCompare(b.match_name)
    })
    return list
  }, [netfiles, search, typeFilter, sortBy])

  const pageItems = paginateSlice(filtered, page, DEFAULT_PAGE_SIZE, showAll)

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Interface Configuration (.network)</h2>
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'name' | 'state')}
            className="bg-slate-900 border border-slate-700/50 rounded-lg px-2 py-1.5 text-xs text-slate-300"
          >
            <option value="name">Sort by name</option>
            <option value="state">Sort by state</option>
          </select>
          {!readOnly && <button onClick={onCreate} className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded-lg transition text-sm">
            <Plus className="w-4 h-4" /> Configure Interface
          </button>}
        </div>
      </div>
      {netfiles.length === 0 ? (
        <div className="p-12 text-center text-slate-400">No interface configurations. Configure a physical interface to assign IPs, bridge membership, etc.</div>
      ) : (
        <>
          <ListControls
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search interface, address, description…"
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            showTypeFilters
            total={netfiles.length}
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
                  <th className="text-left p-4 font-medium text-slate-300">Interface</th>
                  <th className="text-left p-4 font-medium text-slate-300">State</th>
                  <th className="text-left p-4 font-medium text-slate-300">Addresses</th>
                  <th className="text-left p-4 font-medium text-slate-300">DHCP</th>
                  <th className="text-left p-4 font-medium text-slate-300">Bridge</th>
                  <th className="text-left p-4 font-medium text-slate-300">Bond</th>
                  <th className="text-left p-4 font-medium text-slate-300">MTU</th>
                  <th className="text-left p-4 font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {pageItems.map(n => (
                  <tr key={n.id} className="hover:bg-white/[0.03] transition">
                    <td className="p-4 font-medium">
                      <span className="flex items-center gap-2 flex-wrap">
                        {n.match_name}
                        {isHostManaged(n) && <HostBadge />}
                      </span>
                      {n.description && <span className="block text-xs text-slate-500 font-normal">{n.description}</span>}
                    </td>
                    <td className="p-4 text-slate-400 text-sm">{n.operational_state ?? '-'}</td>
                    <td className="p-4 text-slate-400 font-mono text-sm">{n.addresses.join(', ') || '-'}</td>
                    <td className="p-4 text-slate-400">{n.dhcp}</td>
                    <td className="p-4 text-slate-400">{n.bridge ?? '-'}</td>
                    <td className="p-4 text-slate-400">{n.bond ?? '-'}</td>
                    <td className="p-4 text-slate-400">{n.mtu ?? '-'}</td>
                    <td className="p-4">
                      <HostManagedActions readOnly={readOnly} item={n} onDelete={() => onDelete(n.id)} onAdopt={() => onAdopt(n.id)} stateLabel={n.operational_state} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">No interfaces match your filters.</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function CreateNetfileModal({ onClose, onCreated }: { onClose: () => void; onCreated: (n: NetworkFileConfig) => void }) {
  const [matchName, setMatchName] = useState('')
  const [addresses, setAddresses] = useState('')
  const [gateway, setGateway] = useState('')
  const [dns, setDns] = useState('')
  const [dhcp, setDhcp] = useState('no')
  const [bridge, setBridge] = useState('')
  const [bond, setBond] = useState('')
  const [mtu, setMtu] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!matchName.trim()) { setErr('Interface name is required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateNetworkFileRequest = {
        match_name: matchName.trim(),
        addresses: addresses ? addresses.split(',').map(s => s.trim()).filter(Boolean) : [],
        gateway: gateway.trim() || undefined,
        dns: dns ? dns.split(',').map(s => s.trim()).filter(Boolean) : [],
        dhcp: (dhcp as CreateNetworkFileRequest['dhcp']) || undefined,
        bridge: bridge.trim() || undefined,
        bond: bond.trim() || undefined,
        mtu: mtu ? parseInt(mtu) : undefined,
      }
      const netfile = await api.createNetworkFile(req)
      onCreated(netfile)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Configure Interface" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Interface Name" value={matchName} onChange={setMatchName} placeholder="enp3s0" />
        <InputField label="Addresses (comma-separated)" value={addresses} onChange={setAddresses} placeholder="192.168.1.10/24" />
        <InputField label="Gateway" value={gateway} onChange={setGateway} placeholder="192.168.1.1" />
        <InputField label="DNS (comma-separated)" value={dns} onChange={setDns} placeholder="8.8.8.8, 1.1.1.1" />
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">DHCP</label>
          <select value={dhcp} onChange={e => setDhcp(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
            <option value="no">no</option>
            <option value="yes">yes</option>
            <option value="ipv4">ipv4</option>
            <option value="ipv6">ipv6</option>
          </select>
        </div>
        <InputField label="Bridge (attach to)" value={bridge} onChange={setBridge} placeholder="br0" />
        <InputField label="Bond (attach to)" value={bond} onChange={setBond} placeholder="bond0" />
        <InputField label="MTU" value={mtu} onChange={setMtu} placeholder="1500" type="number" />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Configure Interface'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export default NetfilesTabContent
