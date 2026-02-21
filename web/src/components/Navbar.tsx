import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Server, Plus, Home, Terminal, Network, HardDrive, Settings,
  Layers, Shield, Calendar, FileText, BarChart3, Save, Bell,
  Database, Cpu, Menu, X, ChevronDown, Building2, GitBranch,
  Zap, Lock, RefreshCw, Archive, Key, Activity, PackageCheck,
} from 'lucide-react'
import ConnectionStatus from './ConnectionStatus'

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
      { to: '/', icon: <Home className="w-4 h-4" />, label: 'Dashboard' },
      { to: '/vms', icon: <Server className="w-4 h-4" />, label: 'VMs' },
      { to: '/datacenters', icon: <Building2 className="w-4 h-4" />, label: 'Datacenters' },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { to: '/network', icon: <Network className="w-4 h-4" />, label: 'Network' },

      { to: '/storage', icon: <HardDrive className="w-4 h-4" />, label: 'Storage' },
      { to: '/storage-pools', icon: <Database className="w-4 h-4" />, label: 'Pools' },
      { to: '/distributed-storage', icon: <Database className="w-4 h-4" />, label: 'Distributed Storage' },
      { to: '/resource-pools', icon: <Layers className="w-4 h-4" />, label: 'Resource Pools' },
      { to: '/system', icon: <Cpu className="w-4 h-4" />, label: 'System' },
    ],
  },
  {
    label: 'Cluster',
    items: [
      { to: '/drs', icon: <GitBranch className="w-4 h-4" />, label: 'DRS' },
      { to: '/fault-tolerance', icon: <Zap className="w-4 h-4" />, label: 'Fault Tolerance' },
      { to: '/replication', icon: <RefreshCw className="w-4 h-4" />, label: 'Replication' },
      { to: '/site-recovery', icon: <Activity className="w-4 h-4" />, label: 'Site Recovery' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/templates', icon: <Layers className="w-4 h-4" />, label: 'Templates' },
      { to: '/content-library', icon: <Archive className="w-4 h-4" />, label: 'Content Library' },
      { to: '/schedules', icon: <Calendar className="w-4 h-4" />, label: 'Schedules' },
      { to: '/backups', icon: <Save className="w-4 h-4" />, label: 'Backups' },
      { to: '/quotas', icon: <Shield className="w-4 h-4" />, label: 'Quotas' },
      { to: '/lifecycle', icon: <PackageCheck className="w-4 h-4" />, label: 'Lifecycle' },
    ],
  },
  {
    label: 'Security',
    items: [
      { to: '/encryption', icon: <Lock className="w-4 h-4" />, label: 'Encryption' },
      { to: '/certificates', icon: <Key className="w-4 h-4" />, label: 'Certificates' },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { to: '/logs', icon: <Terminal className="w-4 h-4" />, label: 'Logs' },
      { to: '/analytics', icon: <BarChart3 className="w-4 h-4" />, label: 'Analytics' },
      { to: '/audit', icon: <FileText className="w-4 h-4" />, label: 'Audit' },
      { to: '/notifications', icon: <Bell className="w-4 h-4" />, label: 'Notifications' },
    ],
  },
]

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const location = useLocation()
  const isActive = location.pathname === item.to

  return (
    <Link
      to={item.to}
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded transition text-sm ${
        isActive ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-300'
      }`}
    >
      {item.icon}
      {item.label}
    </Link>
  )
}

function DesktopDropdown({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const hasActive = group.items.some((i) => i.to === location.pathname)

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        className={`flex items-center gap-1 px-3 py-2 rounded transition text-sm ${
          hasActive ? 'text-blue-400' : 'text-gray-300 hover:bg-gray-700'
        }`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {group.label}
        <ChevronDown className={`w-3 h-3 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[160px] z-40">
          {group.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-4 py-2 transition text-sm ${
                location.pathname === item.to
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-gray-700 text-gray-300'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <nav className="bg-gray-800 border-b border-gray-700" role="navigation" aria-label="Main navigation">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-white">
            <Server className="w-6 h-6" />
            vmspawnd
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-1">
            {/* Core items inline */}
            {navGroups[0].items.map((item) => (
              <NavLink key={item.to} item={item} />
            ))}
            {/* Grouped dropdowns */}
            {navGroups.slice(1).map((group) => (
              <DesktopDropdown key={group.label} group={group} />
            ))}
            <NavLink item={{ to: '/settings', icon: <Settings className="w-4 h-4" />, label: 'Settings' }} />
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4">
            <ConnectionStatus />
            <Link
              to="/create"
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition text-sm"
            >
              <Plus className="w-4 h-4" />
              Create VM
            </Link>

            {/* Mobile hamburger */}
            <button
              className="lg:hidden p-2 hover:bg-gray-700 rounded transition"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-expanded={mobileOpen}
              aria-label="Toggle navigation menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile slide-out menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-gray-700 bg-gray-800 pb-4">
          <div className="container mx-auto px-4 pt-2 space-y-4">
            {navGroups.map((group) => (
              <div key={group.label}>
                <div className="text-xs font-semibold text-gray-500 uppercase px-3 mb-1">
                  {group.label}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <NavLink key={item.to} item={item} onClick={() => setMobileOpen(false)} />
                  ))}
                </div>
              </div>
            ))}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase px-3 mb-1">Settings</div>
              <NavLink
                item={{ to: '/settings', icon: <Settings className="w-4 h-4" />, label: 'Settings' }}
                onClick={() => setMobileOpen(false)}
              />
            </div>
            <Link
              to="/create"
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition sm:hidden"
            >
              <Plus className="w-4 h-4" />
              Create VM
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
