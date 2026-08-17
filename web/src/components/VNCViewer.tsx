// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useEffect, useRef, useState } from 'react'
import RFB from '@novnc/novnc'
import { getToken } from '../api/client'

interface VNCViewerProps {
  vmName: string
}

type Status = 'connecting' | 'connected' | 'disconnected' | 'error'

export default function VNCViewer({ vmName }: VNCViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<InstanceType<typeof RFB> | null>(null)
  const [status, setStatus] = useState<Status>('connecting')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = getToken()
    const wsUrl = `${protocol}//${window.location.host}/ws/vnc/${vmName}${token ? `?token=${encodeURIComponent(token)}` : ''}`

    setStatus('connecting')
    setErrorMsg(null)

    const rfb = new RFB(containerRef.current, wsUrl)
    rfb.scaleViewport = true
    rfb.clipViewport = false
    rfb.resizeSession = false

    const onConnect = () => setStatus('connected')
    const onDisconnect = (e: CustomEvent<{ clean: boolean }>) => {
      setStatus('disconnected')
      if (!e.detail.clean) setErrorMsg('Connection lost')
    }
    const onSecurityFailure = (e: CustomEvent<{ reason?: string }>) => {
      setStatus('error')
      setErrorMsg(e.detail.reason || 'Security negotiation failed')
    }

    rfb.addEventListener('connect', onConnect)
    rfb.addEventListener('disconnect', onDisconnect as EventListener)
    rfb.addEventListener('securityfailure', onSecurityFailure as EventListener)

    rfbRef.current = rfb

    return () => {
      rfb.removeEventListener('connect', onConnect)
      rfb.removeEventListener('disconnect', onDisconnect as EventListener)
      rfb.removeEventListener('securityfailure', onSecurityFailure as EventListener)
      rfb.disconnect()
      rfbRef.current = null
    }
  }, [vmName])

  return (
    <div className="relative bg-black rounded overflow-hidden" style={{ minHeight: '500px' }}>
      <div ref={containerRef} className="w-full" style={{ minHeight: '500px' }} />
      {status !== 'connected' && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm pointer-events-none">
          {status === 'connecting' && 'Connecting…'}
          {status === 'disconnected' && (errorMsg || 'Disconnected')}
          {status === 'error' && (errorMsg || 'Connection failed')}
        </div>
      )}
      {status === 'connected' && (
        // A black canvas alone is indistinguishable from a dead connection
        // -- the guest's VGA framebuffer stays blank on any image whose
        // console output goes entirely to a serial tty, which is common.
        // This badge is the only signal the socket is actually live.
        <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded bg-black/60 text-emerald-400 text-xs pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Connected
        </div>
      )}
    </div>
  )
}
