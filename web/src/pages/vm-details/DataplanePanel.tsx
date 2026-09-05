// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  X,
} from 'lucide-react'
import {
  DataplaneStats,
  DataplaneStatus,
  FlowRecord,
  VmNetworkPolicy,
  getDataplaneFlows,
  getDataplaneStats,
  getDataplaneStatus,
  setDataplanePolicy,
} from '../../api/dataplane'
import { useToastContext } from '../../contexts/ToastContext'
import { toastFailure } from '../../utils/toastError'
import { formatUserError } from '../../utils/apiError'
import { usePermissions } from '../../hooks/usePermissions'
import { StatusBadge } from '../../components/ui'

type PanelTab = 'status' | 'policy' | 'stats' | 'flows'

const emptyPolicy = (): VmNetworkPolicy => ({
  default_allow: true,
  allow_cidrs: [],
  allow_ports: [],
  max_egress_mbps: null,
  max_egress_pps: null,
  sample_rate: 0,
})

const PROTO: Record<number, string> = {
  1: 'ICMP',
  6: 'TCP',
  17: 'UDP',
  58: 'ICMPv6',
}

function protoLabel(n: number): string {
  return PROTO[n] ?? String(n)
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MiB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`
}

function formatAge(lastSeenNs: number): string {
  if (!lastSeenNs) return '—'
  const ageMs = Date.now() - lastSeenNs / 1e6
  if (ageMs < 0) return 'just now'
  if (ageMs < 1000) return `${Math.round(ageMs)} ms ago`
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)}s ago`
  if (ageMs < 3600_000) return `${Math.round(ageMs / 60_000)}m ago`
  return `${Math.round(ageMs / 3600_000)}h ago`
}

const inputCls =
  'w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] disabled:opacity-50'
const labelCls = 'block text-xs text-[#6e6e73] mb-1'

export default function DataplanePanel({ vmName }: { vmName: string }) {
  const toast = useToastContext()
  const { canWrite } = usePermissions()
  const [tab, setTab] = useState<PanelTab>('status')
  const [status, setStatus] = useState<DataplaneStatus | null>(null)
  const [stats, setStats] = useState<DataplaneStats | null>(null)
  const [flows, setFlows] = useState<FlowRecord[]>([])
  const [policy, setPolicy] = useState<VmNetworkPolicy>(emptyPolicy())
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [flowLimit, setFlowLimit] = useState(100)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [cidrDraft, setCidrDraft] = useState('')
  const [portDraft, setPortDraft] = useState('')
  const [showJson, setShowJson] = useState(false)
  const [jsonText, setJsonText] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      const [st, stStats, fl] = await Promise.all([
        getDataplaneStatus(vmName),
        getDataplaneStats(vmName).catch(() => null),
        getDataplaneFlows(vmName, flowLimit).catch(() => ({ items: [] as FlowRecord[] })),
      ])
      setStatus(st)
      setStats(stStats)
      setFlows(fl.items)
      if (!dirty) {
        const p = st.policy ?? emptyPolicy()
        setPolicy(p)
        setJsonText(JSON.stringify(p, null, 2))
      }
    } catch (err) {
      setError(formatUserError(err))
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [vmName, flowLimit, dirty])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [vmName]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'flows') void load()
  }, [flowLimit]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => {
      void load()
    }, 5000)
    return () => clearInterval(id)
  }, [autoRefresh, load])

  const updatePolicy = (patch: Partial<VmNetworkPolicy>) => {
    setPolicy((prev) => {
      const next = { ...prev, ...patch }
      setJsonText(JSON.stringify(next, null, 2))
      return next
    })
    setDirty(true)
  }

  const addCidr = () => {
    const v = cidrDraft.trim()
    if (!v) return
    if (policy.allow_cidrs.includes(v)) {
      toast.error('CIDR already listed')
      return
    }
    updatePolicy({ allow_cidrs: [...policy.allow_cidrs, v] })
    setCidrDraft('')
  }

  const removeCidr = (cidr: string) => {
    updatePolicy({ allow_cidrs: policy.allow_cidrs.filter((c) => c !== cidr) })
  }

  const addPort = () => {
    const v = portDraft.trim()
    if (!v) return
    if (policy.allow_ports.includes(v)) {
      toast.error('Port already listed')
      return
    }
    updatePolicy({ allow_ports: [...policy.allow_ports, v] })
    setPortDraft('')
  }

  const removePort = (port: string) => {
    updatePolicy({ allow_ports: policy.allow_ports.filter((p) => p !== port) })
  }

  const applyPreset = (kind: 'open' | 'deny' | 'web') => {
    if (kind === 'open') {
      updatePolicy({
        default_allow: true,
        allow_cidrs: [],
        allow_ports: [],
        max_egress_mbps: null,
        max_egress_pps: null,
        sample_rate: policy.sample_rate,
      })
    } else if (kind === 'deny') {
      updatePolicy({
        default_allow: false,
        allow_cidrs: [],
        allow_ports: [],
        max_egress_mbps: null,
        max_egress_pps: null,
        sample_rate: policy.sample_rate || 1,
      })
    } else {
      updatePolicy({
        default_allow: false,
        allow_cidrs: ['0.0.0.0/0', '::/0'],
        allow_ports: ['80', '443'],
        max_egress_mbps: 100,
        max_egress_pps: 10000,
        sample_rate: Math.max(policy.sample_rate, 1),
      })
    }
  }

  const resetPolicy = () => {
    const p = status?.policy ?? emptyPolicy()
    setPolicy(p)
    setJsonText(JSON.stringify(p, null, 2))
    setDirty(false)
  }

  const savePolicy = async () => {
    let toSave = policy
    if (showJson) {
      try {
        toSave = JSON.parse(jsonText) as VmNetworkPolicy
      } catch {
        toast.error('Policy JSON is invalid')
        return
      }
    }
    setSaving(true)
    try {
      const saved = await setDataplanePolicy(vmName, toSave)
      setPolicy(saved)
      setJsonText(JSON.stringify(saved, null, 2))
      setDirty(false)
      toast.success('Dataplane policy saved')
      await load()
    } catch (err) {
      toastFailure(toast, 'Failed to save dataplane policy', err)
    } finally {
      setSaving(false)
    }
  }

  const tabs: { id: PanelTab; label: string }[] = [
    { id: 'status', label: 'Status' },
    { id: 'policy', label: 'Policy' },
    { id: 'stats', label: 'Stats' },
    { id: 'flows', label: 'Flows' },
  ]

  const dropRate = useMemo(() => {
    if (!stats) return null
    const total = stats.allowed_packets + stats.dropped_packets
    if (total === 0) return '0%'
    return `${((stats.dropped_packets / total) * 100).toFixed(1)}%`
  }, [stats])

  if (loading) {
    return (
      <div className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] p-8 text-center">
        <Loader2 className="w-6 h-6 text-[#6e6e73] mx-auto mb-2 animate-spin" />
        <p className="text-sm text-[#6e6e73]">Loading VM edge dataplane…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] p-6 space-y-3">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm font-medium">VM edge dataplane (FluxVM)</span>
        </div>
        <p className="text-sm text-[#6e6e73]">{error}</p>
        <p className="text-xs text-[#6e6e73]">
          Requires FluxVM with <code className="font-mono">[sandbox.dataplane] mode = &quot;ebpf&quot;</code>.
          Separate from Security → Network Policies (Fabric SDN).
        </p>
        <button type="button" onClick={() => { setLoading(true); void load() }} className="zf-btn zf-btn-ghost zf-btn-sm">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#0071e3]" />
          <div>
            <h3 className="text-sm font-semibold text-[#1d1d1f]">VM edge dataplane (FluxVM)</h3>
            <p className="text-xs text-[#6e6e73]">
              Per-VM TC/eBPF policy, rate limits, stats, and flows — not Fabric SDN network policies.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[#6e6e73]">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[#d2d2d7] bg-white text-[#1d1d1f] hover:bg-[#f5f5f7]"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-[#d2d2d7]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium relative ${
              tab === t.id ? 'text-[#0071e3]' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
            }`}
          >
            {t.label}
            {t.id === 'policy' && dirty && (
              <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
            )}
            {tab === t.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0071e3] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {tab === 'status' && status && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={status.attached ? 'running' : 'stopped'} />
            <span className="text-xs px-2 py-1 rounded-full bg-white border border-[#d2d2d7] text-[#1d1d1f]">
              mode: {status.mode}
            </span>
            {status.policy_synced ? (
              <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                policy synced
              </span>
            ) : (
              <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                policy not synced
              </span>
            )}
            {!status.schema_compatible && (
              <span className="text-xs px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
                schema incompatible
              </span>
            )}
          </div>
          <div className="bg-white rounded-xl border border-[#d2d2d7] p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <Stat label="Attached" value={status.attached ? 'yes' : 'no'} />
            <Stat label="Mode" value={status.mode} />
            <Stat label="Schema version" value={status.schema_version?.toString() ?? '—'} />
            <Stat label="Schema compatible" value={status.schema_compatible ? 'yes' : 'no'} />
            <Stat label="Policy synced" value={status.policy_synced ? 'yes' : 'no'} />
            <Stat label="Required" value={status.required ? 'yes' : 'no'} />
            <Stat label="Interface" value={status.interface ?? '—'} />
            <Stat label="Identity" value={String(status.identity)} />
            <Stat label="Pin dir" value={status.pin_dir ?? '—'} mono />
          </div>
          {!status.attached && status.mode === 'legacy' && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Dataplane is in legacy (nftables) mode. Set FluxVM{' '}
              <code className="font-mono text-xs">[sandbox.dataplane] mode = &quot;ebpf&quot;</code> and
              restart FluxVM to attach the TC program.
            </p>
          )}
          {!status.attached && status.mode !== 'legacy' && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              eBPF mode configured but not attached yet — start a bridged (netns) VM or check BPF object
              path / memlock / bpffs mounts.
            </p>
          )}
        </div>
      )}

      {tab === 'policy' && (
        <div className="space-y-4">
          {!canWrite && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Viewer accounts can inspect policy but cannot save changes.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <PresetBtn disabled={!canWrite} onClick={() => applyPreset('open')} label="Allow all" />
            <PresetBtn disabled={!canWrite} onClick={() => applyPreset('deny')} label="Deny all" />
            <PresetBtn disabled={!canWrite} onClick={() => applyPreset('web')} label="Web egress" />
            <button
              type="button"
              onClick={() => setShowJson((v) => !v)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-[#d2d2d7] bg-white text-[#6e6e73] hover:text-[#1d1d1f]"
            >
              {showJson ? 'Form editor' : 'Advanced JSON'}
            </button>
          </div>

          {showJson ? (
            <textarea
              className={`${inputCls} h-56 font-mono text-xs`}
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value)
                setDirty(true)
              }}
              readOnly={!canWrite}
              spellCheck={false}
            />
          ) : (
            <div className="bg-white rounded-xl border border-[#d2d2d7] p-4 space-y-4">
              <label className="flex items-center gap-2 text-sm text-[#1d1d1f]">
                <input
                  type="checkbox"
                  checked={policy.default_allow}
                  disabled={!canWrite}
                  onChange={(e) => updatePolicy({ default_allow: e.target.checked })}
                />
                Default allow (when unset, unmatched traffic is denied)
              </label>

              <TagList
                label="Allow CIDRs"
                hint="e.g. 10.0.0.0/8 or ::/0"
                items={policy.allow_cidrs}
                draft={cidrDraft}
                setDraft={setCidrDraft}
                onAdd={addCidr}
                onRemove={removeCidr}
                onClear={() => updatePolicy({ allow_cidrs: [] })}
                disabled={!canWrite}
                placeholder="Add CIDR"
              />

              <TagList
                label="Allow ports"
                hint="Port or range — e.g. 443 or 8000-8999"
                items={policy.allow_ports}
                draft={portDraft}
                setDraft={setPortDraft}
                onAdd={addPort}
                onRemove={removePort}
                onClear={() => updatePolicy({ allow_ports: [] })}
                disabled={!canWrite}
                placeholder="Add port"
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Max egress Mbps</label>
                  <input
                    type="number"
                    min={0}
                    className={inputCls}
                    disabled={!canWrite}
                    value={policy.max_egress_mbps ?? ''}
                    placeholder="unlimited"
                    onChange={(e) => {
                      const v = e.target.value
                      updatePolicy({
                        max_egress_mbps: v === '' ? null : Math.max(0, parseInt(v, 10) || 0),
                      })
                    }}
                  />
                </div>
                <div>
                  <label className={labelCls}>Max egress PPS</label>
                  <input
                    type="number"
                    min={0}
                    className={inputCls}
                    disabled={!canWrite}
                    value={policy.max_egress_pps ?? ''}
                    placeholder="unlimited"
                    onChange={(e) => {
                      const v = e.target.value
                      updatePolicy({
                        max_egress_pps: v === '' ? null : Math.max(0, parseInt(v, 10) || 0),
                      })
                    }}
                  />
                </div>
                <div>
                  <label className={labelCls}>Sample rate</label>
                  <input
                    type="number"
                    min={0}
                    className={inputCls}
                    disabled={!canWrite}
                    value={policy.sample_rate}
                    onChange={(e) =>
                      updatePolicy({ sample_rate: Math.max(0, parseInt(e.target.value, 10) || 0) })
                    }
                  />
                  <p className="text-[11px] text-[#6e6e73] mt-1">0 = off; ≥1 enables flow sampling</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={resetPolicy}
              className="px-3 py-1.5 text-sm rounded-lg border border-[#d2d2d7] bg-white text-[#1d1d1f] disabled:opacity-40"
            >
              Discard
            </button>
            {canWrite && (
              <button
                type="button"
                disabled={saving || (!dirty && !showJson)}
                onClick={() => void savePolicy()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-[#0071e3] text-white disabled:opacity-40"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Save policy
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'stats' && (
        <div className="space-y-4">
          {!stats ? (
            <p className="text-sm text-[#6e6e73]">No stats available (program may not be attached).</p>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-[#d2d2d7] p-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <Stat label="Allowed packets" value={stats.allowed_packets.toLocaleString()} />
                <Stat label="Allowed bytes" value={formatBytes(stats.allowed_bytes)} />
                <Stat label="Dropped packets" value={stats.dropped_packets.toLocaleString()} />
                <Stat label="Dropped bytes" value={formatBytes(stats.dropped_bytes)} />
                <Stat label="Drop rate" value={dropRate ?? '—'} />
              </div>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[#d2d2d7] bg-white"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh counters
              </button>
            </>
          )}
        </div>
      )}

      {tab === 'flows' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className={labelCls}>Limit</label>
              <select
                className={inputCls}
                value={flowLimit}
                onChange={(e) => setFlowLimit(parseInt(e.target.value, 10))}
              >
                {[20, 50, 100, 250, 500, 1000].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[#d2d2d7] bg-white"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reload flows
            </button>
            <p className="text-xs text-[#6e6e73] pb-2">
              {flows.length} flow{flows.length === 1 ? '' : 's'} · sample_rate={policy.sample_rate}
            </p>
          </div>

          {flows.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#d2d2d7] p-6 text-center text-sm text-[#6e6e73]">
              No flows sampled yet. Set sample rate ≥ 1 on the Policy tab and generate traffic.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[#d2d2d7] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium text-[#6e6e73] uppercase tracking-wider border-b border-[#d2d2d7]">
                      <th className="py-2.5 px-3">Family</th>
                      <th className="py-2.5 px-3">Source</th>
                      <th className="py-2.5 px-3">Destination</th>
                      <th className="py-2.5 px-3">Proto</th>
                      <th className="py-2.5 px-3">Verdict</th>
                      <th className="py-2.5 px-3">Packets</th>
                      <th className="py-2.5 px-3">Bytes</th>
                      <th className="py-2.5 px-3">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flows.map((f, i) => (
                      <tr
                        key={`${f.identity}-${f.source}-${f.destination}-${f.source_port}-${i}`}
                        className="border-t border-[#d2d2d7]/60 hover:bg-[#f5f5f7]"
                      >
                        <td className="py-2 px-3 text-[#6e6e73]">IPv{f.family}</td>
                        <td className="py-2 px-3 font-mono text-xs">
                          {f.source}:{f.source_port}
                        </td>
                        <td className="py-2 px-3 font-mono text-xs">
                          {f.destination}:{f.destination_port}
                        </td>
                        <td className="py-2 px-3">{protoLabel(f.protocol)}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              f.verdict.toLowerCase().includes('drop') ||
                              f.verdict.toLowerCase().includes('deny')
                                ? 'bg-red-50 text-red-700'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {f.verdict}
                          </span>
                        </td>
                        <td className="py-2 px-3">{f.packets.toLocaleString()}</td>
                        <td className="py-2 px-3">{formatBytes(f.bytes)}</td>
                        <td className="py-2 px-3 text-[#6e6e73] text-xs">{formatAge(f.last_seen_ns)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-[#6e6e73] uppercase tracking-wide">{label}</div>
      <div
        className={`font-medium text-[#1d1d1f] mt-0.5 truncate ${mono ? 'font-mono text-xs' : ''}`}
        title={value}
      >
        {value}
      </div>
    </div>
  )
}

function PresetBtn({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="text-xs px-2.5 py-1.5 rounded-lg border border-[#d2d2d7] bg-white text-[#1d1d1f] hover:bg-[#f5f5f7] disabled:opacity-40"
    >
      {label}
    </button>
  )
}

function TagList({
  label,
  hint,
  items,
  draft,
  setDraft,
  onAdd,
  onRemove,
  onClear,
  disabled,
  placeholder,
}: {
  label: string
  hint: string
  items: string[]
  draft: string
  setDraft: (v: string) => void
  onAdd: () => void
  onRemove: (v: string) => void
  onClear: () => void
  disabled?: boolean
  placeholder: string
}) {
  return (
    <div>
      <label className={labelCls}>
        {label} <span className="font-normal normal-case">({hint})</span>
      </label>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[1.5rem]">
        {items.length === 0 && (
          <span className="text-xs text-[#6e6e73]">None</span>
        )}
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded-md bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f]"
          >
            {item}
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemove(item)}
                className="text-[#6e6e73] hover:text-red-600"
                aria-label={`Remove ${item}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <input
            type="text"
            className={inputCls}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onAdd()
              }
            }}
          />
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-[#d2d2d7] bg-white shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
          {items.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-[#d2d2d7] bg-white text-[#6e6e73] shrink-0"
              title="Clear all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
