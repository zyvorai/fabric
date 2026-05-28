// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { LinkInfo } from '../../api/networkd'
import { ListControls, DEFAULT_PAGE_SIZE, paginateSlice } from './ListControls'

interface StatusTabProps {
  links: LinkInfo[]
  onRefresh: () => void
}

function operStateClasses(state: string): string {
  const s = state.toLowerCase()
  if (s === 'routable' || s === 'up') return 'bg-green-500/10 text-green-400'
  if (s === 'carrier' || s === 'unknown') return 'bg-blue-500/10 text-blue-400'
  if (s === 'degraded' || s === 'dormant') return 'bg-yellow-500/10 text-yellow-400'
  if (s === 'down' || s === 'lowerlayerdown' || s === 'no-carrier') return 'bg-slate-500/10 text-slate-400'
  return 'bg-slate-500/10 text-slate-400'
}

function StatusTabContent({ links, onRefresh }: StatusTabProps) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showAll, setShowAll] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = [...links].sort((a, b) => a.name.localeCompare(b.name))
    if (!q) return list
    return list.filter(l => {
      const hay = [l.name, l.kind, l.operational_state, l.setup_state].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [links, search])

  const pageItems = paginateSlice(filtered, page, DEFAULT_PAGE_SIZE, showAll)

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Link status</h2>
          <p className="text-sm text-slate-500 mt-1">From networkctl or ip link on the host</p>
        </div>
        <button onClick={onRefresh} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-600 text-white py-2 px-3 rounded-lg transition text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>
      {links.length === 0 ? (
        <div className="p-12 text-center text-slate-400">No link data available.</div>
      ) : (
        <>
          <ListControls
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search name, type, state…"
            total={links.length}
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
                  <th className="text-left p-4 font-medium text-slate-300">Index</th>
                  <th className="text-left p-4 font-medium text-slate-300">Name</th>
                  <th className="text-left p-4 font-medium text-slate-300">Type</th>
                  <th className="text-left p-4 font-medium text-slate-300">Operational</th>
                  <th className="text-left p-4 font-medium text-slate-300">Setup</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {pageItems.map(l => (
                  <tr key={l.index} className="hover:bg-white/[0.03] transition">
                    <td className="p-4 font-mono text-sm">{l.index}</td>
                    <td className="p-4 font-medium">{l.name}</td>
                    <td className="p-4 text-slate-400">{l.kind}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${operStateClasses(l.operational_state)}`}>
                        {l.operational_state}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        l.setup_state === 'configured' ? 'bg-green-500/10 text-green-400' :
                        l.setup_state === 'configuring' ? 'bg-yellow-500/10 text-yellow-400' :
                        'bg-slate-500/10 text-slate-400'
                      }`}>{l.setup_state || '-'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">No links match your search.</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default StatusTabContent
