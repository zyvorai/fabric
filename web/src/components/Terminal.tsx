// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { getToken } from '../api/client'

interface TerminalProps {
  vmName: string
}

export default function Terminal({ vmName }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!terminalRef.current) return

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
  }, [vmName])

  return (
    <div
      ref={terminalRef}
      className="w-full h-full bg-black rounded"
      style={{ minHeight: '500px' }}
    />
  )
}
