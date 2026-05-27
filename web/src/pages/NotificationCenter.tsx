// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback, useRef } from 'react'
import { X } from 'lucide-react'
import { apiFetch } from '../api/client'
import { PageHeader } from '../components/ui'
import { formatUserError } from '../utils/apiError'

interface Notification {
  id: string
  type: 'vm_started' | 'vm_stopped' | 'alert' | 'warning'
  message: string
  detail?: string
  timestamp: Date
  read: boolean
}

const typeConfig: Record<Notification['type'], { bg: string; border: string; icon: string; label: string }> = {
  vm_started: { bg: 'bg-green-500/10', border: 'border-green-500/30', icon: '\u2713', label: 'VM Started' },
  vm_stopped: { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: '\u2717', label: 'VM Stopped' },
  alert: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: '\u26A0', label: 'Alert' },
  warning: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: '\u24D8', label: 'System Warning' },
}

const typeTextColor: Record<Notification['type'], string> = {
  vm_started: 'text-green-400',
  vm_stopped: 'text-red-400',
  alert: 'text-amber-400',
  warning: 'text-blue-400',
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

let nextId = 1

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [pollError, setPollError] = useState<string | null>(null)
  const knownAlertsRef = useRef<Set<string>>(new Set())
  const initialLoadRef = useRef(true)

  const addNotification = useCallback(
    (type: Notification['type'], message: string, detail?: string) => {
      const n: Notification = { id: `notif-${nextId++}`, type, message, detail, timestamp: new Date(), read: false }
      setNotifications((prev) => [n, ...prev].slice(0, 200))
    },
    []
  )

  useEffect(() => {
    const poll = async () => {
      try {
        const resp = await apiFetch('/api/system/alerts')
        if (!resp.ok) {
          const body = await resp.text()
          throw new Error(body || `HTTP ${resp.status}`)
        }
        const data = await resp.json()
        setPollError(null)
        const alerts: any[] = data.alerts || (Array.isArray(data) ? data : [])
        for (const a of alerts) {
          const key = a.id || a.name || a.message || ''
          if (!key || knownAlertsRef.current.has(key)) continue
          knownAlertsRef.current.add(key)
          if (!initialLoadRef.current) {
            addNotification(a.severity === 'warning' ? 'warning' : 'alert', a.name || 'Alert fired', a.message)
          }
        }
      } catch (err) {
        setPollError(formatUserError(err))
      }
      initialLoadRef.current = false
    }
    poll()
    const interval = setInterval(poll, 10000)
    return () => clearInterval(interval)
  }, [addNotification])

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const dismiss = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const clearAll = () => setNotifications([])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Center"
        description="VM events, alerts, and system warnings"
        actions={
          notifications.length > 0 ? (
            <button onClick={clearAll} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors">
              Clear All
            </button>
          ) : undefined
        }
      />
      {unreadCount > 0 && (
        <div className="text-xs text-slate-400">{unreadCount} unread</div>
      )}
      {pollError && (
        <div className="bg-amber-500/10 rounded-lg border border-amber-500/30 px-4 py-2 text-xs text-amber-400">
          {pollError} — alert polling paused until next retry
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        {(['vm_started', 'vm_stopped', 'alert', 'warning'] as Notification['type'][]).map((type) => {
          const count = notifications.filter((n) => n.type === type).length
          const cfg = typeConfig[type]
          return (
            <div key={type} className={`${cfg.bg} border ${cfg.border} rounded-lg px-3 py-1.5 text-xs font-medium ${typeTextColor[type]}`}>
              {cfg.icon} {cfg.label}: {count}
            </div>
          )
        })}
      </div>

      {notifications.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-12 text-center">
          <p className="text-slate-500 text-sm">No notifications yet.</p>
          <p className="text-slate-600 text-xs mt-1">VM events, alerts, and warnings will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const cfg = typeConfig[n.type]
            return (
              <div key={n.id} onClick={() => markAsRead(n.id)}
                className={`${cfg.bg} border ${cfg.border} rounded-xl px-4 py-3 flex items-start gap-3 cursor-pointer transition-opacity ${n.read ? 'opacity-60' : 'opacity-100'}`}>
                <span className={`text-lg mt-0.5 ${typeTextColor[n.type]}`}>{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${typeTextColor[n.type]}`}>{cfg.label}</span>
                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
                  </div>
                  <p className="text-sm text-slate-200 mt-0.5">{n.message}</p>
                  {n.detail && <p className="text-xs text-slate-500 mt-0.5 truncate">{n.detail}</p>}
                  <p className="text-xs text-slate-600 mt-1">{formatTimeAgo(n.timestamp)}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); dismiss(n.id) }}
                  className="text-slate-600 hover:text-slate-400 transition-colors p-1" title="Dismiss">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
