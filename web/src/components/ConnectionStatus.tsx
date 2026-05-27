// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { Wifi, WifiOff } from 'lucide-react'
import { useWebSocketContext } from '../contexts/WebSocketContext'

export default function ConnectionStatus() {
  const { isConnected } = useWebSocketContext()
  const isLive = isConnected

  const title = isLive
    ? 'Real-time VM updates connected (/ws/events)'
    : 'Real-time updates unavailable — check vmspawnd and WebSocket proxy settings'

  const ariaLabel = isLive
    ? 'Live: real-time updates connected'
    : 'Offline: real-time updates unavailable'

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      title={title}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
        isLive
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          : 'bg-red-500/10 text-red-400 border-red-500/20'
      }`}
    >
      {isLive ? (
        <>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
          <Wifi className="w-3 h-3 shrink-0" aria-hidden />
          <span className="whitespace-nowrap max-[520px]:sr-only">Live</span>
        </>
      ) : (
        <>
          <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
          <WifiOff className="w-3 h-3 shrink-0" aria-hidden />
          <span className="whitespace-nowrap max-[520px]:sr-only">Offline</span>
        </>
      )}
    </div>
  )
}
