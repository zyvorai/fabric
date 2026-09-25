// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  ApprovalItem,
  ArtifactDiff,
  ArtifactItem,
  AuditPage,
  diffArtifacts,
  listApprovals,
  listArtifacts,
  listAudit,
} from '../api/agents'
import { Card, PageHeader } from '../components/ui'
import {
  ApprovalFilter,
  chainLabel,
  filterApprovals,
  orderPair,
  toggleSelection,
  demoIdsOf,
} from '../lib/keepHistory'

type Tab = 'runs' | 'audit' | 'approvals'

const TABS: { id: Tab; label: string }[] = [
  { id: 'runs', label: 'Runs' },
  { id: 'audit', label: 'Audit' },
  { id: 'approvals', label: 'Approvals' },
]

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const when = (iso: string) => new Date(iso).toLocaleString()

/** Keep history: past runs with diff, the hash-chained audit journal, and the approval inbox. */
export default function KeepHistory() {
  const [tab, setTab] = useState<Tab>('runs')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([])
  const [useCase, setUseCase] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [diff, setDiff] = useState<ArtifactDiff | null>(null)

  const [audit, setAudit] = useState<AuditPage | null>(null)
  const [approvals, setApprovals] = useState<ApprovalItem[]>([])
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('all')

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      if (tab === 'runs') setArtifacts(await listArtifacts({ limit: 200 }))
      else if (tab === 'audit') setAudit(await listAudit(200))
      else setApprovals(await listApprovals())
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }, [tab])

  useEffect(() => {
    void load()
  }, [load])

  const useCases = useMemo(() => demoIdsOf(artifacts), [artifacts])
  const shown = useMemo(
    () => (useCase ? artifacts.filter((a) => a.metadata?.demo === useCase) : artifacts),
    [artifacts, useCase],
  )
  const byId = useMemo(() => new Map(artifacts.map((a) => [a.id, a])), [artifacts])

  const compare = async () => {
    const [x, y] = selected.map((id) => byId.get(id))
    if (!x || !y) return
    const [older, newer] = orderPair(x, y)
    setError(null)
    try {
      setDiff(await diffArtifacts(older.id, newer.id))
    } catch (e) {
      setDiff(null)
      setError(errText(e))
    }
  }

  return (
    <div>
      <PageHeader
        title="Keep history"
        description="Past runs, the audit journal and approvals. Run history needs an admin token."
        onRefresh={() => void load()}
        refreshing={busy}
        actions={
          <Link to="/app/keep" className="zf-btn zf-btn-ghost">
            Keep
          </Link>
        }
      />

      <div className="max-w-4xl space-y-4">
        <div role="tablist" className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`zf-btn zf-btn-sm ${tab === t.id ? 'zf-btn-primary' : 'zf-btn-secondary'}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>}

        {tab === 'runs' && (
          <Card className="p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-[var(--zf-muted)]">
                Use case{' '}
                <select
                  className="ml-1 rounded border border-[var(--zf-hairline)] bg-transparent px-2 py-1 text-sm"
                  value={useCase}
                  onChange={(e) => setUseCase(e.target.value)}
                >
                  <option value="">All</option>
                  {useCases.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="zf-btn zf-btn-primary zf-btn-sm"
                disabled={selected.length !== 2}
                onClick={() => void compare()}
              >
                Compare selected
              </button>
              <span className="text-xs text-[var(--zf-muted)]">Pick two runs to see what changed.</span>
            </div>

            {shown.length === 0 ? (
              <p className="text-sm text-[var(--zf-muted)]">No runs yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--zf-hairline)]">
                {shown.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      aria-label={`Select ${a.title}`}
                      checked={selected.includes(a.id)}
                      onChange={() => setSelected((s) => toggleSelection(s, a.id))}
                    />
                    <span className="font-medium text-[var(--zf-ink)]">{a.title}</span>
                    <span className="text-[var(--zf-muted)]">{a.metadata?.demo ?? a.kind}</span>
                    <span className="ml-auto text-xs text-[var(--zf-muted)]">{when(a.created_at)}</span>
                    {a.session_id && (
                      <Link to={`/app/keep/${a.session_id}`} className="text-xs underline">
                        cockpit
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {diff && (
              <div className="border-t border-[var(--zf-hairline)] pt-3 space-y-2">
                <p className="text-sm">
                  <strong>{diff.a.title}</strong> ({when(diff.a.created_at)}) →{' '}
                  <strong>{diff.b.title}</strong> ({when(diff.b.created_at)}):{' '}
                  <span className="text-emerald-700">+{diff.summary.added}</span>{' '}
                  <span className="text-red-600">−{diff.summary.removed}</span>{' '}
                  <span className="text-[var(--zf-muted)]">{diff.summary.unchanged} unchanged</span>
                </p>
                <pre className="max-h-96 overflow-auto rounded border border-[var(--zf-hairline)] p-3 text-xs font-mono whitespace-pre-wrap">
                  {diff.lines.map((l, i) => (
                    <div
                      key={i}
                      className={
                        l.op === 'add'
                          ? 'bg-emerald-500/10 text-emerald-800'
                          : l.op === 'del'
                            ? 'bg-red-500/10 text-red-700'
                            : 'text-[var(--zf-muted)]'
                      }
                    >
                      {l.op === 'add' ? '+ ' : l.op === 'del' ? '- ' : '  '}
                      {l.line}
                    </div>
                  ))}
                </pre>
              </div>
            )}
          </Card>
        )}

        {tab === 'audit' && (
          <Card className="p-5 space-y-3">
            {audit && (
              <p
                className={`text-sm font-medium ${audit.chain.chain_ok ? 'text-emerald-700' : 'text-red-600'}`}
              >
                {chainLabel(audit.chain)}
              </p>
            )}
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-[var(--zf-muted)]">
                  <tr>
                    <th className="pr-3">#</th>
                    <th className="pr-3">When</th>
                    <th className="pr-3">Phase</th>
                    <th className="pr-3">Action</th>
                    <th>Session</th>
                  </tr>
                </thead>
                <tbody>
                  {(audit?.items ?? []).map((r) => (
                    <tr key={r.seq} className="border-t border-[var(--zf-hairline)]">
                      <td className="pr-3 font-mono">{r.seq}</td>
                      <td className="pr-3">{when(r.at)}</td>
                      <td className="pr-3">{r.phase}</td>
                      <td className="pr-3 font-mono">{r.action}</td>
                      <td>
                        {r.session_id ? (
                          <Link to={`/app/keep/${r.session_id}`} className="underline font-mono">
                            {r.session_id.slice(0, 8)}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === 'approvals' && (
          <Card className="p-5 space-y-3">
            <div className="flex gap-2">
              {(['all', 'pending', 'decided'] as ApprovalFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`zf-btn zf-btn-sm ${approvalFilter === f ? 'zf-btn-primary' : 'zf-btn-secondary'}`}
                  onClick={() => setApprovalFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--zf-muted)]">
              Read-only. Decide from the session&apos;s cockpit or your phone, never from this list.
            </p>
            <ul className="divide-y divide-[var(--zf-hairline)]">
              {filterApprovals(approvals, approvalFilter).map((a) => (
                <li key={a.id} className="py-2 text-sm flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs">{a.status}</span>
                  <span className="text-[var(--zf-muted)]">{a.kind}</span>
                  <span className="text-[var(--zf-ink)]">{a.subject ?? a.prompt}</span>
                  <span className="ml-auto text-xs text-[var(--zf-muted)]">{when(a.created_at)}</span>
                  <Link to={`/app/keep/${a.session_id}`} className="text-xs underline">
                    cockpit
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}
