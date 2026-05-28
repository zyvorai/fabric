// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { Plus, Trash2, RefreshCw, Check } from 'lucide-react'
import * as api from '../../api/network-security'
import type {
  MonitorPolicy, CreateMonitorPolicyRequest, MonitorThreshold,
  NetworkMetrics, BandwidthAlert, AlertSeverity, MetricDirection,
} from '../../api/network-security'
import { ModalWrapper, InputField, HostBadge, HostManagedActions, isHostManaged, extractErrorMessage } from '../network/ModalShared'
import { LabelSelectorInput, LabelTags, StatusBadge } from './ModalShared'

interface MonitorTabProps {
  policies: MonitorPolicy[]
  metrics: NetworkMetrics[]
  alerts: BandwidthAlert[]
  onDelete: (id: string) => void
  onAdopt?: (id: string) => void
  onAcknowledge: (id: string) => void
  onCreate: () => void
  onSync: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(1)} GB`
}

function MonitorTabContent({ policies, metrics, alerts, onDelete, onAdopt, onAcknowledge, onCreate, onSync }: MonitorTabProps) {
  const [view, setView] = useState<'policies' | 'metrics' | 'alerts'>('policies')
  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">Network Monitor</h2>
          <div className="flex bg-slate-800 rounded-lg p-0.5">
            {(['policies', 'metrics', 'alerts'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1 rounded text-sm transition ${view === v ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
                {v === 'alerts' && alerts.filter(a => !a.acknowledged).length > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5">{alerts.filter(a => !a.acknowledged).length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onSync} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition text-sm">
            <RefreshCw className="w-4 h-4" /> Sync
          </button>
          <button onClick={onCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition text-sm">
            <Plus className="w-4 h-4" /> Add Policy
          </button>
        </div>
      </div>

      {view === 'policies' && (
        policies.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No monitor policies configured. Create one to monitor VM network metrics.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">Name</th>
                  <th className="text-left p-4 font-medium text-slate-300">Labels</th>
                  <th className="text-left p-4 font-medium text-slate-300">Thresholds</th>
                  <th className="text-left p-4 font-medium text-slate-300">Interval</th>
                  <th className="text-left p-4 font-medium text-slate-300">Status</th>
                  <th className="text-left p-4 font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {policies.map(p => (
                  <tr key={p.id} className="hover:bg-white/[0.03] transition">
                    <td className="p-4">
                      <div className="font-medium">{p.name}{isHostManaged(p) && <HostBadge />}</div>
                      {p.description && <div className="text-xs text-slate-500 mt-1">{p.description}</div>}
                    </td>
                    <td className="p-4"><LabelTags labels={p.labels ?? p.selector?.match_labels} /></td>
                    <td className="p-4 font-medium text-cyan-400">{p.thresholds.length}</td>
                    <td className="p-4 font-mono text-sm text-slate-400">{p.sample_interval_secs ?? p.interval_seconds ?? 10}s</td>
                    <td className="p-4">
                      <StatusBadge status={p.enabled ? 'active' : 'disabled'} color={p.enabled ? 'green' : 'gray'} />
                    </td>
                    <td className="p-4">
                      <HostManagedActions
                        item={{ id: p.id, managed: p.managed }}
                        onDelete={() => onDelete(p.id)}
                        onAdopt={onAdopt ? () => onAdopt(p.id) : undefined}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {view === 'metrics' && (
        metrics.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No metrics available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">VM</th>
                  <th className="text-left p-4 font-medium text-slate-300">Interface</th>
                  <th className="text-left p-4 font-medium text-slate-300">RX</th>
                  <th className="text-left p-4 font-medium text-slate-300">TX</th>
                  <th className="text-left p-4 font-medium text-slate-300">RX Pkts</th>
                  <th className="text-left p-4 font-medium text-slate-300">TX Pkts</th>
                  <th className="text-left p-4 font-medium text-slate-300">Errors</th>
                  <th className="text-left p-4 font-medium text-slate-300">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {metrics.map((m, i) => (
                  <tr key={i} className="hover:bg-white/[0.03] transition">
                    <td className="p-4 font-medium">{m.vm_name}</td>
                    <td className="p-4 font-mono text-sm text-blue-400">{m.interface_name}</td>
                    <td className="p-4 font-mono text-sm text-green-400">{formatBytes(m.rx_bytes)}</td>
                    <td className="p-4 font-mono text-sm text-yellow-400">{formatBytes(m.tx_bytes)}</td>
                    <td className="p-4 font-mono text-sm text-slate-400">{m.rx_packets}</td>
                    <td className="p-4 font-mono text-sm text-slate-400">{m.tx_packets}</td>
                    <td className="p-4 font-mono text-sm">
                      {m.rx_errors + m.tx_errors > 0 ? (
                        <span className="text-red-400">{m.rx_errors + m.tx_errors}</span>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                    </td>
                    <td className="p-4 text-xs text-slate-500">{new Date(m.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {view === 'alerts' && (
        alerts.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No bandwidth alerts.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">VM</th>
                  <th className="text-left p-4 font-medium text-slate-300">Metric</th>
                  <th className="text-left p-4 font-medium text-slate-300">Value</th>
                  <th className="text-left p-4 font-medium text-slate-300">Threshold</th>
                  <th className="text-left p-4 font-medium text-slate-300">Severity</th>
                  <th className="text-left p-4 font-medium text-slate-300">Time</th>
                  <th className="text-left p-4 font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {alerts.map(a => (
                  <tr key={a.id} className={`hover:bg-white/[0.03] transition ${a.acknowledged ? 'opacity-50' : ''}`}>
                    <td className="p-4 font-medium">{a.vm_name}</td>
                    <td className="p-4 font-mono text-sm text-slate-400">{a.metric}</td>
                    <td className="p-4 font-mono text-sm text-red-400">{a.value}</td>
                    <td className="p-4 font-mono text-sm text-slate-400">{a.threshold}</td>
                    <td className="p-4">
                      <StatusBadge
                        status={a.severity}
                        color={a.severity === 'critical' ? 'red' : a.severity === 'warning' ? 'yellow' : 'blue'}
                      />
                    </td>
                    <td className="p-4 text-xs text-slate-500">{new Date(a.created).toLocaleString()}</td>
                    <td className="p-4">
                      {!a.acknowledged && (
                        <button onClick={() => onAcknowledge(a.id)} className="p-2 hover:bg-green-600 rounded transition" title="Acknowledge">
                          <Check className="w-4 h-4" />
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

export function CreateMonitorPolicyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: MonitorPolicy) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [interval, setInterval] = useState('60')
  const [thresholds, setThresholds] = useState<MonitorThreshold[]>([])
  const [thMetric, setThMetric] = useState('bandwidth')
  const [thValue, setThValue] = useState('')
  const [thUnit, setThUnit] = useState('mbps')
  const [thDirection, setThDirection] = useState<MetricDirection>('both')
  const [thSeverity, setThSeverity] = useState<AlertSeverity>('warning')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const addThreshold = () => {
    if (!thValue) return
    setThresholds(prev => [...prev, {
      metric: thMetric,
      value: parseFloat(thValue),
      unit: thUnit,
      direction: thDirection,
      severity: thSeverity,
    }])
    setThValue('')
  }

  const handleSubmit = async () => {
    if (!name.trim()) { setErr('Name is required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateMonitorPolicyRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        labels: Object.keys(labels).length > 0 ? labels : undefined,
        thresholds: thresholds.length > 0 ? thresholds : undefined,
        interval_seconds: parseInt(interval) || 60,
      }
      const p = await api.createMonitorPolicy(req)
      onCreated(p)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create Monitor Policy" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="high-bandwidth-alert" />
        <InputField label="Description" value={description} onChange={setDescription} placeholder="Alert on high bandwidth" />
        <LabelSelectorInput labels={labels} onChange={setLabels} />
        <InputField label="Interval (seconds)" value={interval} onChange={setInterval} placeholder="60" type="number" />
        <div className="border border-slate-700/50 rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium text-slate-300">Add Threshold</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Metric</label>
              <select value={thMetric} onChange={e => setThMetric(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="bandwidth">Bandwidth</option>
                <option value="packets">Packets</option>
                <option value="errors">Errors</option>
                <option value="drops">Drops</option>
              </select>
            </div>
            <InputField label="Value" value={thValue} onChange={setThValue} placeholder="100" type="number" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Unit</label>
              <select value={thUnit} onChange={e => setThUnit(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="mbps">Mbps</option>
                <option value="gbps">Gbps</option>
                <option value="kpps">Kpps</option>
                <option value="count">Count</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Direction</label>
              <select value={thDirection} onChange={e => setThDirection(e.target.value as MetricDirection)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="both">Both</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Severity</label>
              <select value={thSeverity} onChange={e => setThSeverity(e.target.value as AlertSeverity)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <button type="button" onClick={addThreshold} className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition">
            <Plus className="w-3 h-3" /> Add Threshold
          </button>
          {thresholds.length > 0 && (
            <div className="space-y-1 mt-2">
              {thresholds.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-slate-800 rounded px-2 py-1">
                  <StatusBadge status={t.severity} color={t.severity === 'critical' ? 'red' : t.severity === 'warning' ? 'yellow' : 'blue'} />
                  <span className="text-slate-300">{t.metric}</span>
                  <span className="text-slate-400">{t.value} {t.unit}</span>
                  <span className="text-slate-500">{t.direction}</span>
                  <button onClick={() => setThresholds(prev => prev.filter((_, j) => j !== i))} className="ml-auto text-red-400 hover:text-red-300">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create Monitor Policy'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export default MonitorTabContent
