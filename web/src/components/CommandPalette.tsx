import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router'
import { Search, ArrowRight, Server, Plus, Home, Terminal, Network, HardDrive, Settings, BarChart3, FileText, Bell, Calendar, Shield, RotateCw, Play, Square, Cpu } from 'lucide-react'
import { listVMs, startVM, stopVM, VM } from '../api/vm'

interface Command {
  id: string
  label: string
  description?: string
  action: () => void
  category: string
  keywords?: string[]
  icon?: React.ReactNode
}

export default function CommandPalette() {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [vms, setVMs] = useState<VM[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const loadVMs = useCallback(async () => {
    try {
      const data = await listVMs()
      setVMs(data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadVMs()
      // Focus input after animation
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen, loadVMs])

  const close = () => {
    setIsOpen(false)
    setQuery('')
    setSelectedIndex(0)
  }

  const execute = (cmd: Command) => {
    cmd.action()
    close()
  }

  // Build commands list including dynamic VM commands
  const staticCommands: Command[] = [
    // Navigation
    { id: 'nav-dashboard', label: 'Dashboard', icon: <Home className="w-4 h-4" />, action: () => navigate('/'), category: 'Navigation', keywords: ['home', 'overview'] },
    { id: 'nav-vms', label: 'Virtual Machines', icon: <Server className="w-4 h-4" />, action: () => navigate('/vms'), category: 'Navigation', keywords: ['vm', 'list'] },
    { id: 'nav-create', label: 'Create VM', icon: <Plus className="w-4 h-4" />, action: () => navigate('/create'), category: 'Navigation', keywords: ['new', 'add', 'launch'] },
    { id: 'nav-network', label: 'Network', icon: <Network className="w-4 h-4" />, action: () => navigate('/network'), category: 'Navigation', keywords: ['bridge', 'vlan', 'bond'] },
    { id: 'nav-storage', label: 'Storage', icon: <HardDrive className="w-4 h-4" />, action: () => navigate('/storage'), category: 'Navigation', keywords: ['disk', 'volume'] },
    { id: 'nav-logs', label: 'Logs', icon: <Terminal className="w-4 h-4" />, action: () => navigate('/logs'), category: 'Navigation', keywords: ['log', 'events', 'journal'] },
    { id: 'nav-analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" />, action: () => navigate('/analytics'), category: 'Navigation', keywords: ['metrics', 'performance'] },
    { id: 'nav-audit', label: 'Audit Logs', icon: <FileText className="w-4 h-4" />, action: () => navigate('/audit'), category: 'Navigation', keywords: ['audit', 'security'] },
    { id: 'nav-notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" />, action: () => navigate('/notifications'), category: 'Navigation', keywords: ['alerts'] },
    { id: 'nav-schedules', label: 'Schedules', icon: <Calendar className="w-4 h-4" />, action: () => navigate('/schedules'), category: 'Navigation', keywords: ['cron', 'automation'] },
    { id: 'nav-system', label: 'System Resources', icon: <Cpu className="w-4 h-4" />, action: () => navigate('/system'), category: 'Navigation', keywords: ['cpu', 'numa', 'hugepages'] },
    { id: 'nav-security', label: 'Network Security', icon: <Shield className="w-4 h-4" />, action: () => navigate('/network-security'), category: 'Navigation', keywords: ['firewall', 'dns', 'vpn'] },
    { id: 'nav-settings', label: 'Settings', icon: <Settings className="w-4 h-4" />, action: () => navigate('/settings'), category: 'Navigation', keywords: ['config', 'preferences'] },

    // Actions
    { id: 'action-refresh', label: 'Refresh Page', icon: <RotateCw className="w-4 h-4" />, action: () => window.location.reload(), category: 'Actions', keywords: ['reload'] },
  ]

  // Dynamic VM commands
  const vmCommands: Command[] = vms.flatMap((vm) => {
    const cmds: Command[] = [
      {
        id: `vm-view-${vm.name}`,
        label: `View ${vm.name}`,
        description: `${vm.state} - ${vm.cpus} vCPUs, ${vm.memory} MB`,
        icon: <Server className="w-4 h-4" />,
        action: () => navigate(`/vms/${vm.name}`),
        category: 'Virtual Machines',
        keywords: [vm.name, 'details'],
      },
      {
        id: `vm-console-${vm.name}`,
        label: `Console: ${vm.name}`,
        icon: <Terminal className="w-4 h-4" />,
        action: () => navigate(`/vms/${vm.name}/console`),
        category: 'Virtual Machines',
        keywords: [vm.name, 'terminal', 'shell'],
      },
    ]

    if (vm.state === 'stopped') {
      cmds.push({
        id: `vm-start-${vm.name}`,
        label: `Start ${vm.name}`,
        icon: <Play className="w-4 h-4" />,
        action: () => { startVM(vm.name) },
        category: 'VM Actions',
        keywords: [vm.name, 'boot', 'power on'],
      })
    }

    if (vm.state === 'running') {
      cmds.push({
        id: `vm-stop-${vm.name}`,
        label: `Stop ${vm.name}`,
        icon: <Square className="w-4 h-4" />,
        action: () => { stopVM(vm.name) },
        category: 'VM Actions',
        keywords: [vm.name, 'shutdown', 'power off'],
      })
    }

    return cmds
  })

  const commands = [...staticCommands, ...vmCommands]

  const fuzzyMatch = (text: string, pattern: string): number => {
    const t = text.toLowerCase()
    const p = pattern.toLowerCase()
    if (t.includes(p)) return 100
    let score = 0
    let pi = 0
    let consecutive = 0
    for (let ti = 0; ti < t.length && pi < p.length; ti++) {
      if (t[ti] === p[pi]) {
        score += 10
        consecutive++
        score += consecutive * 5
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
          const q = query.toLowerCase()
          const labelScore = fuzzyMatch(cmd.label, q)
          const keywordScore = Math.max(...(cmd.keywords?.map((k) => fuzzyMatch(k, q)) || [0]))
          const descScore = cmd.description ? fuzzyMatch(cmd.description, q) : 0
          const score = Math.max(labelScore, keywordScore, descScore)
          return { cmd, score }
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ cmd }) => cmd)
    : commands

  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = []
    acc[cmd.category].push(cmd)
    return acc
  }, {} as Record<string, Command[]>)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
        setQuery('')
        setSelectedIndex(0)
        return
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        close()
        return
      }
      if (isOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
        } else if (e.key === 'Enter') {
          e.preventDefault()
          const cmd = filteredCommands[selectedIndex]
          if (cmd) execute(cmd)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, filteredCommands, selectedIndex])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.querySelector('[data-selected="true"]')
    selected?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!isOpen) return null

  let cmdIndex = 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={close}
    >
      <div
        className="bg-slate-900 rounded-xl shadow-2xl border border-slate-700/50 w-full max-w-xl max-h-[420px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/50">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands, VMs, pages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-slate-500"
            autoFocus
          />
          <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700/50 rounded text-[10px] text-slate-500 font-mono shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto max-h-[320px] sidebar-scroll">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-slate-500">No results for "{query}"</p>
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <div key={category}>
                <div className="px-4 py-1.5 text-[10px] font-semibold text-slate-600 uppercase tracking-wider sticky top-0 bg-slate-900">
                  {category}
                </div>
                {cmds.map((cmd) => {
                  const isSelected = cmdIndex === selectedIndex
                  const currentIndex = cmdIndex
                  cmdIndex++
                  return (
                    <button
                      key={cmd.id}
                      data-selected={isSelected}
                      onClick={() => execute(cmd)}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                        isSelected ? 'bg-blue-600/10 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {cmd.icon && (
                        <span className={`shrink-0 ${isSelected ? 'text-blue-400' : 'text-slate-600'}`}>
                          {cmd.icon}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{cmd.label}</div>
                        {cmd.description && (
                          <div className="text-[11px] text-slate-600 truncate">{cmd.description}</div>
                        )}
                      </div>
                      {isSelected && <ArrowRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-700/50 text-[10px] text-slate-600">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-slate-800 border border-slate-700/50 rounded font-mono">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-slate-800 border border-slate-700/50 rounded font-mono">↵</kbd>
            select
          </span>
          <span className="ml-auto">{filteredCommands.length} results</span>
        </div>
      </div>
    </div>
  )
}
