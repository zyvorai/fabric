// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Shield } from 'lucide-react'
import {
  KeepCockpit,
  decideApproval,
  getSession,
  getSessionCockpit,
  SessionView,
} from '../api/agents'
import { PageHeader, Card, EmptyState } from '../components/ui'
import PageLoadBanner from '../components/PageLoadBanner'
import { usePageLoader } from '../hooks/usePageLoader'
import { useToastContext } from '../contexts/ToastContext'
import { toastFailure } from '../utils/toastError'

/** One Keep view: goal → current task → evidence → approval → outcome. */
export default function KeepSession() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const toast = useToastContext()
  const [session, setSession] = useState<SessionView | null>(null)
  const [cockpit, setCockpit] = useState<KeepCockpit | null>(null)
  const { loading, loadError, run } = usePageLoader('Failed to load Keep session')

  const load = useCallback(() => {
    if (!sessionId) return Promise.resolve()
    return run(async () => {
      const [s, c] = await Promise.all([
        getSession(sessionId),
        getSessionCockpit(sessionId),
      ])
      setSession(s)
      setCockpit(c)
    })
  }, [run, sessionId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!sessionId || !session) return
    const terminal = ['completed', 'failed', 'cancelled', 'expired']
    if (terminal.includes(session.status) && !(cockpit?.pending_approvals?.length)) return
    const timer = setInterval(() => void load(), 2500)
    return () => clearInterval(timer)
  }, [sessionId, session, cockpit?.pending_approvals?.length, load])

  const decide = async (approvalId: string, decision: 'approved' | 'denied') => {
    try {
      await decideApproval(approvalId, { decision, comment: `console ${decision}` })
      toast.success(decision === 'approved' ? 'Approved' : 'Denied')
      void load()
    } catch (e) {
      toastFailure(toast, 'Approval decision failed', e)
    }
  }

  if (!sessionId) {
    return (
      <EmptyState
        icon={<Shield className="w-8 h-8" />}
        title="Missing session"
        description="Open Keep from a session detail link."
      />
    )
  }

  const goal = cockpit?.active_goal
  const currentStep = goal?.plan?.find((s) => s.status === 'running' || s.status === 'blocked')
    ?? goal?.plan?.find((s) => s.status === 'pending')
  const pending = cockpit?.pending_approvals ?? []
  const lastOutcome = (cockpit?.last_decisions ?? []).slice(-3).reverse()

  return (
    <div>
      <PageHeader
        title="Keep"
        description={
          session
            ? `${session.agent} · ${session.status} · evidence ${cockpit?.evidence_class ?? 'software-test'}`
            : 'Goal, evidence, approval, outcome'
        }
        onRefresh={() => void load()}
        refreshing={loading}
        actions={
          <Link to={`/app/sessions/${sessionId}`} className="zf-btn zf-btn-ghost">
            Session detail
          </Link>
        }
      />
      <PageLoadBanner title="Could not load Keep view" headline={loadError} onRetry={() => void load()} />

      <div className="space-y-4 max-w-3xl">
        <Card className="p-4 space-y-2 text-sm">
          <h2 className="text-base font-semibold text-[var(--zf-ink)]">Goal</h2>
          {goal ? (
            <>
              <div className="font-medium">{goal.title}</div>
              <div className="text-[var(--zf-muted)]">Status: {goal.status}</div>
            </>
          ) : (
            <p className="text-[var(--zf-muted)]">No active goal linked to this session.</p>
          )}
        </Card>

        <Card className="p-4 space-y-2 text-sm">
          <h2 className="text-base font-semibold text-[var(--zf-ink)]">Current task</h2>
          {currentStep ? (
            <>
              <div className="font-medium">{currentStep.title}</div>
              <div className="text-[var(--zf-muted)]">
                {currentStep.id} · {currentStep.status}
                {currentStep.requires_approval ? ' · requires approval' : ''}
              </div>
            </>
          ) : (
            <p className="text-[var(--zf-muted)]">No plan step in progress.</p>
          )}
        </Card>

        <Card className="p-4 space-y-2 text-sm">
          <h2 className="text-base font-semibold text-[var(--zf-ink)]">Evidence</h2>
          {(cockpit?.recent_artifacts?.length ?? 0) === 0 ? (
            <p className="text-[var(--zf-muted)]">No artifacts yet.</p>
          ) : (
            <ul className="space-y-2">
              {cockpit!.recent_artifacts!.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span>
                    <span className="font-medium">{a.title}</span>
                    <span className="text-[var(--zf-muted)]"> · {a.kind}</span>
                  </span>
                  <code className="font-mono text-xs text-[var(--zf-muted)]">{a.id.slice(0, 8)}</code>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4 space-y-3 text-sm">
          <h2 className="text-base font-semibold text-[var(--zf-ink)]">Approval</h2>
          {pending.length === 0 ? (
            <p className="text-[var(--zf-muted)]">No pending approvals.</p>
          ) : (
            pending.map((a) => (
              <div key={a.id} className="border-t border-[var(--zf-hairline)] pt-3 first:border-0 first:pt-0">
                <div className="font-medium">{a.prompt}</div>
                <div className="text-[var(--zf-muted)] text-xs mt-1">
                  {a.kind ?? 'custom'} {a.subject ? `· ${a.subject}` : ''}
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    className="zf-btn zf-btn-primary zf-btn-sm"
                    onClick={() => void decide(a.id, 'approved')}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="zf-btn zf-btn-danger zf-btn-sm"
                    onClick={() => void decide(a.id, 'denied')}
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))
          )}
        </Card>

        <Card className="p-4 space-y-2 text-sm">
          <h2 className="text-base font-semibold text-[var(--zf-ink)]">Outcome</h2>
          {lastOutcome.length === 0 ? (
            <p className="text-[var(--zf-muted)]">No audit decisions yet.</p>
          ) : (
            <ul className="space-y-1 font-mono text-xs">
              {lastOutcome.map((d, i) => (
                <li key={i}>
                  {d.phase ?? '—'} · {d.action ?? '—'}
                </li>
              ))}
            </ul>
          )}
          {cockpit?.honesty && (
            <p className="text-[12px] text-[var(--zf-muted)] pt-2 border-t border-[var(--zf-hairline)]">
              {cockpit.honesty}
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
