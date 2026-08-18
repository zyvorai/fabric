// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import * as api from '../../api/network-security'
import type { FirewallProfile, CreateFirewallProfileRequest, FirewallRule, FirewallAction, FirewallZone, VMFirewallAssignment } from '../../api/network-security'
import { ModalWrapper, InputField, HostBadge, HostManagedActions, isHostManaged, extractErrorMessage } from '../network/ModalShared'
import { StatusBadge } from './ModalShared'
import { useReadOnly } from '../../contexts/ReadOnlyContext'

interface FirewallTabProps {
  profiles: FirewallProfile[]
  zones: FirewallZone[]
  assignments: VMFirewallAssignment[]
  onDeleteProfile: (id: string) => void
  onDeleteZone: (id: string) => void
  onDeleteAssignment: (vmName: string) => void
  onAdoptProfile?: (id: string) => void
  onAdoptZone?: (id: string) => void
  onCreate: () => void
  onSync: () => void
}

function FirewallTabContent({ profiles, zones, assignments, onDeleteProfile, onDeleteZone, onDeleteAssignment, onAdoptProfile, onAdoptZone, onCreate, onSync }: FirewallTabProps) {
  const readOnly = useReadOnly()
  const [view, setView] = useState<'profiles' | 'zones' | 'assignments'>('profiles')
  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">VM Firewall</h2>
          <div className="flex bg-slate-800 rounded-lg p-0.5">
            {(['profiles', 'zones', 'assignments'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1 rounded text-sm transition ${view === v ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {!readOnly && <button onClick={onSync} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition text-sm">
            <RefreshCw className="w-4 h-4" /> Sync
          </button>}
          {!readOnly && <button onClick={onCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition text-sm">
            <Plus className="w-4 h-4" /> Add Profile
          </button>}
        </div>
      </div>

      {view === 'profiles' && (
        profiles.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No firewall profiles. Create one to define firewall rules for VMs.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">Name</th>
                  <th className="text-left p-4 font-medium text-slate-300">Default Action</th>
                  <th className="text-left p-4 font-medium text-slate-300">Rules</th>
                  <th className="text-left p-4 font-medium text-slate-300">Status</th>
                  <th className="text-left p-4 font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {profiles.map(p => (
                  <tr key={p.id} className="hover:bg-white/[0.03] transition">
                    <td className="p-4">
                      <div className="font-medium">{p.name}{isHostManaged(p) && <HostBadge />}</div>
                      {p.description && <div className="text-xs text-slate-500 mt-1 max-w-md truncate">{p.description}</div>}
                    </td>
                    <td className="p-4">
                      <StatusBadge status={p.default_action} color={p.default_action === 'accept' ? 'green' : 'red'} />
                    </td>
                    <td className="p-4 font-mono text-sm">{p.rules.length}</td>
                    <td className="p-4 text-xs text-slate-500">
                      {isHostManaged(p) ? 'host nft' : 'managed'}
                    </td>
                    <td className="p-4">
                      <HostManagedActions readOnly={readOnly}
                        item={{ id: p.id, managed: p.managed }}
                        onDelete={() => onDeleteProfile(p.id)}
                        onAdopt={onAdoptProfile ? () => onAdoptProfile(p.id) : undefined}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {view === 'zones' && (
        zones.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No firewall zones configured.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">Name</th>
                  <th className="text-left p-4 font-medium text-slate-300">Profile ID</th>
                  <th className="text-left p-4 font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {zones.map(z => (
                  <tr key={z.id} className="hover:bg-white/[0.03] transition">
                    <td className="p-4 font-medium">
                      {z.name}{isHostManaged(z) && <HostBadge />}
                      {z.description && <div className="text-xs text-slate-500 mt-1 max-w-md truncate">{z.description}</div>}
                    </td>
                    <td className="p-4 font-mono text-sm text-slate-400">{z.default_profile_id ?? '-'}</td>
                    <td className="p-4">
                      <HostManagedActions readOnly={readOnly}
                        item={{ id: z.id, managed: z.managed }}
                        onDelete={() => onDeleteZone(z.id)}
                        onAdopt={onAdoptZone ? () => onAdoptZone(z.id) : undefined}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {view === 'assignments' && (
        assignments.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No VM firewall assignments.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">VM Name</th>
                  <th className="text-left p-4 font-medium text-slate-300">Profile ID</th>
                  <th className="text-left p-4 font-medium text-slate-300">Zone ID</th>
                  <th className="text-left p-4 font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {assignments.map(a => (
                  <tr key={a.vm_name} className="hover:bg-white/[0.03] transition">
                    <td className="p-4 font-medium">{a.vm_name}</td>
                    <td className="p-4 font-mono text-sm text-slate-400">{a.profile_id}</td>
                    <td className="p-4 font-mono text-sm text-slate-400">{a.zone_id ?? '-'}</td>
                    <td className="p-4">
                      {!readOnly && (
                      <button onClick={() => onDeleteAssignment(a.vm_name)} className="p-2 hover:bg-red-600 rounded transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

export function CreateFirewallProfileModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: FirewallProfile) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [defaultAction, setDefaultAction] = useState<FirewallAction>('drop')
  const [rules, setRules] = useState<FirewallRule[]>([])
  const [ruleProto, setRuleProto] = useState('')
  const [rulePort, setRulePort] = useState('')
  const [ruleSrc, setRuleSrc] = useState('')
  const [ruleDst, setRuleDst] = useState('')
  const [ruleAction, setRuleAction] = useState<FirewallAction>('accept')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const addRule = () => {
    setRules(prev => [...prev, {
      protocol: ruleProto || undefined,
      port: rulePort ? parseInt(rulePort) : undefined,
      source_cidr: ruleSrc || undefined,
      dest_cidr: ruleDst || undefined,
      action: ruleAction,
    }])
    setRuleProto('')
    setRulePort('')
    setRuleSrc('')
    setRuleDst('')
  }

  const handleSubmit = async () => {
    if (!name.trim()) { setErr('Name is required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateFirewallProfileRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        default_action: defaultAction,
        rules,
      }
      const p = await api.createFirewallProfile(req)
      onCreated(p)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create Firewall Profile" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="web-profile" />
        <InputField label="Description" value={description} onChange={setDescription} placeholder="Allow web traffic" />
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Default Action</label>
          <select value={defaultAction} onChange={e => setDefaultAction(e.target.value as FirewallAction)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
            <option value="accept">Accept</option>
            <option value="drop">Drop</option>
            <option value="reject">Reject</option>
            <option value="log">Log</option>
          </select>
        </div>
        <div className="border border-slate-700/50 rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium text-slate-300">Add Rule</div>
          <div className="grid grid-cols-2 gap-2">
            <InputField label="Protocol" value={ruleProto} onChange={setRuleProto} placeholder="tcp" />
            <InputField label="Port" value={rulePort} onChange={setRulePort} placeholder="80" type="number" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InputField label="Source CIDR" value={ruleSrc} onChange={setRuleSrc} placeholder="0.0.0.0/0" />
            <InputField label="Dest CIDR" value={ruleDst} onChange={setRuleDst} placeholder="10.0.0.0/8" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Action</label>
            <select value={ruleAction} onChange={e => setRuleAction(e.target.value as FirewallAction)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
              <option value="accept">Accept</option>
              <option value="drop">Drop</option>
              <option value="reject">Reject</option>
              <option value="log">Log</option>
            </select>
          </div>
          <button type="button" onClick={addRule} className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition">
            <Plus className="w-3.5 h-3.5" /> Add Rule
          </button>
          {rules.length > 0 && (
            <div className="space-y-1 mt-2">
              {rules.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-slate-800 rounded px-2 py-1">
                  <StatusBadge status={r.action} color={r.action === 'accept' ? 'green' : 'red'} />
                  {r.protocol && <span className="text-slate-400">{r.protocol}</span>}
                  {r.port && <span className="text-slate-400">:{r.port}</span>}
                  {r.source_cidr && <span className="text-slate-400">src:{r.source_cidr}</span>}
                  {r.dest_cidr && <span className="text-slate-400">dst:{r.dest_cidr}</span>}
                  <button onClick={() => setRules(prev => prev.filter((_, j) => j !== i))} className="ml-auto text-red-400 hover:text-red-300">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create Profile'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export default FirewallTabContent
