// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import * as api from '../../api/network-security'
import type { NetworkPolicy, CreateNetworkPolicyRequest, PolicyRule, PolicyDirection, PolicyAction, SecurityIdentity } from '../../api/network-security'
import { ModalWrapper, InputField, HostBadge, HostManagedActions, isHostManaged, extractErrorMessage } from '../network/ModalShared'
import { LabelSelectorInput, LabelTags, StatusBadge } from './ModalShared'
import { useReadOnly } from '../../contexts/ReadOnlyContext'

interface PoliciesTabProps {
  policies: NetworkPolicy[]
  identities: SecurityIdentity[]
  onDelete: (id: string) => void
  onAdopt?: (id: string) => void
  onAdoptIdentity?: (id: string) => void
  onCreate: () => void
  onSync: () => void
}

function PoliciesTabContent({ policies, identities, onDelete, onAdopt, onAdoptIdentity, onCreate, onSync }: PoliciesTabProps) {
  const readOnly = useReadOnly()
  const [view, setView] = useState<'policies' | 'identities'>('policies')

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">Network Policies</h2>
          <div className="flex bg-slate-800 rounded-lg p-0.5">
            {(['policies', 'identities'] as const).map(v => (
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
          {view === 'policies' && !readOnly && (
            <button onClick={onCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition text-sm">
              <Plus className="w-4 h-4" /> Add Policy
            </button>
          )}
        </div>
      </div>

      {view === 'policies' && (
      policies.length === 0 ? (
        <div className="p-12 text-center text-slate-400">No network policies configured. Create one to define ingress/egress rules with label selectors.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-left p-4 font-medium text-slate-300">Name</th>
                <th className="text-left p-4 font-medium text-slate-300">Labels</th>
                <th className="text-left p-4 font-medium text-slate-300">Ingress</th>
                <th className="text-left p-4 font-medium text-slate-300">Egress</th>
                <th className="text-left p-4 font-medium text-slate-300">Priority</th>
                <th className="text-left p-4 font-medium text-slate-300">VMs</th>
                <th className="text-left p-4 font-medium text-slate-300">Status</th>
                <th className="text-left p-4 font-medium text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {policies.map(p => {
                const ingressCount = p.ingress_rules?.length ?? p.ingress?.length ?? 0
                const egressCount = p.egress_rules?.length ?? p.egress?.length ?? 0
                const labels = p.labels ?? p.endpoint_selector?.match_labels
                return (
                <tr key={p.id} className="hover:bg-white/[0.03] transition">
                  <td className="p-4">
                    <div className="font-medium">{p.name}{isHostManaged(p) && <HostBadge />}</div>
                    {p.description && <div className="text-xs text-slate-500 mt-1">{p.description}</div>}
                  </td>
                  <td className="p-4"><LabelTags labels={labels} /></td>
                  <td className="p-4">
                    <StatusBadge status={`${ingressCount} rules`} color="green" />
                  </td>
                  <td className="p-4">
                    <StatusBadge status={`${egressCount} rules`} color="yellow" />
                  </td>
                  <td className="p-4 font-mono text-sm">{p.priority ?? '—'}</td>
                  <td className="p-4 text-blue-400 font-medium">{p.matched_vms ?? (isHostManaged(p) ? 'host' : '—')}</td>
                  <td className="p-4">
                    <StatusBadge status={p.enabled ? 'active' : 'disabled'} color={p.enabled ? 'green' : 'gray'} />
                  </td>
                  <td className="p-4">
                    <HostManagedActions readOnly={readOnly}
                      item={{ id: p.id, managed: p.managed }}
                      onDelete={() => onDelete(p.id)}
                      onAdopt={onAdopt ? () => onAdopt(p.id) : undefined}
                    />
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )
      )}

      {view === 'identities' && (
        identities.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No security identities yet. Identities are created from VM labels or discovered from firewalld zones and nftables sets on the host.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">ID</th>
                  <th className="text-left p-4 font-medium text-slate-300">Labels</th>
                  <th className="text-left p-4 font-medium text-slate-300">Endpoints</th>
                  <th className="text-left p-4 font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {identities.map(i => (
                  <tr key={i.id} className="hover:bg-white/[0.03] transition">
                    <td className="p-4 font-mono text-sm">
                      {i.id}
                      {isHostManaged({ managed: i.managed, id: String(i.id) }) && <HostBadge />}
                      {i.description && <div className="text-xs text-slate-500 font-normal mt-0.5 max-w-xs">{i.description}</div>}
                    </td>
                    <td className="p-4"><LabelTags labels={i.labels} /></td>
                    <td className="p-4 font-mono text-xs text-slate-400 max-w-md truncate" title={i.endpoints.join(', ')}>
                      {i.endpoints.length > 0 ? i.endpoints.join(', ') : '—'}
                    </td>
                    <td className="p-4">
                      <HostManagedActions readOnly={readOnly}
                        item={{ id: String(i.id), managed: i.managed }}
                        onDelete={() => {}}
                        onAdopt={onAdoptIdentity ? () => onAdoptIdentity(String(i.id)) : undefined}
                        adoptLabel="Adopt"
                      />
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

export function CreatePolicyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: NetworkPolicy) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [priority, setPriority] = useState('100')
  const [rules, setRules] = useState<PolicyRule[]>([])
  const [ruleDir, setRuleDir] = useState<PolicyDirection>('ingress')
  const [ruleProto, setRuleProto] = useState('')
  const [rulePort, setRulePort] = useState('')
  const [ruleCidr, setRuleCidr] = useState('')
  const [ruleAction, setRuleAction] = useState<PolicyAction>('allow')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const addRule = () => {
    setRules(prev => [...prev, {
      direction: ruleDir,
      protocol: ruleProto || undefined,
      port: rulePort ? parseInt(rulePort) : undefined,
      cidr: ruleCidr || undefined,
      action: ruleAction,
    }])
    setRuleProto('')
    setRulePort('')
    setRuleCidr('')
  }

  const handleSubmit = async () => {
    if (!name.trim()) { setErr('Name is required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateNetworkPolicyRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        labels: Object.keys(labels).length > 0 ? labels : undefined,
        ingress_rules: rules.filter(r => r.direction === 'ingress'),
        egress_rules: rules.filter(r => r.direction === 'egress'),
        priority: parseInt(priority) || 100,
      }
      const p = await api.createNetworkPolicy(req)
      onCreated(p)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create Network Policy" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="allow-web-traffic" />
        <InputField label="Description" value={description} onChange={setDescription} placeholder="Allow HTTP/HTTPS ingress" />
        <LabelSelectorInput labels={labels} onChange={setLabels} />
        <InputField label="Priority" value={priority} onChange={setPriority} placeholder="100" type="number" />
        <div className="border border-slate-700/50 rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium text-slate-300">Add Rule</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Direction</label>
              <select value={ruleDir} onChange={e => setRuleDir(e.target.value as PolicyDirection)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="ingress">Ingress</option>
                <option value="egress">Egress</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Action</label>
              <select value={ruleAction} onChange={e => setRuleAction(e.target.value as PolicyAction)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="allow">Allow</option>
                <option value="deny">Deny</option>
                <option value="log">Log</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <InputField label="Protocol" value={ruleProto} onChange={setRuleProto} placeholder="tcp" />
            <InputField label="Port" value={rulePort} onChange={setRulePort} placeholder="443" type="number" />
            <InputField label="CIDR" value={ruleCidr} onChange={setRuleCidr} placeholder="10.0.0.0/8" />
          </div>
          <button type="button" onClick={addRule} className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition">
            <Plus className="w-3.5 h-3.5" /> Add Rule
          </button>
          {rules.length > 0 && (
            <div className="space-y-1 mt-2">
              {rules.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-slate-800 rounded px-2 py-1">
                  <StatusBadge status={r.direction} color={r.direction === 'ingress' ? 'green' : 'yellow'} />
                  <span>{r.action}</span>
                  {r.protocol && <span className="text-slate-400">{r.protocol}</span>}
                  {r.port && <span className="text-slate-400">:{r.port}</span>}
                  {r.cidr && <span className="text-slate-400">{r.cidr}</span>}
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
          {submitting ? 'Creating...' : 'Create Policy'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export default PoliciesTabContent
