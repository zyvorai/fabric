// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { FileText, Shield, Trash2 } from 'lucide-react'
import {
  deleteDemo,
  DemoInfo,
  DemoResult,
  keepStatus,
  KeepStatus,
  listDemos,
  runDemo,
} from '../api/agents'
import DeployPack from '../components/keep/DeployPack'
import DeployUseCase from '../components/keep/DeployUseCase'
import { PageHeader, Card } from '../components/ui'
import { useToastContext } from '../contexts/ToastContext'
import { toastFailure } from '../utils/toastError'

type Chip = 'idle' | 'cell' | 'extract' | 'done' | 'fail'

/** Shown until the runtime answers, and if it predates the demo list. */
const FALLBACK_DEMOS: DemoInfo[] = [
  {
    id: 'pdf-brief',
    title: 'PDF brief',
    description: 'Drop a PDF, get a one-page brief.md.',
    accepts: ['pdf'],
    max_bytes: 32 * 1024 * 1024,
  },
]

/** Keep console home: drop an untrusted file into a sealed cell, get an artifact back. */
export default function KeepHome() {
  const toast = useToastContext()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [demos, setDemos] = useState<DemoInfo[]>(FALLBACK_DEMOS)
  const [demoId, setDemoId] = useState(FALLBACK_DEMOS[0].id)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [chip, setChip] = useState<Chip>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DemoResult | null>(null)

  const [showDeploy, setShowDeploy] = useState(false)
  const [showPack, setShowPack] = useState(false)
  const [status, setStatus] = useState<KeepStatus | null>(null)

  const refresh = () =>
    listDemos()
      .then((list) => {
        if (list.length > 0) setDemos(list)
        return list
      })
      .catch(() => {
        /* older runtime: keep the PDF brief fallback */
        return [] as DemoInfo[]
      })

  useEffect(() => {
    void refresh()
    keepStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [])

  const demo = demos.find((d) => d.id === demoId) ?? demos[0]
  const accept = demo.accepts.map((e) => `.${e}`).join(',')

  const pick = (id: string) => {
    setDemoId(id)
    setFile(null)
    setError(null)
    setResult(null)
    setChip('idle')
  }

  const onDeployed = async (id: string) => {
    await refresh()
    pick(id)
    setShowDeploy(false)
    toast.success(`Use case "${id}" deployed`)
  }

  const remove = async () => {
    if (demo.builtin !== false) return
    try {
      await deleteDemo(demo.id)
      const list = await refresh()
      pick(list[0]?.id ?? FALLBACK_DEMOS[0].id)
      toast.success(`Removed "${demo.title}"`)
    } catch (e) {
      toastFailure(toast, 'Could not remove the use case', e)
    }
  }

  const needsFile = demo.has_sample === false
  const run = async () => {
    if (needsFile && !file) {
      setError('This use case has no built-in sample. Pick a file to run it.')
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    setChip('cell')
    try {
      // Progress is host-orchestrated; flip chips on the way to the response.
      const t1 = window.setTimeout(() => setChip('extract'), 400)
      const out = await runDemo(demo.id, file)
      window.clearTimeout(t1)
      setChip('done')
      setResult(out)
      if ((out.egress_connects ?? -1) !== 0) {
        setChip('fail')
        setError(`egress_connects=${out.egress_connects} — expected 0`)
        toastFailure(toast, 'Demo failed closed', new Error('CONNECT events seen'))
        return
      }
      toast.success(`${demo.title} ready · 0 CONNECT`)
    } catch (e) {
      setChip('fail')
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toastFailure(toast, `${demo.title} failed`, e)
    } finally {
      setBusy(false)
    }
  }

  const chipClass = (c: 'cell' | 'extract' | 'done') => {
    const on =
      (c === 'cell' && (chip === 'cell' || chip === 'extract' || chip === 'done')) ||
      (c === 'extract' && (chip === 'extract' || chip === 'done')) ||
      (c === 'done' && chip === 'done')
    const fail = chip === 'fail'
    return [
      'rounded-full px-3 py-1 text-xs font-medium border',
      fail
        ? 'border-red-400/50 text-red-600'
        : on
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
          : 'border-[var(--zf-hairline)] text-[var(--zf-muted)]',
    ].join(' ')
  }

  const artifacts =
    result?.artifacts && result.artifacts.length > 0
      ? result.artifacts.map((a) => a.title).join(', ')
      : (result?.artifact_title ?? 'artifact')

  return (
    <div>
      <PageHeader
        title="Keep"
        description="Personal workstation for an untrusted agent — FluxVM cell, Sentinel egress, audit you can read."
        actions={
          <Link to="/app/agents" className="zf-btn zf-btn-ghost">
            Agents
          </Link>
        }
      />

      <div className="max-w-2xl space-y-4">
        <Card className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 mt-0.5 text-[var(--zf-secondary)]" />
            <div>
              <h2 className="text-base font-semibold text-[var(--zf-ink)]">{demo.title}</h2>
              <p className="text-sm text-[var(--zf-muted)] mt-1">
                {demo.description} No browser. Cockpit must show <strong>0 CONNECT</strong>.
              </p>
            </div>
          </div>

          {demos.length > 1 && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Use case">
              {demos.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="tab"
                  aria-selected={d.id === demo.id}
                  className={
                    d.id === demo.id
                      ? 'zf-btn zf-btn-primary zf-btn-sm'
                      : 'zf-btn zf-btn-secondary zf-btn-sm'
                  }
                  onClick={() => pick(d.id)}
                  disabled={busy}
                >
                  {d.title}
                  {d.builtin === false ? ' · custom' : ''}
                </button>
              ))}
            </div>
          )}
          {demo.builtin === false && (
            <button
              type="button"
              className="zf-btn zf-btn-ghost zf-btn-sm"
              onClick={() => void remove()}
              disabled={busy}
            >
              <Trash2 className="w-4 h-4 mr-1 inline" /> Remove this custom use case
            </button>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className={chipClass('cell')}>cell up</span>
            <span className={chipClass('extract')}>extract</span>
            <span className={chipClass('done')}>artifact</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="zf-btn zf-btn-secondary zf-btn-sm"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              {file ? file.name : needsFile ? `Pick a ${accept} file` : `Pick a ${accept} file (or use the sample)`}
            </button>
            <button
              type="button"
              className="zf-btn zf-btn-primary"
              onClick={() => void run()}
              disabled={busy}
            >
              {busy ? 'Running…' : `Run ${demo.title}`}
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-600 whitespace-pre-wrap border-t border-[var(--zf-hairline)] pt-3">
              {error}
            </p>
          )}

          {result && !error && (
            <div className="text-sm space-y-2 border-t border-[var(--zf-hairline)] pt-3">
              <div>
                CONNECT: <code className="font-mono">{result.egress_connects ?? 0}</code>
                {result.honesty ? (
                  <span className="text-[var(--zf-muted)]"> · {result.honesty}</span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="zf-btn zf-btn-primary zf-btn-sm"
                  onClick={() => navigate(`/app/keep/${result.session_id}`)}
                >
                  Open cockpit
                </button>
                <span className="text-[var(--zf-muted)] text-xs self-center">{artifacts}</span>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--zf-ink)]">Deploy your own use case</h2>
              <p className="text-sm text-[var(--zf-muted)] mt-1">
                Describe what to pull out of a file. It runs in the same sealed cell as the others:
                no browser, no network, 0 CONNECT. No code is run from your definition.
              </p>
            </div>
            <button
              type="button"
              className="zf-btn zf-btn-secondary zf-btn-sm shrink-0"
              aria-expanded={showDeploy}
              onClick={() => setShowDeploy((v) => !v)}
            >
              {showDeploy ? 'Close' : 'New use case'}
            </button>
          </div>
          {showDeploy && (
            <DeployUseCase
              onDeployed={(id) => void onDeployed(id)}
              onError={(msg) => toastFailure(toast, 'Deploy failed', new Error(msg))}
            />
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--zf-ink)]">Deploy an agent pack</h2>
              <p className="text-sm text-[var(--zf-muted)] mt-1">
                For a TypeScript agent that needs its own code. Bundle it on your machine with{' '}
                <code className="font-mono text-[12px]">fabric-agent pack bundle &lt;dir&gt;</code>,
                then upload the file. It is signed with your key, which never reaches the browser.
                {status?.keep_mode ? ' This runtime is in Keep mode: only signed packs deploy.' : ''}
              </p>
            </div>
            <button
              type="button"
              className="zf-btn zf-btn-secondary zf-btn-sm shrink-0"
              aria-expanded={showPack}
              onClick={() => setShowPack((v) => !v)}
            >
              {showPack ? 'Close' : 'Deploy a pack'}
            </button>
          </div>
          {showPack && (
            <DeployPack
              status={status}
              onDeployed={(name) => {
                setShowPack(false)
                toast.success(`Agent "${name}" deployed. Start a session from Agents.`)
              }}
              onError={(msg) => toastFailure(toast, 'Pack deploy failed', new Error(msg))}
            />
          )}
        </Card>

        <Card className="p-4 text-sm text-[var(--zf-muted)] flex gap-3">
          <Shield className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            Summaries are extractive: no model is called and nothing found in the file is run. Proof
            without PacketWolf: Keep audit journal + FluxVM host{' '}
            <code className="font-mono text-[12px]">deny_udp</code> / gateway-only L4. Evidence class
            stays <code className="font-mono text-[12px]">software-test</code>.
          </p>
        </Card>
      </div>
    </div>
  )
}
