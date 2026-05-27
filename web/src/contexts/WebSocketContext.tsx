// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { createContext, useContext, ReactNode, useState, useRef } from 'react'
import { useWebSocket, WebSocketMessage } from '../hooks/useWebSocket'
import { VM } from '../api/vm'

interface WebSocketContextType {
  isConnected: boolean
  vmUpdates: Map<string, Partial<VM>>
  subscribe: (callback: (message: WebSocketMessage) => void) => () => void
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined)

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [vmUpdates, setVmUpdates] = useState<Map<string, Partial<VM>>>(new Map())
  const subscribersRef = useRef<Set<(message: WebSocketMessage) => void>>(new Set())

  // Determine WebSocket URL - use API_WS_URL env var if set, otherwise derive from current location
  const wsUrl = import.meta.env.VITE_WS_URL
    || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/events`

  const handleMessage = (message: WebSocketMessage) => {
    // Notify all subscribers
    subscribersRef.current.forEach((callback) => callback(message))

    const data = message.data as Record<string, string | Record<string, unknown>>
    const vmName = data.name as string

    // Update VM state cache
    switch (message.type) {
      case 'vm_state_changed':
        if (vmName) {
          setVmUpdates((prev) => {
            const updated = new Map(prev)
            updated.set(vmName, {
              state: data.state as string,
            } as Partial<VM>)
            return updated
          })
        }
        break

      case 'vm_metrics':
        if (vmName) {
          setVmUpdates((prev) => {
            const updated = new Map(prev)
            const metrics = (data.metrics || {}) as Record<string, unknown>
            updated.set(vmName, {
              ...prev.get(vmName),
              ...metrics,
            } as Partial<VM>)
            return updated
          })
        }
        break

      case 'vm_deleted':
        if (vmName) {
          setVmUpdates((prev) => {
            const updated = new Map(prev)
            updated.delete(vmName)
            return updated
          })
        }
        break
    }
  }

  const { isConnected } = useWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
    reconnect: true,
    reconnectInterval: 3000,
  })

  const subscribe = (callback: (message: WebSocketMessage) => void) => {
    subscribersRef.current.add(callback)

    // Return unsubscribe function
    return () => {
      subscribersRef.current.delete(callback)
    }
  }

  return (
    <WebSocketContext.Provider value={{ isConnected, vmUpdates, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  )
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocketContext must be used within WebSocketProvider')
  }
  return context
}
