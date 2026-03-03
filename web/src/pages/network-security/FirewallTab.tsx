import { useState } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import * as api from '../../api/network-security'
import type { FirewallProfile, CreateFirewallProfileRequest, FirewallRule, FirewallAction, FirewallZone, VMFirewallAssignment } from '../../api/network-security'
import { ModalWrapper, InputField, extractErrorMessage } from '../network/ModalShared'
import { StatusBadge } from './ModalShared'

interface FirewallTabProps {
  profiles: FirewallProfile[]
  zones: FirewallZone[]
  assignments: VMFirewallAssignment[]
  onDeleteProfile: (id: string) => void
  onDeleteZone: (id: string) => void
  onDeleteAssignment: (id: string) => void
  onCreate: () => void
  onSync: () => void
}

function FirewallTabContent({ profiles, zones, assignments, onDeleteProfile, onDeleteZone, onDeleteAssignment, onCreate, onSync }: FirewallTabProps) {
  const [view, setView] = useState<'profiles' | 'zones' | 'assignments'>('profiles')
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <div className="p-6 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">VM Firewall</h2>
          <div className="flex bg-gray-700 rounded-lg p-0.5">
            {(['profiles', 'zones', 'assignments'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1 rounded text-sm transition ${view === v ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onSync} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition text-sm">
            <RefreshCw className="w-4 h-4" /> Sync
          </button>
          <button onClick={onCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition text-sm">
            <Plus className="w-4 h-4" /> Add Profile
          </button>
        </div>
      </div>

      {view === 'profiles' && (
        profiles.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No firewall profiles. Create one to define firewall rules for VMs.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="text-left p-4 font-medium text-gray-300">Name</th>
                  <th className="text-left p-4 font-medium text-gray-300">Default Action</th>
                  <th className="text-left p-4 font-medium text-gray-300">Rules</th>
                  <th className="text-left p-4 font-medium text-gray-300">Status</th>
                  <th className="text-left p-4 font-medium text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {profiles.map(p => (
                  <tr key={p.id} className="hover:bg-gray-700 transition">
                    <td className="p-4">
                      <div className="font-medium">{p.name}</div>
                      {p.description && <div className="text-xs text-gray-500 mt-1">{p.description}</div>}
                    </td>
                    <td className="p-4">
                      <StatusBadge status={p.default_action} color={p.default_action === 'accept' ? 'green' : 'red'} />
                    </td>
                    <td className="p-4 font-mono text-sm">{p.rules.length}</td>
                    <td className="p-4">
                      <StatusBadge status={p.enabled ? 'active' : 'disabled'} color={p.enabled ? 'green' : 'gray'} />
                    </td>
                    <td className="p-4">
                      <button onClick={() => onDeleteProfile(p.id)} className="p-2 hover:bg-red-600 rounded transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
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
          <div className="p-12 text-center text-gray-400">No firewall zones configured.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="text-left p-4 font-medium text-gray-300">Name</th>
                  <th className="text-left p-4 font-medium text-gray-300">Profile ID</th>
                  <th className="text-left p-4 font-medium text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {zones.map(z => (
                  <tr key={z.id} className="hover:bg-gray-700 transition">
                    <td className="p-4 font-medium">{z.name}</td>
                    <td className="p-4 font-mono text-sm text-gray-400">{z.profile_id}</td>
                    <td className="p-4">
                      <button onClick={() => onDeleteZone(z.id)} className="p-2 hover:bg-red-600 rounded transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
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
          <div className="p-12 text-center text-gray-400">No VM firewall assignments.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="text-left p-4 font-medium text-gray-300">VM Name</th>
                  <th className="text-left p-4 font-medium text-gray-300">Profile ID</th>
                  <th className="text-left p-4 font-medium text-gray-300">Zone ID</th>
                  <th className="text-left p-4 font-medium text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {assignments.map(a => (
                  <tr key={a.id} className="hover:bg-gray-700 transition">
                    <td className="p-4 font-medium">{a.vm_name}</td>
                    <td className="p-4 font-mono text-sm text-gray-400">{a.profile_id}</td>
                    <td className="p-4 font-mono text-sm text-gray-400">{a.zone_id ?? '-'}</td>
                    <td className="p-4">
                      <button onClick={() => onDeleteAssignment(a.id)} className="p-2 hover:bg-red-600 rounded transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
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
          <label className="block text-sm font-medium text-gray-300 mb-1">Default Action</label>
          <select value={defaultAction} onChange={e => setDefaultAction(e.target.value as FirewallAction)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
            <option value="accept">Accept</option>
            <option value="drop">Drop</option>
            <option value="reject">Reject</option>
            <option value="log">Log</option>
          </select>
        </div>
        <div className="border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium text-gray-300">Add Rule</div>
          <div className="grid grid-cols-2 gap-2">
            <InputField label="Protocol" value={ruleProto} onChange={setRuleProto} placeholder="tcp" />
            <InputField label="Port" value={rulePort} onChange={setRulePort} placeholder="80" type="number" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InputField label="Source CIDR" value={ruleSrc} onChange={setRuleSrc} placeholder="0.0.0.0/0" />
            <InputField label="Dest CIDR" value={ruleDst} onChange={setRuleDst} placeholder="10.0.0.0/8" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Action</label>
            <select value={ruleAction} onChange={e => setRuleAction(e.target.value as FirewallAction)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
              <option value="accept">Accept</option>
              <option value="drop">Drop</option>
              <option value="reject">Reject</option>
              <option value="log">Log</option>
            </select>
          </div>
          <button type="button" onClick={addRule} className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition">
            <Plus className="w-3 h-3" /> Add Rule
          </button>
          {rules.length > 0 && (
            <div className="space-y-1 mt-2">
              {rules.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-gray-700 rounded px-2 py-1">
                  <StatusBadge status={r.action} color={r.action === 'accept' ? 'green' : 'red'} />
                  {r.protocol && <span className="text-gray-400">{r.protocol}</span>}
                  {r.port && <span className="text-gray-400">:{r.port}</span>}
                  {r.source_cidr && <span className="text-gray-400">src:{r.source_cidr}</span>}
                  {r.dest_cidr && <span className="text-gray-400">dst:{r.dest_cidr}</span>}
                  <button onClick={() => setRules(prev => prev.filter((_, j) => j !== i))} className="ml-auto text-red-400 hover:text-red-300">
                    <Trash2 className="w-3 h-3" />
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
