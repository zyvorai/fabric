// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { Plus } from 'lucide-react'
import * as api from '../../api/networkd'
import type { SriovConfig, CreateSriovRequest } from '../../api/networkd'
import { ModalWrapper, InputField, extractErrorMessage } from './ModalShared'

interface SriovTabProps {
  sriov: SriovConfig[]
  onDelete: (id: string) => void
  onCreate: () => void
}

function SriovTabContent({ sriov, onDelete, onCreate }: SriovTabProps) {
  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <h2 className="text-xl font-semibold">SR-IOV</h2>
        <button onClick={onCreate} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white py-2 px-4 rounded-lg transition text-sm">
          <Plus className="w-4 h-4" /> Configure SR-IOV
        </button>
      </div>
      {sriov.length === 0 ? (
        <div className="p-12 text-center text-slate-400">No SR-IOV configurations.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-left p-4 font-medium text-slate-300">PF Name</th>
                <th className="text-left p-4 font-medium text-slate-300">VFs</th>
                <th className="text-left p-4 font-medium text-slate-300">VF Configs</th>
                <th className="text-left p-4 font-medium text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {sriov.map(s => (
                <tr key={s.id} className="hover:bg-white/[0.03] transition">
                  <td className="p-4 font-medium">{s.pf_name}</td>
                  <td className="p-4 font-mono text-violet-400">{s.num_vfs}</td>
                  <td className="p-4 text-slate-400 text-sm">{s.vf_configs?.length ?? 0} entries</td>
                  <td className="p-4">
                    <button
                      onClick={() => onDelete(s.id)}
                      className="p-2 hover:bg-red-600 rounded transition text-slate-400 hover:text-white text-sm"
                    >
                      Delete
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

export function CreateSriovModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: SriovConfig) => void }) {
  const [pfName, setPfName] = useState('')
  const [numVfs, setNumVfs] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!pfName.trim() || !numVfs) { setErr('PF name and number of VFs are required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateSriovRequest = {
        pf_name: pfName.trim(),
        num_vfs: parseInt(numVfs, 10),
        vf_configs: [],
      }
      const cfg = await api.createSriov(req)
      onCreated(cfg)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Configure SR-IOV" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Physical Function (PF)" value={pfName} onChange={setPfName} placeholder="eno2" />
        <InputField label="Number of VFs" value={numVfs} onChange={setNumVfs} placeholder="4" type="number" />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Configure SR-IOV'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export default SriovTabContent
