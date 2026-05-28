// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useRef, useCallback } from 'react'
import { Pause, Play, Trash2, Filter } from 'lucide-react'
import { useEventStream, type VMEventPayload } from '../hooks/useEventStream'
import ErrorBanner from '../components/ErrorBanner'
import { PageHeader } from '../components/ui'
import { hintsForError } from '../utils/daemonHints'

interface StreamEvent {
  id: number
  timestamp: Date
  type: string
  source: string
  message: string
  level: 'info' | 'warning' | 'error' | 'debug'
}

function levelColor(level: string): string {
  switch (level) {
    case 'error': return 'text-red-400'
    case 'warning': return 'text-amber-400'
    case 'debug': return 'text-slate-500'
    default: return 'text-blue-400'
  }
}

function levelBg(level: string): string {
  switch (level) {
    case 'error': return 'bg-red-500/10'
    case 'warning': return 'bg-amber-500/10'
    default: return ''
  }
}

function mapPayload(payload: VMEventPayload): StreamEvent {
  const levelRaw = payload.event_type.toLowerCase()
  const level: StreamEvent['level'] =
    levelRaw.includes('error') || levelRaw.includes('fail')
      ? 'error'
      : levelRaw.includes('warn')
        ? 'warning'
        : levelRaw.includes('debug')
          ? 'debug'
          : 'info'
  return {
    id: ++eventIdCounter,
    timestamp: new Date(payload.timestamp),
    type: payload.event_type,
    source: payload.vm_name,
    message: payload.detail || payload.event_type,
    level,
  }
}

let eventIdCounter = 0

export default function EventStream() {
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [paused, setPaused] = useState(false)
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)

  useEffect(() => { pausedRef.current = paused }, [paused])

  const onEvent = useCallback((payload: VMEventPayload) => {
    if (pausedRef.current) return
    setEvents((prev) => [mapPayload(payload), ...prev].slice(0, 500))
    setConnectionError(null)
  }, [])

  const { connected } = useEventStream({ onEvent })

  useEffect(() => {
    if (!connected && events.length === 0) {
      setConnectionError('Connecting to event stream…')
    } else if (connected) {
      setConnectionError(null)
    }
  }, [connected, events.length])

  useEffect(() => {
    if (!paused && containerRef.current) {
      containerRef.current.scrollTop = 0
    }
  }, [events, paused])

  const filtered = events.filter((e) => levelFilter === 'all' || e.level === levelFilter)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Event Stream"
        description="Live VM lifecycle events via authenticated SSE"
      />

      {connectionError && !connected && (
        <ErrorBanner title="Connection error" headline={connectionError} hints={hintsForError(connectionError)} />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-2 text-sm ${connected ? 'text-emerald-400' : 'text-amber-400'}`}
        >
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
          {connected ? 'Connected' : 'Reconnecting…'}
        </span>
        <button
          type="button"
          onClick={() => setPaused(!paused)}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          type="button"
          onClick={() => setEvents([])}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <Trash2 className="w-4 h-4" />
          Clear
        </button>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Filter className="w-4 h-4" />
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="input-field text-sm py-1"
          >
            <option value="all">All levels</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>
        </div>
      </div>

      <div
        ref={containerRef}
        className="rounded-xl border border-slate-700/50 bg-slate-900/50 max-h-[70vh] overflow-y-auto font-mono text-sm"
      >
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Waiting for events…</div>
        ) : (
          filtered.map((ev) => (
            <div
              key={ev.id}
              className={`flex gap-3 px-4 py-2 border-b border-slate-800/50 ${levelBg(ev.level)}`}
            >
              <span className="text-slate-500 shrink-0">{ev.timestamp.toLocaleTimeString()}</span>
              <span className={`shrink-0 uppercase text-xs font-bold ${levelColor(ev.level)}`}>{ev.level}</span>
              <span className="text-cyan-400 shrink-0">{ev.source}</span>
              <span className="text-slate-300 truncate">{ev.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
