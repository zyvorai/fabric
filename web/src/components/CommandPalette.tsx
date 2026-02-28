import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Search, ChevronRight } from 'lucide-react'

interface Command {
  id: string
  label: string
  description?: string
  action: () => void
  category: string
  keywords?: string[]
}

export default function CommandPalette() {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const commands: Command[] = [
    // Navigation
    { id: 'nav-dashboard', label: 'Go to Dashboard', action: () => navigate('/'), category: 'Navigation', keywords: ['home'] },
    { id: 'nav-vms', label: 'Go to Virtual Machines', action: () => navigate('/vms'), category: 'Navigation', keywords: ['vm', 'list'] },
    { id: 'nav-logs', label: 'Go to Logs', action: () => navigate('/logs'), category: 'Navigation', keywords: ['log', 'events'] },
    { id: 'nav-network', label: 'Go to Network', action: () => navigate('/network'), category: 'Navigation', keywords: ['bridge', 'vlan'] },
    { id: 'nav-storage', label: 'Go to Storage', action: () => navigate('/storage'), category: 'Navigation', keywords: ['disk', 'pool', 'volume'] },
    { id: 'nav-templates', label: 'Go to Templates', action: () => navigate('/templates'), category: 'Navigation', keywords: ['template'] },
    { id: 'nav-quotas', label: 'Go to Quotas', action: () => navigate('/quotas'), category: 'Navigation', keywords: ['quota', 'limit', 'resource'] },
    { id: 'nav-schedules', label: 'Go to Schedules', action: () => navigate('/schedules'), category: 'Navigation', keywords: ['schedule', 'automation', 'cron'] },
    { id: 'nav-audit', label: 'Go to Audit Logs', action: () => navigate('/audit'), category: 'Navigation', keywords: ['audit', 'security', 'compliance', 'logs'] },
    { id: 'nav-analytics', label: 'Go to Analytics', action: () => navigate('/analytics'), category: 'Navigation', keywords: ['analytics', 'performance', 'metrics', 'insights'] },
    { id: 'nav-backups', label: 'Go to Backups', action: () => navigate('/backups'), category: 'Navigation', keywords: ['backup', 'restore', 'recovery'] },
    { id: 'nav-notifications', label: 'Go to Notifications', action: () => navigate('/notifications'), category: 'Navigation', keywords: ['notifications', 'alerts', 'email', 'slack'] },
    { id: 'nav-storage-pools', label: 'Go to Storage Pools', action: () => navigate('/storage-pools'), category: 'Navigation', keywords: ['storage', 'pools', 'nfs', 'local'] },
    { id: 'nav-system', label: 'Go to System Resources', action: () => navigate('/system'), category: 'Navigation', keywords: ['system', 'cpu', 'numa', 'memory', 'hugepages', 'topology'] },
    { id: 'nav-settings', label: 'Go to Settings', action: () => navigate('/settings'), category: 'Navigation', keywords: ['config', 'preferences'] },

    // Actions
    { id: 'action-create-vm', label: 'Create New VM', action: () => navigate('/create'), category: 'Actions', keywords: ['new', 'add'] },
    { id: 'action-refresh', label: 'Refresh Page', action: () => window.location.reload(), category: 'Actions', keywords: ['reload'] },
    { id: 'action-help', label: 'Show Keyboard Shortcuts', action: () => {}, category: 'Actions', keywords: ['?', 'shortcuts', 'keys'] },

    // Quick VM Actions (examples - in real app, would be dynamic based on VMs)
    { id: 'vm-search', label: 'Search VMs', action: () => { navigate('/vms'); setTimeout(() => (document.querySelector('input[type="text"]') as HTMLElement)?.focus(), 100) }, category: 'VMs', keywords: ['find', 'filter'] },
    { id: 'vm-tags', label: 'Filter VMs by Tags', action: () => navigate('/vms'), category: 'VMs', keywords: ['tag', 'label', 'organize'] },
  ]

  const fuzzyMatch = (text: string, pattern: string): number => {
    const t = text.toLowerCase()
    const p = pattern.toLowerCase()

    // Exact substring match gets high score
    if (t.includes(p)) return 100

    // Fuzzy match: all pattern chars must appear in order
    let score = 0
    let pi = 0
    let consecutive = 0

    for (let ti = 0; ti < t.length && pi < p.length; ti++) {
      if (t[ti] === p[pi]) {
        score += 10
        consecutive++
        score += consecutive * 5 // Bonus for consecutive chars
        // Bonus for matching at word boundaries
        if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '-' || t[ti - 1] === '_') {
          score += 15
        }
        pi++
      } else {
        consecutive = 0
      }
    }

    return pi === p.length ? score : 0
  }

  const filteredCommands = query
    ? commands
        .map((cmd) => {
          const searchStr = query.toLowerCase()
          const labelScore = fuzzyMatch(cmd.label, searchStr)
          const keywordScore = Math.max(
            ...(cmd.keywords?.map((k) => fuzzyMatch(k, searchStr)) || [0])
          )
          const categoryScore = fuzzyMatch(cmd.category, searchStr)
          const score = Math.max(labelScore, keywordScore, categoryScore)
          return { cmd, score }
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ cmd }) => cmd)
    : commands

  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) {
      acc[cmd.category] = []
    }
    acc[cmd.category].push(cmd)
    return acc
  }, {} as Record<string, Command[]>)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K to toggle
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
        setQuery('')
        setSelectedIndex(0)
        return
      }

      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        setIsOpen(false)
        setQuery('')
        setSelectedIndex(0)
        return
      }

      // Arrow navigation
      if (isOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % filteredCommands.length)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length)
        } else if (e.key === 'Enter') {
          e.preventDefault()
          const cmd = filteredCommands[selectedIndex]
          if (cmd) {
            cmd.action()
            setIsOpen(false)
            setQuery('')
            setSelectedIndex(0)
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredCommands, selectedIndex])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  if (!isOpen) return null

  let cmdIndex = 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-2xl max-h-[600px] overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-700">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-400"
            autoFocus
          />
          <kbd className="px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-400">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto max-h-[500px]">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No commands found for "{query}"
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <div key={category} className="border-b border-gray-700 last:border-b-0">
                <div className="px-4 py-2 bg-gray-750 text-xs font-semibold text-gray-400 uppercase">
                  {category}
                </div>
                <div>
                  {cmds.map((cmd) => {
                    const isSelected = cmdIndex === selectedIndex
                    cmdIndex++
                    return (
                      <button
                        key={cmd.id}
                        onClick={() => {
                          cmd.action()
                          setIsOpen(false)
                          setQuery('')
                          setSelectedIndex(0)
                        }}
                        className={`w-full flex items-center justify-between p-3 hover:bg-gray-700 transition ${
                          isSelected ? 'bg-gray-700' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <div className="text-sm font-medium text-white text-left">
                              {cmd.label}
                            </div>
                            {cmd.description && (
                              <div className="text-xs text-gray-400 text-left">
                                {cmd.description}
                              </div>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-3 border-t border-gray-700 bg-gray-750 text-xs text-gray-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs">↵</kbd>
              Select
            </span>
          </div>
          <span>
            Press{' '}
            <kbd className="px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs">
              {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+K
            </kbd>{' '}
            to toggle
          </span>
        </div>
      </div>
    </div>
  )
}
