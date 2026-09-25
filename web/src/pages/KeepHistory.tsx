// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  ApprovalItem,
  ArtifactDiff,
  ArtifactItem,
  AuditPage,
  createTrigger,
  deleteTrigger,
  diffArtifacts,
  listApprovals,
  listArtifacts,
  listAudit,
  listDemos,
  listTriggers,
  TriggerItem,
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

type Tab = 'runs' | 'triggers' | 'audit' | 'approvals'

const TABS: { id: Tab; label: string }[] = [
  { id: 'runs', label: 'Runs' },
  { id: 'triggers', label: 'Triggers' },
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

  const [triggers, setTriggers] = useState<TriggerItem[]>([])
  const [watchRoot, setWatchRoot] = useState(true)
  const [demoIds, setDemoIds] = useState<string[]>([])
  const [newKind, setNewKind] = useState<'webhook' | 'folder'>('webhook')
  const [newUseCase, setNewUseCase] = useState('')
  const [newDir, setNewDir] = useState('')
  const [newSecret, setNewSecret] = useState<{ hook: string; secret: string } | null>(null)

  const [audit, setAudit] = useState<AuditPage | null>(null)
  const [approvals, setApprovals] = useState<ApprovalItem[]>([])
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('all')

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      if (tab === 'runs') setArtifacts(await listArtifacts({ limit: 200 }))
      else if (tab === 'triggers') {
        const [t, demos] = await Promise.all([listTriggers(), listDemos()])
        setTriggers(t.items)
        setWatchRoot(t.watch_root_configured)
        setDemoIds(demos.map((d) => d.id))
        setNewUseCase((cur) => cur || demos[0]?.id || '')
      } else if (tab === 'audit') setAudit(await listAudit(200))
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

  const addTrigger = async () => {
    setError(null)
    setNewSecret(null)
    try {
      const made = await createTrigger({
        use_case: newUseCase,
        kind: newKind,
        ...(newKind === 'folder' ? { dir: newDir.trim() } : {}),
      })
      if (made.secret && made.hook) setNewSecret({ hook: made.hook, secret: made.secret })
      setNewDir('')
      await load()
    } catch (e) {
      setError(errText(e))
    }
  }

  const removeTrigger = async (id: string) => {
    setError(null)
    try {
      await deleteTrigger(id)
      await load()
    } catch (e) {
      setError(errText(e))
    }
  }

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

        {tab === 'triggers' && (
          <Card className="p-5 space-y-4">
            <p className="text-sm text-[var(--zf-muted)]">
              A trigger starts a use case without an upload. A webhook takes a signed POST whose body is the
              file; a folder is scanned and each new file runs in its own sealed cell. Both go through the
              same checks and the same 0-CONNECT rule as an upload.
            </p>
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <label className="text-[var(--zf-muted)]">
                Use case{' '}
                <select
                  className="ml-1 rounded border border-[var(--zf-hairline)] bg-transparent px-2 py-1"
                  value={newUseCase}
                  onChange={(e) => setNewUseCase(e.target.value)}
                >
                  {demoIds.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[var(--zf-muted)]">
                Kind{' '}
                <select
                  className="ml-1 rounded border border-[var(--zf-hairline)] bg-transparent px-2 py-1"
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value as 'webhook' | 'folder')}
                >
                  <option value="webhook">webhook</option>
                  <option value="folder" disabled={!watchRoot}>
                    folder{watchRoot ? '' : ' (off: no watch root)'}
                  </option>
                </select>
              </label>
              {newKind === 'folder' && (
                <label className="text-[var(--zf-muted)]">
                  Folder name{' '}
                  <input
                    className="ml-1 rounded border border-[var(--zf-hairline)] bg-transparent px-2 py-1"
                    value={newDir}
                    onChange={(e) => setNewDir(e.target.value)}
                    placeholder="inbox"
                  />
                </label>
              )}
              <button
                type="button"
                className="zf-btn zf-btn-primary zf-btn-sm"
                disabled={!newUseCase || (newKind === 'folder' && !newDir.trim())}
                onClick={() => void addTrigger()}
              >
                Add trigger
              </button>
            </div>

            {newSecret && (
              <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm space-y-1">
                <p className="font-medium">Copy the secret now. It is shown once and signs every call.</p>
                <p>
                  Hook: <code className="font-mono text-xs">{newSecret.hook}</code>
                </p>
                <p>
                  Secret: <code className="font-mono text-xs break-all">{newSecret.secret}</code>
                </p>
              </div>
            )}

            {triggers.length === 0 ? (
              <p className="text-sm text-[var(--zf-muted)]">No triggers yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--zf-hairline)]">
                {triggers.map((t) => (
                  <li key={t.id} className="py-2 text-sm flex flex-wrap items-center gap-3">
                    <span className="font-mono text-xs">{t.kind}</span>
                    <span className="font-medium text-[var(--zf-ink)]">{t.use_case}</span>
                    <span className="text-[var(--zf-muted)]">
                      {t.kind === 'webhook'
                        ? t.hook
                        : `${t.dir} · ${t.cron ?? `every ${t.interval_seconds}s`}`}
                    </span>
                    <span className="text-xs text-[var(--zf-muted)]">{t.runs} runs</span>
                    {t.last_error && <span className="text-xs text-red-600">{t.last_error}</span>}
                    <button
                      type="button"
                      className="zf-btn zf-btn-ghost zf-btn-sm ml-auto"
                      onClick={() => void removeTrigger(t.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
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
