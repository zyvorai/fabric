import { useEffect, useState } from 'react'
import { Terminal, Filter, Download, Trash2 } from 'lucide-react'

interface LogEntry {
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
  source: string
  message: string
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState<string>('ALL')
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    loadLogs()
    const interval = setInterval(loadLogs, 2000) // More frequent for logs
    return () => clearInterval(interval)
  }, [])

  const loadLogs = () => {
    // Simulate log loading - in real app, fetch from WebSocket or API
    const newLog: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      level: ['INFO', 'WARN', 'ERROR', 'DEBUG'][Math.floor(Math.random() * 4)] as any,
      source: ['vmspawnd', 'systemd', 'qemu', 'network'][Math.floor(Math.random() * 4)],
      message: [
        'VM web-server-01 started successfully',
        'High memory usage detected on db-server',
        'Network bridge br0 configured',
        'Failed to connect to storage backend',
        'VM backup completed successfully',
        'TPM initialization complete',
      ][Math.floor(Math.random() * 6)],
    }
    setLogs(prev => [...prev.slice(-99), newLog]) // Keep last 100 logs
  }

  const filteredLogs = logs.filter(log => {
    const matchesText = log.message.toLowerCase().includes(filter.toLowerCase()) ||
                        log.source.toLowerCase().includes(filter.toLowerCase())
    const matchesLevel = levelFilter === 'ALL' || log.level === levelFilter
    return matchesText && matchesLevel
  })

  const clearLogs = () => {
    setLogs([])
  }

  const exportLogs = () => {
    const content = filteredLogs.map(log =>
      `[${log.timestamp}] ${log.level.padEnd(5)} ${log.source.padEnd(10)} ${log.message}`
    ).join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vmspawnd-logs-${new Date().toISOString()}.txt`
    a.click()
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'INFO': return 'text-cyan-400'
      case 'WARN': return 'text-yellow-400'
      case 'ERROR': return 'text-red-400'
      case 'DEBUG': return 'text-gray-400'
      default: return 'text-white'
    }
  }

  const getLevelBg = (level: string) => {
    switch (level) {
      case 'INFO': return 'bg-cyan-500/10 border-cyan-500/20'
      case 'WARN': return 'bg-yellow-500/10 border-yellow-500/20'
      case 'ERROR': return 'bg-red-500/10 border-red-500/20'
      case 'DEBUG': return 'bg-gray-500/10 border-gray-500/20'
      default: return 'bg-gray-700'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Terminal className="w-8 h-8" />
          System Logs
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">{filteredLogs.length} entries</span>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Filter logs..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 pl-10 pr-4 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Level Filter */}
          <div>
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Levels</option>
              <option value="INFO">INFO</option>
              <option value="WARN">WARN</option>
              <option value="ERROR">ERROR</option>
              <option value="DEBUG">DEBUG</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={exportLogs}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={clearLogs}
              className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Auto-scroll toggle */}
        <div className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            id="autoScroll"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
          />
          <label htmlFor="autoScroll" className="text-sm text-gray-400">
            Auto-scroll to new logs
          </label>
        </div>
      </div>

      {/* Log Stream */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="h-[600px] overflow-y-auto font-mono text-sm" id="log-container">
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              No logs to display
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {filteredLogs.map((log, index) => (
                <div
                  key={index}
                  className={`p-3 hover:bg-gray-700 transition ${getLevelBg(log.level)} border-l-4`}
                >
                  <div className="flex items-start gap-4">
                    <span className="text-gray-500 text-xs whitespace-nowrap">
                      {log.timestamp}
                    </span>
                    <span className={`font-bold text-xs whitespace-nowrap ${getLevelColor(log.level)}`}>
                      {log.level}
                    </span>
                    <span className="text-gray-400 text-xs whitespace-nowrap">
                      [{log.source}]
                    </span>
                    <span className="text-gray-200 flex-1">
                      {log.message}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
