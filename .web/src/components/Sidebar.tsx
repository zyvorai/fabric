// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import {
  Server, Plus, Home, Terminal, Network, HardDrive, Settings,
  Layers, Shield, Calendar, FileText, BarChart3, Save, Bell,
  Database, Cpu, ChevronDown, Building2, GitBranch,
  Zap, Lock, RefreshCw, Archive, Key, Activity, PackageCheck, Camera,
  ArrowRightLeft, Package, Monitor, PanelLeftClose, PanelLeft, LogOut, Search,
} from 'lucide-react'
import ConnectionStatus from './ConnectionStatus'
import { useAuth } from '../contexts/AuthContext'
import { useSidebar } from '../contexts/SidebarContext'

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
      { to: '/', icon: <Home className="w-5 h-5" />, label: 'Dashboard' },
      { to: '/vms', icon: <Server className="w-5 h-5" />, label: 'Virtual Machines' },
      { to: '/machines', icon: <Monitor className="w-5 h-5" />, label: 'Machines' },
      { to: '/profiles', icon: <Layers className="w-5 h-5" />, label: 'Profiles' },
      { to: '/datacenters', icon: <Building2 className="w-5 h-5" />, label: 'Datacenters' },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { to: '/network', icon: <Network className="w-5 h-5" />, label: 'Network' },
      { to: '/network-security', icon: <Shield className="w-5 h-5" />, label: 'Net Security' },
      { to: '/storage', icon: <HardDrive className="w-5 h-5" />, label: 'Storage' },
      { to: '/storage-pools', icon: <Database className="w-5 h-5" />, label: 'Storage Pools' },
      { to: '/distributed-storage', icon: <Database className="w-5 h-5" />, label: 'Distributed Storage' },
      { to: '/resource-pools', icon: <Layers className="w-5 h-5" />, label: 'Resource Pools' },
      { to: '/system', icon: <Cpu className="w-5 h-5" />, label: 'System' },
    ],
  },
  {
    label: 'Cluster',
    items: [
      { to: '/drs', icon: <GitBranch className="w-5 h-5" />, label: 'DRS' },
      { to: '/fault-tolerance', icon: <Zap className="w-5 h-5" />, label: 'Fault Tolerance' },
      { to: '/replication', icon: <RefreshCw className="w-5 h-5" />, label: 'Replication' },
      { to: '/site-recovery', icon: <Activity className="w-5 h-5" />, label: 'Site Recovery' },
      { to: '/migrations', icon: <ArrowRightLeft className="w-5 h-5" />, label: 'Migrations' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/templates', icon: <Layers className="w-5 h-5" />, label: 'Templates' },
      { to: '/content-library', icon: <Archive className="w-5 h-5" />, label: 'Content Library' },
      { to: '/image-builder', icon: <Package className="w-5 h-5" />, label: 'Image Builder' },
      { to: '/schedules', icon: <Calendar className="w-5 h-5" />, label: 'Schedules' },
      { to: '/snapshots', icon: <Camera className="w-5 h-5" />, label: 'Snapshots' },
      { to: '/backups', icon: <Save className="w-5 h-5" />, label: 'Backups' },
      { to: '/quotas', icon: <Shield className="w-5 h-5" />, label: 'Quotas' },
      { to: '/lifecycle', icon: <PackageCheck className="w-5 h-5" />, label: 'Lifecycle' },
    ],
  },
  {
    label: 'Security',
    items: [
      { to: '/encryption', icon: <Lock className="w-5 h-5" />, label: 'Encryption' },
      { to: '/certificates', icon: <Key className="w-5 h-5" />, label: 'Certificates' },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { to: '/logs', icon: <Terminal className="w-5 h-5" />, label: 'Logs' },
      { to: '/analytics', icon: <BarChart3 className="w-5 h-5" />, label: 'Analytics' },
      { to: '/audit', icon: <FileText className="w-5 h-5" />, label: 'Audit' },
      { to: '/notifications', icon: <Bell className="w-5 h-5" />, label: 'Notifications' },
    ],
  },
]

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const location = useLocation()
  const isActive = location.pathname === item.to

  return (
    <Link
      to={item.to}
      title={collapsed ? item.label : undefined}
      className={`group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
        isActive
          ? 'bg-gradient-to-r from-blue-600/15 to-blue-600/5 text-white'
          : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
      } ${collapsed ? 'justify-center' : ''}`}
    >
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-blue-500 rounded-r-full" />
      )}
      <span className={`shrink-0 transition-colors ${isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
        {item.icon}
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
}

function NavSection({ group, collapsed, defaultOpen }: { group: NavGroup; collapsed: boolean; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const location = useLocation()
  const hasActive = group.items.some((i) => i.to === location.pathname)

  useEffect(() => {
    if (hasActive) setOpen(true)
  }, [hasActive])

  if (collapsed) {
    return (
      <div className="space-y-1 py-2 border-b border-slate-700/50/50 last:border-b-0">
        {group.items.map((item) => (
          <NavLink key={item.to} item={item} collapsed={collapsed} />
        ))}
      </div>
    )
  }

  return (
    <div className="py-1">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
      >
        <span>{group.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
      </button>
      <div
        className={`space-y-0.5 overflow-hidden transition-all duration-200 ${
          open ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {group.items.map((item) => (
          <NavLink key={item.to} item={item} collapsed={collapsed} />
        ))}
      </div>
    </div>
  )
}

export default function Sidebar() {
  const { collapsed, toggle } = useSidebar()
  const { user, logout } = useAuth()

  return (
    <aside
      className={`fixed top-0 left-0 h-screen bg-slate-800/50 border-r border-slate-700/50 flex flex-col z-30 transition-all duration-300 ease-in-out ${
        collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700/50 shrink-0">
        <Link to="/" className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
            <Server className="w-4.5 h-4.5 text-white" />
          </div>
          {!collapsed && (
            <span className="text-lg font-bold text-white tracking-tight truncate">
              vmspawnd
            </span>
          )}
        </Link>
        <button
          onClick={toggle}
          className="p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-white/5 transition-colors shrink-0"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Create VM + Search */}
      <div className="px-3 py-3 space-y-2 border-b border-slate-700/50 shrink-0">
        <Link
          to="/create"
          className={`flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-lg text-sm font-medium text-white transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 ${
            collapsed ? 'justify-center' : ''
          }`}
          title={collapsed ? 'Create VM' : undefined}
        >
          <Plus className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Create VM</span>}
        </Link>
        {!collapsed && (
          <button
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
            }}
            className="w-full flex items-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50/50 rounded-lg text-sm text-slate-400 hover:text-slate-300 transition-colors"
          >
            <Search className="w-4 h-4" />
            <span className="flex-1 text-left">Search...</span>
            <kbd className="text-[10px] px-1.5 py-0.5 bg-slate-700 border border-slate-600 rounded font-mono">
              {navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}K
            </kbd>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 sidebar-scroll">
        {navGroups.map((group, idx) => (
          <NavSection
            key={group.label}
            group={group}
            collapsed={collapsed}
            defaultOpen={idx === 0}
          />
        ))}

        <div className="pt-1">
          <NavLink
            item={{ to: '/settings', icon: <Settings className="w-5 h-5" />, label: 'Settings' }}
            collapsed={collapsed}
          />
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700/50 px-3 py-3 shrink-0 space-y-2">
        <ConnectionStatus />
        {user && (
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0 text-xs font-bold text-white uppercase">
              {user.username.charAt(0)}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{user.username}</div>
                <div className="text-xs text-slate-500 capitalize">{user.role}</div>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={logout}
                className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
