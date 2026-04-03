import { useState, useEffect, useRef, useCallback } from 'react'
import { Radio, Pause, Play, Trash2, Filter } from 'lucide-react'
import { getToken } from '../api/client'

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

let eventIdCounter = 0

export default function EventStream() {
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [paused, setPaused] = useState(false)
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [connected, setConnected] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pausedRef = useRef(false)

  useEffect(() => { pausedRef.current = paused }, [paused])

  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = getToken()
    const wsUrl = `${protocol}//${window.location.host}/ws/events${token ? `?token=${encodeURIComponent(token)}` : ''}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => { setConnected(false); reconnectRef.current = setTimeout(connect, 3000) }
    ws.onerror = () => ws.close()

    ws.onmessage = (msg) => {
      if (pausedRef.current) return
      try {
        const data = JSON.parse(msg.data)
        const event: StreamEvent = {
          id: ++eventIdCounter,
          timestamp: new Date(),
          type: data.type || data.event || 'unknown',
          source: data.source || data.vm || 'system',
          message: data.message || data.description || JSON.stringify(data),
          level: data.level || data.severity || 'info',
        }
        setEvents(prev => [event, ...prev].slice(0, 500))
      } catch { /* ignore parse errors */ }
    }

    return ws
  }, [])

  useEffect(() => {
    const ws = connect()
    return () => { ws.close(); if (reconnectRef.current) clearTimeout(reconnectRef.current) }
  }, [connect])

  const filteredEvents = levelFilter === 'all' ? events : events.filter(e => e.level === levelFilter)
  const errorCount = events.filter(e => e.level === 'error').length
  const warningCount = events.filter(e => e.level === 'warning').length

  const filters: { value: string; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'info', label: 'Info' },
    { value: 'warning', label: 'Warning' },
    { value: 'error', label: 'Error' },
    { value: 'debug', label: 'Debug' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Radio className="w-6 h-6 text-rose-400" /> Event Stream</h1>
          <p className="text-sm text-slate-400 mt-1">Real-time system events via WebSocket</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setPaused(!paused)} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${paused ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
            {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />} {paused ? 'Resume' : 'Pause'}
          </button>
          <button onClick={() => setEvents([])} title="Clear all events" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /> Clear</button>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? (paused ? 'bg-amber-400' : 'bg-green-400 animate-pulse') : 'bg-red-400'}`} />
            <span className="text-xs text-slate-500">{connected ? (paused ? 'Paused' : 'Connected') : 'Disconnected'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card-blue rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{events.length}</div>
          <div className="text-xs text-slate-400 mt-1">Total Events</div>
        </div>
        <div className="stat-card-red rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{errorCount}</div>
          <div className="text-xs text-slate-400 mt-1">Errors</div>
        </div>
        <div className="stat-card-orange rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{warningCount}</div>
          <div className="text-xs text-slate-400 mt-1">Warnings</div>
        </div>
        <div className="stat-card-green rounded-xl border border-slate-700/50 p-5 card-glow-green transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{events.length - errorCount - warningCount}</div>
          <div className="text-xs text-slate-400 mt-1">Info</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-slate-500" />
        {filters.map(f => (
          <button key={f.value} onClick={() => setLevelFilter(f.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${levelFilter === f.value ? 'bg-rose-600/20 text-rose-400 border border-rose-500/30' : 'text-slate-400 hover:text-slate-200 bg-slate-800/50 border border-slate-700 hover:border-slate-600'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div ref={containerRef} className="bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden max-h-[600px] overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">{events.length === 0 ? 'Waiting for events...' : 'No events match this filter'}</div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {filteredEvents.map(event => (
              <div key={event.id} className={`px-4 py-2.5 flex items-start gap-3 text-xs font-mono ${levelBg(event.level)} hover:bg-slate-800/30 transition-colors`}>
                <span className="text-slate-600 whitespace-nowrap shrink-0">{event.timestamp.toLocaleTimeString()}.{String(event.timestamp.getMilliseconds()).padStart(3, '0')}</span>
                <span className={`shrink-0 uppercase font-bold w-12 ${levelColor(event.level)}`}>{event.level}</span>
                <span className="text-slate-500 shrink-0 w-20 truncate" title={event.source}>[{event.source}]</span>
                <span className="text-cyan-400 shrink-0 w-24 truncate">{event.type}</span>
                <span className="text-slate-300 break-all">{event.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
