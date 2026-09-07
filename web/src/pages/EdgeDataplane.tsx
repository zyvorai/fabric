// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Loader2, Plus, RefreshCw, Shield, Trash2 } from 'lucide-react'
import {
  DataplaneHealth,
  IdentityInfo,
  IpcacheEntry,
  SecurityGroup,
  applyDataplaneCnp,
  deleteDataplaneCnp,
  deleteDataplaneGroup,
  emptyPolicy,
  getDataplaneHealth,
  getDataplaneObserve,
  listDataplaneCnp,
  listDataplaneGroups,
  listDataplaneIdentities,
  listDataplaneIpcache,
  refreshDataplaneDns,
  upsertDataplaneGroup,
} from '../api/dataplane'
import { useToastContext } from '../contexts/ToastContext'
import { toastFailure } from '../utils/toastError'
import { formatUserError } from '../utils/apiError'
import { usePermissions } from '../hooks/usePermissions'
import SubsystemBanner from '../components/SubsystemBanner'
import { TerminalTextarea } from '../components/AppleTerminalFrame'
import { usePlatformInfo } from '../contexts/PlatformInfoContext'

type Tab = 'health' | 'groups' | 'cnp' | 'identities' | 'observe' | 'ipcache'

const SAMPLE_CNP = `{
  "apiVersion": "cilium.io/v2",
  "kind": "CiliumNetworkPolicy",
  "metadata": { "name": "web-egress" },
  "spec": {
    "endpointSelector": { "matchLabels": { "app": "web" } },
    "egress": [{
      "toCIDR": ["10.0.0.0/8"],
      "toPorts": [{ "ports": [{ "port": "443", "protocol": "TCP" }] }]
    }]
  }
}`

export default function EdgeDataplane() {
  const toast = useToastContext()
  const { canWrite } = usePermissions()
  const { capabilities } = usePlatformInfo()
  const hubbleUrl = capabilities?.hubble_ui_url?.trim() || ''
  const [tab, setTab] = useState<Tab>('health')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<DataplaneHealth | null>(null)
  const [groups, setGroups] = useState<SecurityGroup[]>([])
  const [cnps, setCnps] = useState<unknown[]>([])
  const [identities, setIdentities] = useState<IdentityInfo[]>([])
  const [observe, setObserve] = useState<Record<string, unknown> | null>(null)
  const [ipcache, setIpcache] = useState<IpcacheEntry[]>([])
  const [groupName, setGroupName] = useState('web')
  const [groupLabel, setGroupLabel] = useState('app=web')
  const [cnpJson, setCnpJson] = useState(SAMPLE_CNP)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [h, g, c, ids, obs, ipc] = await Promise.all([
        getDataplaneHealth(),
        listDataplaneGroups().catch(() => ({ items: [] as SecurityGroup[] })),
        listDataplaneCnp().catch(() => ({ items: [] as unknown[] })),
        listDataplaneIdentities().catch(() => ({ items: [] as IdentityInfo[] })),
        getDataplaneObserve().catch(() => null),
        listDataplaneIpcache().catch(() => ({ items: [] as IpcacheEntry[] })),
      ])
      setHealth(h)
      setGroups(g.items ?? [])
      setCnps(c.items ?? [])
      setIdentities(ids.items ?? [])
      setObserve(obs)
      setIpcache(ipc.items ?? [])
    } catch (err) {
      setError(formatUserError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const createGroup = async () => {
    if (!groupName.trim()) return
    setBusy(true)
    try {
      const labels = groupLabel.trim() ? [groupLabel.trim()] : []
      await upsertDataplaneGroup({
        name: groupName.trim(),
        labels,
        identity: 0,
        priority: 10,
        description: 'Created from Edge Dataplane console',
        policy: {
          ...emptyPolicy(),
          default_allow: false,
          allow_cidrs: ['10.0.0.0/8'],
          allow_ports: ['tcp/443', 'udp/53'],
          allow_icmp: true,
        },
      })
      toast.success(`Group '${groupName.trim()}' saved`)
      await load()
    } catch (err) {
      toastFailure(toast, 'Failed to save group', err)
    } finally {
      setBusy(false)
    }
  }

  const removeGroup = async (name: string) => {
    setBusy(true)
    try {
      await deleteDataplaneGroup(name)
      toast.success(`Deleted group '${name}'`)
      await load()
    } catch (err) {
      toastFailure(toast, 'Failed to delete group', err)
    } finally {
      setBusy(false)
    }
  }

  const applyCnp = async () => {
    setBusy(true)
    try {
      const doc = JSON.parse(cnpJson)
      await applyDataplaneCnp(doc)
      toast.success('CNP applied')
      await load()
    } catch (err) {
      toastFailure(toast, 'Failed to apply CNP', err)
    } finally {
      setBusy(false)
    }
  }

  const removeCnp = async (name: string) => {
    setBusy(true)
    try {
      await deleteDataplaneCnp(name)
      toast.success(`Deleted CNP '${name}'`)
      await load()
    } catch (err) {
      toastFailure(toast, 'Failed to delete CNP', err)
    } finally {
      setBusy(false)
    }
  }

  const doRefreshDns = async () => {
    setBusy(true)
    try {
      const r = await refreshDataplaneDns()
      toast.success(`Refreshed ${r.refreshed} FQDN polic(ies)`)
      await load()
    } catch (err) {
      toastFailure(toast, 'refresh-dns failed', err)
    } finally {
      setBusy(false)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'health', label: 'Health' },
    { id: 'groups', label: 'Groups' },
    { id: 'cnp', label: 'CNP' },
    { id: 'identities', label: 'Identities' },
    { id: 'observe', label: 'Observe' },
    { id: 'ipcache', label: 'Ipcache' },
  ]

  if (loading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="w-6 h-6 text-[#6e6e73] mx-auto mb-2 animate-spin" />
        <p className="text-sm text-[#6e6e73]">Loading edge dataplane…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-6xl mx-auto">
      <SubsystemBanner subsystem="vm_dataplane" title="Edge dataplane" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Shield className="w-5 h-5 text-[#0071e3] mt-0.5" />
          <div>
            <h1 className="text-xl font-semibold text-[#1d1d1f]">Edge Dataplane</h1>
            <p className="text-sm text-[#6e6e73] max-w-2xl">
              FluxVM Network Fabric schema v4 — security groups, CNP, identities, health, and
              ipcache. This is the <strong>VM edge</strong> plane, not Fabric SDN Net Security.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {hubbleUrl && (
            <a
              href={hubbleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[#d2d2d7] bg-white text-[#1d1d1f] hover:bg-[#f5f5f7]"
              title="Opens external Hubble UI (Cilium). VMs are not Cilium endpoints."
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Hubble
            </a>
          )}
          {canWrite && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void doRefreshDns()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[#d2d2d7] bg-white"
            >
              Refresh DNS
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              void load()
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[#d2d2d7] bg-white"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-1 border-b border-[#d2d2d7] overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium relative whitespace-nowrap ${
              tab === t.id ? 'text-[#0071e3]' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
            }`}
          >
            {t.label}
            {tab === t.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0071e3] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {tab === 'health' && health && (
        <div className="bg-white rounded-xl border border-[#d2d2d7] p-4 space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span
              className={`px-2 py-1 rounded-full border ${
                health.ok
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {health.ok ? 'ok' : 'check notes'}
            </span>
            <span className="px-2 py-1 rounded-full bg-white border border-[#d2d2d7]">
              mode={health.mode}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Cell label="BPF object" value={health.bpf_object_present ? 'yes' : 'no'} />
            <Cell label="Pin root" value={health.pin_root_present ? 'yes' : 'no'} />
            <Cell label="bpffs" value={health.bpffs_present ? 'yes' : 'no'} />
            <Cell label="Required" value={health.required ? 'yes' : 'no'} />
            <Cell label="Groups" value={String(health.groups)} />
            <Cell label="CNP policies" value={String(health.policies)} />
            <Cell label="Ipcache" value={String(health.ipcache_entries)} />
            <Cell label="Default allow" value={health.default_allow ? 'yes' : 'no'} />
          </div>
          {health.notes?.length > 0 && (
            <ul className="text-sm text-amber-800 list-disc pl-5">
              {health.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'groups' && (
        <div className="space-y-4">
          {canWrite && (
            <div className="bg-white rounded-xl border border-[#d2d2d7] p-4 flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-xs text-[#6e6e73] mb-1">Name</label>
                <input
                  className="bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-[#6e6e73] mb-1">Label</label>
                <input
                  className="bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm"
                  value={groupLabel}
                  onChange={(e) => setGroupLabel(e.target.value)}
                  placeholder="app=web"
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void createGroup()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-[#0071e3] text-white"
              >
                <Plus className="w-3.5 h-3.5" /> Save group
              </button>
            </div>
          )}
          <div className="bg-white rounded-xl border border-[#d2d2d7] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#f5f5f7] text-[#6e6e73] text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Identity</th>
                  <th className="px-3 py-2 font-medium">Labels</th>
                  <th className="px-3 py-2 font-medium">Priority</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-[#6e6e73]">
                      No security groups yet.
                    </td>
                  </tr>
                )}
                {groups.map((g) => (
                  <tr key={g.name} className="border-t border-[#d2d2d7]">
                    <td className="px-3 py-2 font-medium text-[#1d1d1f]">{g.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{g.identity}</td>
                    <td className="px-3 py-2 font-mono text-xs">{g.labels.join(', ') || '—'}</td>
                    <td className="px-3 py-2">{g.priority}</td>
                    <td className="px-3 py-2 text-right">
                      {canWrite && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void removeGroup(g.name)}
                          className="text-red-600 hover:text-red-700"
                          aria-label={`Delete ${g.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'cnp' && (
        <div className="space-y-4">
          {canWrite && (
            <div className="space-y-2">
              <TerminalTextarea
                title="CNP JSON"
                className="h-56"
                value={cnpJson}
                onChange={(e) => setCnpJson(e.target.value)}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void applyCnp()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-[#0071e3] text-white"
              >
                Apply CNP
              </button>
            </div>
          )}
          <div className="bg-white rounded-xl border border-[#d2d2d7] p-4 space-y-2">
            {cnps.length === 0 && <p className="text-sm text-[#6e6e73]">No CNP documents.</p>}
            {cnps.map((raw, i) => {
              const doc = raw as { metadata?: { name?: string } }
              const name = doc.metadata?.name ?? `cnp-${i}`
              return (
                <div
                  key={name}
                  className="flex items-center justify-between gap-2 border-b border-[#d2d2d7] last:border-0 py-2"
                >
                  <span className="text-sm font-medium text-[#1d1d1f]">{name}</span>
                  {canWrite && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeCnp(name)}
                      className="text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'identities' && (
        <div className="bg-white rounded-xl border border-[#d2d2d7] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f5f5f7] text-[#6e6e73] text-left">
              <tr>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Reserved</th>
                <th className="px-3 py-2 font-medium">Labels</th>
              </tr>
            </thead>
            <tbody>
              {identities.map((id) => (
                <tr key={`${id.id}-${id.name}`} className="border-t border-[#d2d2d7]">
                  <td className="px-3 py-2 font-mono text-xs">{id.id}</td>
                  <td className="px-3 py-2">{id.name}</td>
                  <td className="px-3 py-2">{id.reserved ? 'yes' : 'no'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{id.labels.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'observe' && (
        <TerminalTextarea
          title="observe"
          className="h-96"
          value={JSON.stringify(observe ?? {}, null, 2)}
          readOnly
        />
      )}

      {tab === 'ipcache' && (
        <div className="bg-white rounded-xl border border-[#d2d2d7] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f5f5f7] text-[#6e6e73] text-left">
              <tr>
                <th className="px-3 py-2 font-medium">IP</th>
                <th className="px-3 py-2 font-medium">Identity</th>
                <th className="px-3 py-2 font-medium">VM ID</th>
              </tr>
            </thead>
            <tbody>
              {ipcache.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-[#6e6e73]">
                    No ipcache entries.
                  </td>
                </tr>
              )}
              {ipcache.map((e) => (
                <tr key={e.ip} className="border-t border-[#d2d2d7]">
                  <td className="px-3 py-2 font-mono text-xs">{e.ip}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.identity}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.vm_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[#6e6e73]">{label}</p>
      <p className="font-medium text-[#1d1d1f]">{value}</p>
    </div>
  )
}
