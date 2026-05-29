// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useTheme, type AppTheme } from '../contexts/ThemeContext'
import { Wifi, WifiOff } from 'lucide-react'
import { useWebSocketContext } from '../contexts/WebSocketContext'
import { ZYVOR_FABRIC_DAEMON, ZYVOR_FABRIC_HELP } from '../config/zyvorHelp'

function statusClasses(theme: AppTheme, isLive: boolean): string {
  if (theme === 'steel') {
    return isLive
      ? 'bg-[rgba(72,187,120,0.08)] text-[#8fd4a8] border-[rgba(140,160,190,0.25)]'
      : 'bg-[rgba(220,80,80,0.08)] text-[#d49090] border-[rgba(140,160,190,0.25)]'
  }
  if (theme === 'aurora') {
    return isLive
      ? 'bg-emerald-500/10 text-emerald-300 border-[rgba(167,139,250,0.28)]'
      : 'bg-red-500/10 text-red-300 border-[rgba(167,139,250,0.28)]'
  }
  return isLive
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : 'bg-red-500/10 text-red-400 border-red-500/20'
}

function dotClasses(theme: AppTheme, isLive: boolean): string {
  if (theme === 'steel') {
    return isLive ? 'bg-[#6fcf97] animate-pulse-dot' : 'bg-[#c07070]'
  }
  if (theme === 'aurora') {
    return isLive ? 'bg-emerald-400 animate-pulse-dot' : 'bg-red-400'
  }
  return isLive ? 'bg-emerald-400 animate-pulse-dot' : 'bg-red-400'
}

export default function ConnectionStatus() {
  const { theme } = useTheme()
  const { isConnected } = useWebSocketContext()
  const isLive = isConnected

  const title = isLive
    ? 'Real-time VM updates connected (/api/events/stream)'
    : `Real-time updates unavailable — check ${ZYVOR_FABRIC_HELP.name} (${ZYVOR_FABRIC_DAEMON}) and your session`

  const ariaLabel = isLive
    ? 'Live: real-time updates connected'
    : 'Offline: real-time updates unavailable'

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      title={title}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${statusClasses(theme, isLive)}`}
    >
      {isLive ? (
        <>
          <div className={`w-1.5 h-1.5 rounded-full ${dotClasses(theme, true)}`} />
          <Wifi className="w-3 h-3 shrink-0" aria-hidden />
          <span className="whitespace-nowrap max-xl:sr-only">Live</span>
        </>
      ) : (
        <>
          <div className={`w-1.5 h-1.5 rounded-full ${dotClasses(theme, false)}`} />
          <WifiOff className="w-3 h-3 shrink-0" aria-hidden />
          <span className="whitespace-nowrap max-xl:sr-only">Offline</span>
        </>
      )}
    </div>
  )
}
