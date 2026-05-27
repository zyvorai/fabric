// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

interface StatusBadgeProps {
  status: string
  variant?: 'dot' | 'pill'
}

const statusStyles: Record<string, string> = {
  running: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  active: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  enabled: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  healthy: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  completed: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  success: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  stopped: 'text-red-400 bg-red-400/10 border-red-400/20',
  failed: 'text-red-400 bg-red-400/10 border-red-400/20',
  error: 'text-red-400 bg-red-400/10 border-red-400/20',
  disabled: 'text-red-400 bg-red-400/10 border-red-400/20',
  paused: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  warning: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  pending: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  unknown: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
}

const dotColors: Record<string, string> = {
  running: 'bg-emerald-400',
  active: 'bg-emerald-400',
  enabled: 'bg-emerald-400',
  healthy: 'bg-emerald-400',
  completed: 'bg-emerald-400',
  success: 'bg-emerald-400',
  stopped: 'bg-red-400',
  failed: 'bg-red-400',
  error: 'bg-red-400',
  disabled: 'bg-red-400',
  paused: 'bg-yellow-400',
  warning: 'bg-yellow-400',
  pending: 'bg-yellow-400',
  unknown: 'bg-slate-400',
}

const isRunning = (s: string) => ['running', 'active', 'enabled', 'healthy'].includes(s.toLowerCase())

export function StatusBadge({ status, variant = 'pill' }: StatusBadgeProps) {
  const key = status.toLowerCase()
  const style = statusStyles[key] || statusStyles.unknown
  const pulse = isRunning(key)

  if (variant === 'dot') {
    const dot = dotColors[key] || dotColors.unknown
    return (
      <span className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          {pulse && <span className={`absolute inset-0 rounded-full ${dot} opacity-40 animate-ping`} />}
          <span className={`relative w-2 h-2 rounded-full ${dot}`} />
        </span>
        <span className="capitalize">{status}</span>
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium capitalize border ${style}`}>
      <span className="relative flex h-1.5 w-1.5">
        {pulse && <span className={`absolute inset-0 rounded-full ${dotColors[key] || dotColors.unknown} opacity-40 animate-ping`} />}
        <span className={`relative w-1.5 h-1.5 rounded-full ${dotColors[key] || dotColors.unknown}`} />
      </span>
      {status}
    </span>
  )
}
