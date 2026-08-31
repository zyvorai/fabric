// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { Wifi, WifiOff } from 'lucide-react'
import { useWebSocketContext } from '../contexts/WebSocketContext'
import { ZYVOR_FABRIC_DAEMON, ZYVOR_FABRIC_HELP } from '../config/zyvorHelp'

export default function ConnectionStatus() {
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
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
        isLive
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-red-50 text-red-700 border-red-200'
      }`}
    >
      {isLive ? (
        <>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
          <Wifi className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <span className="whitespace-nowrap max-xl:sr-only">Live</span>
        </>
      ) : (
        <>
          <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <span className="whitespace-nowrap max-xl:sr-only">Offline</span>
        </>
      )}
    </div>
  )
}
