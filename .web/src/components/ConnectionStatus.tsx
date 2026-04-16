import { Wifi, WifiOff } from 'lucide-react'
import { useWebSocketContext } from '../contexts/WebSocketContext'

export default function ConnectionStatus() {
  const { isConnected } = useWebSocketContext()

  return (
    <div className="flex items-center gap-2">
      {isConnected ? (
        <>
          <Wifi className="w-4 h-4 text-green-400" />
          <span className="text-sm text-green-400">Live</span>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4 text-red-400" />
          <span className="text-sm text-red-400">Disconnected</span>
        </>
      )}
    </div>
  )
}
