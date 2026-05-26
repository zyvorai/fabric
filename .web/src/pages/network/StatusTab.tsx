// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { RefreshCw } from 'lucide-react'
import type { LinkInfo } from '../../api/networkd'

interface StatusTabProps {
  links: LinkInfo[]
  onRefresh: () => void
}

function StatusTabContent({ links, onRefresh }: StatusTabProps) {
  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <h2 className="text-xl font-semibold">networkctl link status</h2>
        <button onClick={onRefresh} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-600 text-white py-2 px-3 rounded-lg transition text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>
      {links.length === 0 ? (
        <div className="p-12 text-center text-slate-400">No link data available. networkctl may not be accessible.</div>
      ) : (
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
              {links.map(l => (
                <tr key={l.index} className="hover:bg-white/[0.03] transition">
                  <td className="p-4 font-mono text-sm">{l.index}</td>
                  <td className="p-4 font-medium">{l.name}</td>
                  <td className="p-4 text-slate-400">{l.kind}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      l.operational_state === 'routable' ? 'bg-green-500/10 text-green-400' :
                      l.operational_state === 'carrier' ? 'bg-blue-500/10 text-blue-400' :
                      l.operational_state === 'degraded' ? 'bg-yellow-500/10 text-yellow-400' :
                      'bg-slate-500/10 text-slate-400'
                    }`}>{l.operational_state}</span>
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
        </div>
      )}
    </div>
  )
}

export default StatusTabContent
