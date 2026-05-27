// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { Bell, Plus, Trash2, Send, CheckCircle, XCircle, Loader2, Globe, ToggleLeft, ToggleRight } from 'lucide-react'
import { apiFetch } from '../api/client'
import PageLoadBanner from '../components/PageLoadBanner'
import { PageHeader } from '../components/ui'
import { formatHttpErrorBody } from '../utils/apiError'
import { usePageLoader } from '../hooks/usePageLoader'
import { useToastContext } from '../contexts/ToastContext'
import { toastFailure } from '../utils/toastError'

interface Webhook {
  id: string
  url: string
  events: string[]
  type: string
  enabled: boolean
}

const availableEvents = ['vm.started', 'vm.stopped', 'vm.created', 'vm.deleted', 'backup.completed', 'backup.failed']
const webhookTypes = ['generic', 'slack', 'discord']

export default function Webhooks() {
  const toast = useToastContext()
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const { loading, loadError, run } = usePageLoader('Failed to load webhooks')
  const [showAdd, setShowAdd] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null)

  const [newUrl, setNewUrl] = useState('')
  const [newEvents, setNewEvents] = useState<string[]>([])
  const [newType, setNewType] = useState('generic')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  const fetchWebhooks = useCallback(() => {
    return run(async () => {
      const res = await apiFetch('/api/webhooks')
      if (!res.ok) {
        const body = await res.text()
        throw new Error(formatHttpErrorBody(res.status, res.statusText, body))
      }
      const data = await res.json()
      setWebhooks(Array.isArray(data) ? data : data.webhooks || [])
    })
  }, [run])

  useEffect(() => {
    void fetchWebhooks()
  }, [fetchWebhooks])

  const handleAdd = async () => {
    if (!newUrl.trim()) { setAddError('URL is required'); return }
    if (newEvents.length === 0) { setAddError('Select at least one event'); return }
    setAdding(true)
    setAddError('')
    try {
      const res = await apiFetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl.trim(), events: newEvents, type: newType, enabled: true }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setNewUrl('')
      setNewEvents([])
      setNewType('generic')
      setShowAdd(false)
      fetchWebhooks()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add webhook')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await apiFetch(`/api/webhooks/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setWebhooks((prev) => prev.filter((w) => w.id !== id))
    } catch (err) {
      toastFailure(toast, 'Failed to delete webhook', err)
    }
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    setTestResult(null)
    try {
      const res = await apiFetch('/api/webhooks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_id: id }),
      })
      setTestResult({ id, ok: res.ok, msg: res.ok ? 'Test delivered' : `Failed (${res.status})` })
    } catch (err) {
      setTestResult({ id, ok: false, msg: err instanceof Error ? err.message : 'Test failed' })
    } finally {
      setTestingId(null)
    }
  }

  const toggleEvent = (event: string) => {
    setNewEvents((prev) => prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event])
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Webhook Configuration"
        onRefresh={() => void fetchWebhooks()}
        refreshing={loading}
        actions={
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-orange-600 hover:bg-orange-500 text-white font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Webhook
          </button>
        }
      />

      <PageLoadBanner title="Could not load webhooks" headline={loadError} onRetry={() => void fetchWebhooks()} />

      {showAdd && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-300">New Webhook</h3>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Webhook URL</label>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://hooks.example.com/webhook"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Type</label>
            <div className="flex gap-2">
              {webhookTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setNewType(t)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors capitalize ${
                    newType === t
                      ? 'bg-orange-600/20 text-orange-400 border-orange-500/30'
                      : 'text-slate-400 bg-slate-800 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Events</label>
            <div className="flex flex-wrap gap-2">
              {availableEvents.map((ev) => (
                <label key={ev} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newEvents.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                    className="rounded border-slate-600 bg-slate-800 text-orange-500 focus:ring-orange-500/50"
                  />
                  <span className="text-sm text-slate-300 font-mono">{ev}</span>
                </label>
              ))}
            </div>
          </div>

          {addError && (
            <p className="text-sm text-red-400">{addError}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={adding}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {adding ? 'Adding...' : 'Add'}
            </button>
            <button
              onClick={() => { setShowAdd(false); setAddError('') }}
              className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : webhooks.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No webhooks configured yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <div key={wh.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Globe className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <span className="text-sm text-slate-200 font-mono truncate">{wh.url}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded capitalize ${
                      wh.type === 'slack' ? 'bg-purple-500/20 text-purple-400'
                        : wh.type === 'discord' ? 'bg-indigo-500/20 text-indigo-400'
                        : 'bg-slate-700 text-slate-400'
                    }`}>
                      {wh.type || 'generic'}
                    </span>
                    {wh.events?.map((ev) => (
                      <span key={ev} className="text-xs px-2 py-0.5 bg-slate-800 text-slate-400 rounded font-mono">{ev}</span>
                    ))}
                    <div className="flex items-center gap-1 text-xs">
                      {wh.enabled ? (
                        <><ToggleRight className="w-4 h-4 text-green-400" /><span className="text-green-400">Enabled</span></>
                      ) : (
                        <><ToggleLeft className="w-4 h-4 text-slate-500" /><span className="text-slate-500">Disabled</span></>
                      )}
                    </div>
                  </div>
                  {testResult?.id === wh.id && (
                    <div className={`mt-2 flex items-center gap-1.5 text-xs ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                      {testResult.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      {testResult.msg}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleTest(wh.id)}
                    disabled={testingId === wh.id}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
                    title="Test webhook"
                  >
                    {testingId === wh.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Test
                  </button>
                  <button
                    onClick={() => handleDelete(wh.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Delete webhook"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
