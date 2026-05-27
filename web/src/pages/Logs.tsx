// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal, Filter, Download, Trash2, RefreshCw } from 'lucide-react'
import { apiGet } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import { formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

interface LogEntry {
  id?: string
  timestamp: string
  level: string
  source: string
  message: string
  action?: string
  resource_type?: string
  detail?: string
}

export default function Logs() {
  const toast = useToastContext()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState<string>('ALL')
  const [autoScroll, setAutoScroll] = useState(true)
  const [loading, setLoading] = useState(true)
  const logContainerRef = useRef<HTMLDivElement>(null)

  const loadLogs = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await apiGet<any[]>('/api/audit/logs')
      const entries: LogEntry[] = data.map(entry => ({
        id: entry.id,
        timestamp: entry.timestamp || entry.created || new Date().toISOString(),
        level: (entry.level || entry.severity || 'INFO').toUpperCase(),
        source: entry.source || entry.user || 'vmspawnd',
        message: entry.detail || entry.message || `${entry.action || ''} ${entry.resource_type || ''}`.trim(),
        action: entry.action,
        resource_type: entry.resource_type,
        detail: entry.detail,
      }))
      setLogs(entries)
    } catch (error) {
      const msg = formatUserError(error)
      setLoadError(msg)
      toastFailure(toast, 'Failed to load logs', error)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadLogs()
    const interval = setInterval(loadLogs, 5000)
    return () => clearInterval(interval)
  }, [loadLogs])

  const filteredLogs = logs.filter(log => {
    const matchesText = log.message.toLowerCase().includes(filter.toLowerCase()) ||
                        log.source.toLowerCase().includes(filter.toLowerCase())
    const matchesLevel = levelFilter === 'ALL' || log.level === levelFilter
    return matchesText && matchesLevel
  })

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [autoScroll, logs])

  const clearLogs = () => {
    setLogs([])
  }

  const exportLogs = () => {
    const content = filteredLogs.map(log =>
      `[${log.timestamp}] ${log.level.padEnd(5)} ${log.source.padEnd(10)} ${log.message}`
    ).join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vmspawnd-logs-${new Date().toISOString()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'INFO': return 'text-cyan-400'
      case 'WARN': case 'WARNING': return 'text-yellow-400'
      case 'ERROR': case 'CRITICAL': return 'text-red-400'
      case 'DEBUG': return 'text-slate-400'
      default: return 'text-white'
    }
  }

  const getLevelBg = (level: string) => {
    switch (level) {
      case 'INFO': return 'bg-cyan-500/10 border-cyan-500/20'
      case 'WARN': case 'WARNING': return 'bg-yellow-500/10 border-yellow-500/20'
      case 'ERROR': case 'CRITICAL': return 'bg-red-500/10 border-red-500/20'
      case 'DEBUG': return 'bg-slate-500/10 border-slate-500/20'
      default: return 'bg-slate-800'
    }
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <ErrorBanner
          title="Could not load logs"
          headline={loadError}
          hints={hintsForError(loadError)}
          onRetry={loadLogs}
        />
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Terminal className="w-8 h-8" />
          System Logs
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={loadLogs}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <span className="text-sm text-slate-400">{filteredLogs.length} entries</span>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter logs..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700/50 rounded-lg py-2 pl-10 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Level Filter */}
          <div>
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Levels</option>
              <option value="INFO">INFO</option>
              <option value="WARN">WARN</option>
              <option value="ERROR">ERROR</option>
              <option value="DEBUG">DEBUG</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={exportLogs}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={clearLogs}
              className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Auto-scroll toggle */}
        <div className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            id="autoScroll"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="w-4 h-4 text-blue-600 bg-slate-800 border-slate-700/50 rounded focus:ring-blue-500"
          />
          <label htmlFor="autoScroll" className="text-sm text-slate-400">
            Auto-scroll to new logs
          </label>
        </div>
      </div>

      {/* Log Stream */}
      <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden">
        <div ref={logContainerRef} className="h-[600px] overflow-y-auto font-mono text-sm" id="log-container">
          {loading ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              Loading logs...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              No logs to display
            </div>
          ) : (
            <div className="divide-y divide-slate-700/50">
              {filteredLogs.map((log, index) => (
                <div
                  key={log.id || index}
                  className={`p-3 hover:bg-white/[0.03] transition ${getLevelBg(log.level)} border-l-4`}
                >
                  <div className="flex items-start gap-4">
                    <span className="text-slate-500 text-xs whitespace-nowrap">
                      {log.timestamp.length > 19 ? log.timestamp.slice(0, 19).replace('T', ' ') : log.timestamp}
                    </span>
                    <span className={`font-bold text-xs whitespace-nowrap ${getLevelColor(log.level)}`}>
                      {log.level}
                    </span>
                    <span className="text-slate-400 text-xs whitespace-nowrap">
                      [{log.source}]
                    </span>
                    <span className="text-slate-200 flex-1">
                      {log.message}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
