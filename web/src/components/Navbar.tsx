import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import {
  Server, Plus, Home, Terminal, Network, HardDrive, Settings,
  Layers, Shield, Calendar, FileText, BarChart3, Save, Bell,
  Database, Cpu, Menu, X, ChevronDown, Building2, GitBranch,
  Zap, Lock, RefreshCw, Archive, Key, Activity, PackageCheck, Camera,
  ArrowRightLeft, Package, Monitor, LogOut, User, Sun, Moon, Search,
  AlertTriangle, Bug, HelpCircle, Clock, Globe, DollarSign,
  HeartPulse, Container, Inbox, Star, Upload, Download, Disc, Workflow,
  CheckCircle, FileUp, Map, TrendingUp, Users, Radio,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useWebSocketContext } from '../contexts/WebSocketContext'

interface NavGroup {
  label: string
  items: NavItem[]
}

interface NavItem {
  to: string
  icon: React.ReactNode
  label: string
}

const navGroups: NavGroup[] = [
  {
    label: 'Core',
    items: [
      { to: '/', icon: <Home className="w-4 h-4 text-blue-400" />, label: 'Dashboard' },
      { to: '/favorites', icon: <Star className="w-4 h-4 text-yellow-400" />, label: 'Favorites' },
      { to: '/vms', icon: <Server className="w-4 h-4 text-sky-400" />, label: 'Virtual Machines' },
      { to: '/machines', icon: <Monitor className="w-4 h-4 text-cyan-400" />, label: 'Machines' },
      { to: '/profiles', icon: <Layers className="w-4 h-4 text-purple-400" />, label: 'Profiles' },
      { to: '/datacenters', icon: <Building2 className="w-4 h-4 text-amber-400" />, label: 'Datacenters' },
      { to: '/vm-browser', icon: <Monitor className="w-4 h-4 text-sky-400" />, label: 'VM Browser' },
      { to: '/vm-wizard', icon: <Plus className="w-4 h-4 text-green-400" />, label: 'VM Wizard' },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { to: '/network', icon: <Network className="w-4 h-4 text-teal-400" />, label: 'Network' },
      { to: '/network-security', icon: <Shield className="w-4 h-4 text-red-400" />, label: 'Net Security' },
      { to: '/storage', icon: <HardDrive className="w-4 h-4 text-violet-400" />, label: 'Storage' },
      { to: '/storage-pools', icon: <Database className="w-4 h-4 text-blue-400" />, label: 'Storage Pools' },
      { to: '/distributed-storage', icon: <Database className="w-4 h-4 text-indigo-400" />, label: 'Distributed Storage' },
      { to: '/resource-pools', icon: <Layers className="w-4 h-4 text-orange-400" />, label: 'Resource Pools' },
      { to: '/system', icon: <Cpu className="w-4 h-4 text-green-400" />, label: 'System' },
      { to: '/system-health', icon: <HeartPulse className="w-4 h-4 text-pink-400" />, label: 'System Health' },
      { to: '/containers', icon: <Container className="w-4 h-4 text-cyan-400" />, label: 'Containers' },
    ],
  },
  {
    label: 'Cluster',
    items: [
      { to: '/drs', icon: <GitBranch className="w-4 h-4 text-emerald-400" />, label: 'DRS' },
      { to: '/fault-tolerance', icon: <Zap className="w-4 h-4 text-yellow-400" />, label: 'Fault Tolerance' },
      { to: '/replication', icon: <RefreshCw className="w-4 h-4 text-cyan-400" />, label: 'Replication' },
      { to: '/site-recovery', icon: <Activity className="w-4 h-4 text-rose-400" />, label: 'Site Recovery' },
      { to: '/migrations', icon: <ArrowRightLeft className="w-4 h-4 text-green-400" />, label: 'Migrations' },
      { to: '/migration-readiness', icon: <CheckCircle className="w-4 h-4 text-emerald-400" />, label: 'Readiness' },
      { to: '/migration-history', icon: <Clock className="w-4 h-4 text-amber-400" />, label: 'History' },
      { to: '/migration-report', icon: <FileText className="w-4 h-4 text-blue-400" />, label: 'Report' },
      { to: '/migration-wizard', icon: <ArrowRightLeft className="w-4 h-4 text-green-400" />, label: 'Wizard' },
      { to: '/migration-templates', icon: <FileText className="w-4 h-4 text-indigo-400" />, label: 'Templates' },
      { to: '/batch-migration', icon: <Layers className="w-4 h-4 text-pink-400" />, label: 'Batch Migration' },
      { to: '/network-topology', icon: <Map className="w-4 h-4 text-teal-400" />, label: 'Network Topology' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/templates', icon: <Layers className="w-4 h-4 text-indigo-400" />, label: 'Templates' },
      { to: '/content-library', icon: <Archive className="w-4 h-4 text-purple-400" />, label: 'Content Library' },
      { to: '/image-builder', icon: <Package className="w-4 h-4 text-pink-400" />, label: 'Image Builder' },
      { to: '/schedules', icon: <Calendar className="w-4 h-4 text-teal-400" />, label: 'Schedules' },
      { to: '/snapshots', icon: <Camera className="w-4 h-4 text-violet-400" />, label: 'Snapshots' },
      { to: '/backups', icon: <Save className="w-4 h-4 text-amber-400" />, label: 'Backups' },
      { to: '/quotas', icon: <Shield className="w-4 h-4 text-orange-400" />, label: 'Quotas' },
      { to: '/lifecycle', icon: <PackageCheck className="w-4 h-4 text-lime-400" />, label: 'Lifecycle' },
      { to: '/bulk-operations', icon: <Layers className="w-4 h-4 text-blue-400" />, label: 'Bulk Operations' },
      { to: '/iso-images', icon: <Disc className="w-4 h-4 text-pink-400" />, label: 'ISO Images' },
      { to: '/upload-disk', icon: <Upload className="w-4 h-4 text-rose-400" />, label: 'Upload Disk' },
      { to: '/download-disk', icon: <Download className="w-4 h-4 text-cyan-400" />, label: 'Download Disk' },
      { to: '/pipeline', icon: <Workflow className="w-4 h-4 text-emerald-400" />, label: 'Pipeline' },
      { to: '/backup-scheduler', icon: <Calendar className="w-4 h-4 text-teal-400" />, label: 'Backup Scheduler' },
      { to: '/batch-import', icon: <FileUp className="w-4 h-4 text-amber-400" />, label: 'Batch Import' },
      { to: '/snapshot-manager', icon: <Camera className="w-4 h-4 text-purple-400" />, label: 'Snapshot Mgr' },
      { to: '/storage-manager', icon: <Database className="w-4 h-4 text-blue-400" />, label: 'Storage Mgr' },
      { to: '/disk-images', icon: <HardDrive className="w-4 h-4 text-violet-400" />, label: 'Disk Images' },
      { to: '/manifest-builder', icon: <FileText className="w-4 h-4 text-amber-400" />, label: 'Manifest Builder' },
      { to: '/job-monitor', icon: <Activity className="w-4 h-4 text-blue-400" />, label: 'Job Monitor' },
    ],
  },
  {
    label: 'Security',
    items: [
      { to: '/encryption', icon: <Lock className="w-4 h-4 text-red-400" />, label: 'Encryption' },
      { to: '/certificates', icon: <Key className="w-4 h-4 text-yellow-400" />, label: 'Certificates' },
      { to: '/compliance', icon: <Shield className="w-4 h-4 text-blue-400" />, label: 'Compliance' },
      { to: '/access-control', icon: <Users className="w-4 h-4 text-indigo-400" />, label: 'Access Control' },
      { to: '/plugins', icon: <Package className="w-4 h-4 text-pink-400" />, label: 'Plugins' },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { to: '/logs', icon: <Terminal className="w-4 h-4 text-lime-400" />, label: 'Logs' },
      { to: '/analytics', icon: <BarChart3 className="w-4 h-4 text-blue-400" />, label: 'Analytics' },
      { to: '/audit', icon: <FileText className="w-4 h-4 text-amber-400" />, label: 'Audit' },
      { to: '/notifications', icon: <Bell className="w-4 h-4 text-rose-400" />, label: 'Notifications' },
      { to: '/alerts', icon: <AlertTriangle className="w-4 h-4 text-yellow-400" />, label: 'Alerts' },
      { to: '/timeline', icon: <Clock className="w-4 h-4 text-purple-400" />, label: 'Timeline' },
    ],
  },
  {
    label: 'Observability',
    items: [
      { to: '/processes', icon: <Cpu className="w-4 h-4 text-blue-400" />, label: 'Processes' },
      { to: '/security-dashboard', icon: <Shield className="w-4 h-4 text-red-400" />, label: 'Security' },
      { to: '/kernel', icon: <Server className="w-4 h-4 text-violet-400" />, label: 'Kernel' },
      { to: '/debug', icon: <Bug className="w-4 h-4 text-emerald-400" />, label: 'Debug Tools' },
      { to: '/explain', icon: <HelpCircle className="w-4 h-4 text-orange-400" />, label: 'Explain' },
      { to: '/live-metrics', icon: <Activity className="w-4 h-4 text-green-400" />, label: 'Live Metrics' },
      { to: '/event-stream', icon: <Radio className="w-4 h-4 text-rose-400" />, label: 'Event Stream' },
      { to: '/resource-optimizer', icon: <Zap className="w-4 h-4 text-yellow-400" />, label: 'Optimizer' },
      { to: '/capacity-planning', icon: <TrendingUp className="w-4 h-4 text-emerald-400" />, label: 'Capacity' },
      { to: '/service-map', icon: <GitBranch className="w-4 h-4 text-teal-400" />, label: 'Service Map' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/webhooks', icon: <Globe className="w-4 h-4 text-orange-400" />, label: 'Webhooks' },
      { to: '/api-playground', icon: <Terminal className="w-4 h-4 text-green-400" />, label: 'API Playground' },
      { to: '/cost-estimator', icon: <DollarSign className="w-4 h-4 text-green-400" />, label: 'Cost Estimator' },
      { to: '/disk-converter', icon: <HardDrive className="w-4 h-4 text-teal-400" />, label: 'Disk Converter' },
      { to: '/vm-compare', icon: <ArrowRightLeft className="w-4 h-4 text-violet-400" />, label: 'VM Compare' },
      { to: '/vm-healthcheck', icon: <HeartPulse className="w-4 h-4 text-pink-400" />, label: 'VM Health Check' },
      { to: '/notification-center', icon: <Inbox className="w-4 h-4 text-rose-400" />, label: 'Notification Center' },
    ],
  },
]

export default function Navbar() {
  const location = useLocation()
  const { user, logout } = useAuth()
  const { isConnected } = useWebSocketContext()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [darkMode, setDarkMode] = useState(true)
  const dropdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Apply dark/light theme class to document
  useEffect(() => {
    document.documentElement.classList.toggle('light-theme', !darkMode)
  }, [darkMode])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenDropdown(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const handleDropdownEnter = (label: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current)
      dropdownTimeoutRef.current = null
    }
    setOpenDropdown(label)
  }

  const handleDropdownLeave = () => {
    dropdownTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null)
    }, 150)
  }

  const handleNavClick = () => {
    setOpenDropdown(null)
    setMobileMenuOpen(false)
  }

  const isGroupActive = (group: NavGroup) =>
    group.items.some((item) => item.to === location.pathname)

  return (
    <>
      <header className="sticky top-0 z-50 navbar-gradient border-b border-slate-700/50 flex-shrink-0">
        <div className="flex items-center h-14 px-4">
          {/* Left: Logo */}
          <Link
            to="/"
            className="flex items-center gap-2 mr-8 flex-shrink-0"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
              <Server className="w-3.5 h-3.5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gradient-blue">
              vmspawnd
            </h1>
          </Link>

          {/* Desktop Navigation Groups */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
            {navGroups.map((group) => (
              <div
                key={group.label}
                className="relative"
                onMouseEnter={(e) => handleDropdownEnter(group.label, e)}
                onMouseLeave={handleDropdownLeave}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenDropdown(
                      openDropdown === group.label ? null : group.label
                    )
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isGroupActive(group)
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  {group.label}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>

                {/* Dropdown Menu */}
                {openDropdown === group.label && (
                  <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-2 min-w-[200px] z-50">
                    {group.items.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={handleNavClick}
                        className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                          location.pathname === item.to
                            ? 'bg-blue-600/20 text-blue-400'
                            : 'text-slate-300 hover:bg-slate-700/50 hover:text-slate-100'
                        }`}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Settings link */}
            <Link
              to="/settings"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === '/settings'
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
            </Link>
          </nav>

          {/* Right side controls */}
          <div className="flex items-center gap-3 ml-auto">
            {/* Create VM button */}
            <Link
              to="/create"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-lg text-sm font-medium text-white transition-all shadow-lg shadow-blue-600/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create VM</span>
            </Link>

            {/* Search trigger */}
            <button
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
              }}
              className="h-8 w-8 rounded-lg hover:bg-slate-800 flex items-center justify-center transition-colors text-slate-400 hover:text-slate-200"
              title="Search (Ctrl+K)"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Theme toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="h-8 w-8 rounded-lg hover:bg-slate-800 flex items-center justify-center transition-colors text-slate-400 hover:text-slate-200"
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* User / Logout */}
            {user && (
              <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-700">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">
                    {user.username}
                  </span>
                </span>
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-400 text-slate-400 transition-colors text-xs"
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            )}

            {/* Connection status dot */}
            <div className="relative group">
              <span className={`block w-2.5 h-2.5 rounded-full ${
                isConnected
                  ? 'bg-green-400 shadow-green-400/50 shadow-sm'
                  : 'bg-red-400 shadow-red-400/50 shadow-sm'
              }`} />
              <div className="absolute right-0 top-full mt-1 px-2 py-1 bg-slate-900 text-xs text-white rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                {isConnected ? 'Connected' : 'Disconnected'}
              </div>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="h-8 w-8 rounded-lg hover:bg-slate-800 flex md:hidden items-center justify-center transition-colors text-slate-400"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute top-14 left-0 right-0 bg-slate-900 border-b border-slate-700 shadow-2xl max-h-[80vh] overflow-y-auto z-50">
            {navGroups.map((group) => (
              <div key={group.label} className="px-4 py-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{group.label}</h3>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={handleNavClick}
                      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        location.pathname === item.to
                          ? 'bg-blue-600/20 text-blue-400'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            {/* Mobile settings + logout */}
            <div className="px-4 py-3 border-t border-slate-700 space-y-1">
              <Link
                to="/settings"
                onClick={handleNavClick}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-slate-800 transition-colors"
              >
                <Settings className="w-4 h-4 text-slate-400" />
                <span>Settings</span>
              </Link>
              <Link
                to="/create"
                onClick={handleNavClick}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-blue-400 hover:bg-slate-800 transition-colors sm:hidden"
              >
                <Plus className="w-4 h-4" />
                <span>Create VM</span>
              </Link>
              {user && (
                <button
                  onClick={() => { logout(); handleNavClick() }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-slate-800 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
