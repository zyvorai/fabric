// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { Plus } from 'lucide-react'
import type { FloatingIp } from '../../api/network-cloud'
import { HostBadge, HostManagedActions, isHostManaged } from './ModalShared'

interface FloatingIpsTabProps {
  floatingIps: FloatingIp[]
  onDelete: (id: string) => void
  onAdopt?: (id: string) => void
}

function FloatingIpsTabContent({ floatingIps, onDelete, onAdopt }: FloatingIpsTabProps) {
  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Floating IPs</h2>
      </div>
      {floatingIps.length === 0 ? (
        <div className="p-12 text-center text-slate-400">No floating IPs configured. Host secondary addresses appear here when discovered.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-left p-4 font-medium text-slate-300">Address</th>
                <th className="text-left p-4 font-medium text-slate-300">Interface</th>
                <th className="text-left p-4 font-medium text-slate-300">Assigned VM</th>
                <th className="text-left p-4 font-medium text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {floatingIps.map(f => (
                <tr key={f.id} className="hover:bg-white/[0.03] transition">
                  <td className="p-4 font-mono text-cyan-400">
                    {f.address}
                    {isHostManaged(f) && <HostBadge />}
                  </td>
                  <td className="p-4 font-mono text-sm text-slate-400">{f.interface}</td>
                  <td className="p-4 text-slate-400">{f.assigned_vm ?? '—'}</td>
                  <td className="p-4">
                    <HostManagedActions
                      item={f}
                      onDelete={() => onDelete(f.id)}
                      onAdopt={onAdopt ? () => onAdopt(f.id) : undefined}
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

export default FloatingIpsTabContent
