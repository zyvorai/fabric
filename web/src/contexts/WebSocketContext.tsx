import { createContext, useContext, ReactNode, useState } from 'react'
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
  const [subscribers, setSubscribers] = useState<Set<(message: WebSocketMessage) => void>>(new Set())

  // Determine WebSocket URL based on current location
  const wsUrl = `ws://${window.location.hostname}:8080/ws/events`

  const handleMessage = (message: WebSocketMessage) => {
    // Notify all subscribers
    subscribers.forEach((callback) => callback(message))

    // Update VM state cache
    switch (message.type) {
      case 'vm_state_changed':
        setVmUpdates((prev) => {
          const updated = new Map(prev)
          updated.set(message.data.name, {
            state: message.data.state,
          })
          return updated
        })
        break

      case 'vm_metrics':
        setVmUpdates((prev) => {
          const updated = new Map(prev)
          updated.set(message.data.name, {
            ...prev.get(message.data.name),
            ...message.data.metrics,
          })
          return updated
        })
        break

      case 'vm_deleted':
        setVmUpdates((prev) => {
          const updated = new Map(prev)
          updated.delete(message.data.name)
          return updated
        })
        break
    }
  }

  const { isConnected } = useWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
    onOpen: () => console.log('Connected to vmspawnd events'),
    onClose: () => console.log('Disconnected from vmspawnd events'),
    reconnect: true,
    reconnectInterval: 3000,
  })

  const subscribe = (callback: (message: WebSocketMessage) => void) => {
    setSubscribers((prev) => new Set(prev).add(callback))

    // Return unsubscribe function
    return () => {
      setSubscribers((prev) => {
        const updated = new Set(prev)
        updated.delete(callback)
        return updated
      })
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
