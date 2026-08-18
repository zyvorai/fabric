// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { getToken } from '../api/client'
import { RotateCw } from 'lucide-react'

interface TerminalProps {
  vmName: string
}

type Status = 'connecting' | 'connected' | 'disconnected'

export default function Terminal({ vmName }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<Status>('connecting')
  const [connectAttempt, setConnectAttempt] = useState(0)

  useEffect(() => {
    if (!terminalRef.current) return
    setStatus('connecting')
    terminalRef.current.replaceChildren()

    // Create terminal
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#000000',
        foreground: '#ffffff',
      },
    })

    term.open(terminalRef.current)
    xtermRef.current = term

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = getToken()
    const wsUrl = `${protocol}//${window.location.host}/ws/console/${vmName}${token ? `?token=${encodeURIComponent(token)}` : ''}`
    const ws = new WebSocket(wsUrl)
    // The backend streams raw PTY bytes as binary frames (not guaranteed
    // valid UTF-8) — without this, event.data below is a Blob, which
    // xterm's write() silently ignores, so nothing ever renders.
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      setStatus('connected')
      term.write('Connected to VM console\r\n')
    }

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data))
      } else {
        term.write(event.data)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      term.write('\r\nWebSocket error\r\n')
    }

    ws.onclose = () => {
      setStatus('disconnected')
      term.write('\r\nConnection closed\r\n')
    }

    // Send data from terminal to WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    wsRef.current = ws

    // Cleanup
    return () => {
      ws.close()
      term.dispose()
    }
  }, [vmName, connectAttempt])

  const statusMeta: Record<Status, { label: string; dot: string; text: string }> = {
    connecting: { label: 'Connecting…', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-400' },
    connected: { label: 'Connected', dot: 'bg-emerald-400', text: 'text-emerald-400' },
    disconnected: { label: 'Disconnected', dot: 'bg-slate-500', text: 'text-slate-400' },
  }
  const meta = statusMeta[status]

  return (
    <div className="relative rounded-xl border border-slate-700/50 overflow-hidden bg-gradient-to-b from-slate-900 to-black">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10 bg-slate-900/70">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
          <span className={`text-xs font-medium ${meta.text}`}>{meta.label}</span>
        </div>
        {status === 'disconnected' && (
          <button
            type="button"
            onClick={() => setConnectAttempt((n) => n + 1)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
            Reconnect
          </button>
        )}
      </div>
      <div
        ref={terminalRef}
        className="w-full p-2"
        style={{ minHeight: '500px' }}
      />
    </div>
  )
}
