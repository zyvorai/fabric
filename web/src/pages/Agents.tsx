// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Plus, RefreshCw } from 'lucide-react'
import { AgentRecord, createSession, listAgents } from '../api/agents'
import { PageHeader, EmptyState, Card } from '../components/ui'
import PageLoadBanner from '../components/PageLoadBanner'
import { usePageLoader } from '../hooks/usePageLoader'
import { useToastContext } from '../contexts/ToastContext'
import { toastFailure } from '../utils/toastError'

export default function Agents() {
  const toast = useToastContext()
  const [agents, setAgents] = useState<AgentRecord[]>([])
  const { loading, loadError, run } = usePageLoader('Failed to load agents')

  const load = useCallback(() => {
    return run(async () => {
      const res = await listAgents()
      setAgents(res.items ?? [])
    })
  }, [run])

  useEffect(() => {
    void load()
  }, [load])

  const runSession = async (name: string) => {
    try {
      const session = await createSession({ agent: name })
      toast.success(`Session ${session.id} created`)
      window.location.href = `/app/sessions/${session.id}`
    } catch (e) {
      toastFailure(toast, 'Failed to create session', e)
    }
  }

  return (
    <div>
      <PageHeader
        title="Agents"
        description="TypeScript agents deployed via agent-runtime onto FluxVM sandboxes"
        onRefresh={() => void load()}
        refreshing={loading}
        actions={
          <Link to="/app/sessions" className="zf-btn zf-btn-ghost">
            Sessions
          </Link>
        }
      />
      <PageLoadBanner title="Could not load agents" headline={loadError} onRetry={() => void load()} />
      {agents.length === 0 && !loadError ? (
        <EmptyState
          icon={<Bot className="w-8 h-8" />}
          title="No agents deployed"
          description="Deploy an agent with the agent-runtime CLI or POST /api/agents (requires [agent_runtime] in zyvor-fabricd.toml)."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--zf-muted)] border-b border-[var(--zf-hairline)]">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Version</th>
                <th className="px-4 py-3 font-medium">Template</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.name} className="border-b border-[var(--zf-hairline)] last:border-0">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.version}</td>
                  <td className="px-4 py-3">{a.manifest?.template ?? '—'}</td>
                  <td className="px-4 py-3 text-[var(--zf-muted)]">{a.created_at}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="zf-btn zf-btn-primary zf-btn-sm"
                      onClick={() => void runSession(a.name)}
                    >
                      <Plus className="w-3.5 h-3.5" /> Run session
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="mt-4 text-xs text-[var(--zf-muted)] flex items-center gap-1">
        <RefreshCw className="w-3 h-3" /> Proxied through fabricd → agent-runtime (:9096)
      </p>
    </div>
  )
}
