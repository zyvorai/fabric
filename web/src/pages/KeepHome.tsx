// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { FileText, Shield } from 'lucide-react'
import { demoPdfBrief, PdfBriefDemoResult } from '../api/agents'
import { PageHeader, Card } from '../components/ui'
import { useToastContext } from '../contexts/ToastContext'
import { toastFailure } from '../utils/toastError'

type Chip = 'idle' | 'cell' | 'extract' | 'brief' | 'fail'

/** Keep console home: one-click PDF → brief.md (no browser). */
export default function KeepHome() {
  const toast = useToastContext()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [chip, setChip] = useState<Chip>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PdfBriefDemoResult | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    setChip('cell')
    try {
      // Progress is host-orchestrated; flip chips on the way to the response.
      const t1 = window.setTimeout(() => setChip('extract'), 400)
      const t2 = window.setTimeout(() => setChip('brief'), 1200)
      const out = await demoPdfBrief(file)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      setChip('brief')
      setResult(out)
      if ((out.egress_connects ?? -1) !== 0) {
        setChip('fail')
        setError(`egress_connects=${out.egress_connects} — expected 0`)
        toastFailure(toast, 'Demo failed closed', new Error('CONNECT events seen'))
        return
      }
      toast.success('brief.md ready · 0 CONNECT')
    } catch (e) {
      setChip('fail')
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toastFailure(toast, 'Brief this PDF failed', e)
    } finally {
      setBusy(false)
    }
  }

  const chipClass = (c: Chip) => {
    const on =
      (c === 'cell' && (chip === 'cell' || chip === 'extract' || chip === 'brief')) ||
      (c === 'extract' && (chip === 'extract' || chip === 'brief')) ||
      (c === 'brief' && chip === 'brief')
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
              <h2 className="text-base font-semibold text-[var(--zf-ink)]">Brief this PDF</h2>
              <p className="text-sm text-[var(--zf-muted)] mt-1">
                One click: cell up → extract → <code className="font-mono text-[12px]">brief.md</code>.
                No browser. Cockpit must show <strong>0 CONNECT</strong>.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={chipClass('cell')}>cell up</span>
            <span className={chipClass('extract')}>extract</span>
            <span className={chipClass('brief')}>brief.md</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="zf-btn zf-btn-secondary zf-btn-sm"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              {file ? file.name : 'Drop / pick PDF (or lab sample)'}
            </button>
            <button
              type="button"
              className="zf-btn zf-btn-primary"
              onClick={() => void run()}
              disabled={busy}
            >
              {busy ? 'Running…' : 'Brief this PDF'}
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
                <span className="text-[var(--zf-muted)] text-xs self-center">
                  artifact {result.artifact_title ?? 'brief.md'}
                </span>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4 text-sm text-[var(--zf-muted)] flex gap-3">
          <Shield className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            Proof without PacketWolf: Keep audit journal + FluxVM host{' '}
            <code className="font-mono text-[12px]">deny_udp</code> / gateway-only L4. Evidence class
            stays <code className="font-mono text-[12px]">software-test</code>.
          </p>
        </Card>
      </div>
    </div>
  )
}
