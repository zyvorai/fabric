// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useEffect, useRef } from 'react'

interface VNCViewerProps {
  vmName: string
}

export default function VNCViewer({ vmName }: VNCViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    // Connect to VNC WebSocket proxy
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/vnc/${vmName}`
    const ws = new WebSocket(wsUrl)

    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      // Connection established
    }

    ws.onmessage = () => {
      // Handle VNC protocol data
      // For production, integrate noVNC library here
    }

    ws.onerror = () => {
      // WebSocket error
    }

    ws.onclose = () => {
      // Connection closed
    }

    wsRef.current = ws

    return () => {
      ws.close()
    }
  }, [vmName])

  return (
    <div className="bg-black rounded flex items-center justify-center" style={{ minHeight: '500px' }}>
      <canvas ref={canvasRef} className="border border-slate-700/50" />
      <div className="absolute text-slate-500">
        VNC Viewer (integrate noVNC for full functionality)
      </div>
    </div>
  )
}
