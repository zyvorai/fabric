// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import {
  Plus, Menu, X, ChevronDown, Zap, LogOut, User, Search,
  CircleHelp, Keyboard, Info, BookOpen, ExternalLink, Settings,
} from 'lucide-react'
import { ZYVOR_HELP } from '../config/zyvorHelp'
import type { HelpTab } from './HelpDialog'
import ConnectionStatus from './ConnectionStatus'
import ThemeMenu from './ThemeMenu'
import { useAuth } from '../contexts/AuthContext'
import { useTheme, type AppTheme } from '../contexts/ThemeContext'
import { getPinnedPages } from '../utils/pinnedPages'
import { getPageLabel } from '../utils/pageLabels'
import { navGroups, navGroupHasActive, navItemActive, type NavGroup, type NavItem } from '../utils/routes'

function NavLink({
  item,
  onClick,
  theme,
}: {
  item: NavItem
  onClick?: () => void
  theme: AppTheme
}) {
  const location = useLocation()
  const isActive = navItemActive(item, location.pathname, location.search)

  if (theme === 'steel') {
    return (
      <Link
        to={item.to}
        onClick={onClick}
        className={`nav-steel-link flex items-center gap-2 px-2 py-2 text-sm font-medium no-underline transition-colors duration-200 ${
          isActive ? 'nav-steel-link-active' : 'text-[#9aa8b8] hover:text-white'
        }`}
      >
        {item.icon}
        {item.label}
      </Link>
    )
  }

  if (theme === 'aurora') {
    return (
      <Link
        to={item.to}
        onClick={onClick}
        className={`nav-aurora-link flex items-center gap-2 px-2 py-2 text-sm font-medium no-underline transition-colors duration-200 ${
          isActive ? 'nav-aurora-link-active' : 'text-[#a89ec8] hover:text-[#f5f3ff]'
        }`}
      >
        {item.icon}
        {item.label}
      </Link>
    )
  }

  return (
    <Link
      to={item.to}
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 text-sm font-medium ${
        isActive
          ? 'bg-blue-600/90 text-white shadow-lg shadow-blue-600/20'
          : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
      }`}
    >
      {item.icon}
      {item.label}
    </Link>
  )
}

function DesktopDropdown({ group, theme }: { group: NavGroup; theme: AppTheme }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const location = useLocation()
  const hasActive = navGroupHasActive(group, location.pathname, location.search)

  const handleEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setOpen(true)
  }
  const handleLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 400)
  }

  const btnClass =
    theme === 'steel'
      ? `flex items-center gap-1 px-2 py-2 text-sm font-medium border-0 bg-transparent cursor-pointer rounded-lg transition-colors ${
          hasActive ? 'text-[#eef3f8]' : 'text-[#9aa8b8] hover:text-white'
        }`
      : theme === 'aurora'
        ? `flex items-center gap-1 px-2 py-2 text-sm font-medium border-0 bg-transparent cursor-pointer rounded-lg transition-colors ${
            hasActive ? 'text-[#f5f3ff]' : 'text-[#a89ec8] hover:text-[#f5f3ff]'
          }`
        : `flex items-center gap-1 px-3 py-2 rounded-lg transition-all duration-200 text-sm font-medium ${
            hasActive ? 'text-blue-400' : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
          }`

  const panelClass =
    theme === 'steel'
      ? 'absolute top-full left-0 mt-1 rounded-xl py-2 min-w-[180px] z-40 animate-fade-in origin-top nav-steel-dropdown border border-[rgba(140,160,190,0.18)] shadow-2xl'
      : theme === 'aurora'
        ? 'absolute top-full left-0 mt-1 rounded-xl py-2 min-w-[180px] z-40 animate-fade-in origin-top nav-aurora-dropdown shadow-2xl'
        : 'absolute top-full left-0 mt-1 rounded-xl overflow-hidden py-1 min-w-[180px] z-40 animate-fade-in origin-top bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 shadow-2xl'

  const itemClass = (active: boolean) =>
    theme === 'steel'
      ? `flex items-center gap-2.5 px-4 py-2.5 transition text-sm no-underline ${
          active ? 'text-[#eef3f8] bg-white/5' : 'text-[#9aa8b8] hover:text-white hover:bg-white/5'
        }`
      : theme === 'aurora'
        ? `flex items-center gap-2.5 px-4 py-2.5 transition text-sm no-underline ${
            active ? 'text-[#f5f3ff] bg-white/5' : 'text-[#a89ec8] hover:text-[#f5f3ff] hover:bg-white/5'
          }`
        : `flex items-center gap-2.5 px-4 py-2.5 transition-all duration-150 text-sm ${
            active ? 'bg-blue-600/80 text-white' : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
          }`

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button type="button" onClick={() => setOpen((o) => !o)} className={btnClass}>
        {group.label}
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={panelClass}>
          {group.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={itemClass(navItemActive(item, location.pathname, location.search))}
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

type NavbarProps = {
  onOpenHelp?: (tab?: HelpTab) => void
}

export default function Navbar({ onOpenHelp }: NavbarProps) {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [helpMenuOpen, setHelpMenuOpen] = useState(false)
  const helpRef = useRef<HTMLDivElement>(null)
  const { user, logout } = useAuth()
  const { theme } = useTheme()
  const steel = theme === 'steel'
  const aurora = theme === 'aurora'
  const themed = steel || aurora
  const [pinnedPaths, setPinnedPaths] = useState(() => getPinnedPages())

  useEffect(() => {
    setPinnedPaths(getPinnedPages())
  }, [location.pathname])

  useEffect(() => {
    if (!helpMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) setHelpMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [helpMenuOpen])

  const navShell = themed
    ? 'min-h-[72px] flex flex-wrap items-center gap-x-3 gap-y-2 py-2 lg:flex-nowrap lg:justify-between lg:items-center'
    : 'flex flex-wrap items-center gap-x-2 gap-y-2 min-h-14 py-2 lg:min-h-16 lg:py-0 lg:flex-nowrap lg:justify-between'

  const navBarClass = steel
    ? 'border-b border-[rgba(140,160,190,0.18)] bg-gradient-to-b from-[#0f141a] via-[#1a222d] to-[#0c1117] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_30px_rgba(0,0,0,0.45)]'
    : aurora
      ? 'border-b border-[rgba(167,139,250,0.22)] bg-gradient-to-b from-[#0a0618] via-[#12082a] to-[#050816] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_10px_40px_rgba(34,211,238,0.08)]'
      : 'bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/50'

  return (
    <nav id="app-topnav" className={`sticky top-0 z-30 ${navBarClass}`}>
      <div className="app-shell">
        <div className={navShell}>
          <Link
            to="/"
            title="vmspawnd — VM spawn & lifecycle"
            className={`flex items-center gap-2 sm:gap-2.5 group hover:scale-[1.02] transition-transform duration-200 shrink-0 order-1 ${
              steel ? 'nav-steel-brand' : aurora ? 'nav-aurora-brand' : ''
            }`}
          >
            <div
              className={`flex items-center justify-center shrink-0 ${
                steel
                  ? 'w-[38px] h-[38px] rounded-xl bg-gradient-to-br from-[#2a3442] to-[#121820] border border-[rgba(170,190,220,0.25)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_6px_16px_rgba(0,0,0,0.4)]'
                  : aurora
                    ? 'w-[38px] h-[38px] rounded-xl bg-gradient-to-br from-[#1a0a2e] to-[#050816] border border-[rgba(167,139,250,0.35)] shadow-[0_0_24px_rgba(34,211,238,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]'
                    : 'w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-shadow'
              }`}
            >
              <Zap
                className={`${
                  steel ? 'w-5 h-5 text-[#b8c5d6]' : aurora ? 'w-5 h-5 text-[#67e8f9]' : 'w-4.5 h-4.5 text-white'
                }`}
              />
            </div>
            <span
              className={
                steel
                  ? 'text-base sm:text-lg font-semibold text-[#eef3f8]'
                  : aurora
                    ? 'text-base sm:text-lg font-semibold bg-gradient-to-r from-[#67e8f9] via-[#e9d5ff] to-[#f9a8d4] bg-clip-text text-transparent'
                    : 'text-base sm:text-lg font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent'
              }
            >
              vmspawnd
            </span>
          </Link>

          <div className="hidden lg:flex items-center gap-1 order-3 lg:order-2 flex-1 min-w-0 justify-center">
            {pinnedPaths.length > 0 ? (
              <div
                className={`flex items-center gap-0.5 mr-1 pr-2 shrink-0 max-w-[14rem] ${
                  steel
                    ? 'border-r border-[rgba(140,160,190,0.2)]'
                    : aurora
                      ? 'border-r border-[rgba(167,139,250,0.2)]'
                      : 'border-r border-slate-700/60'
                }`}
              >
                {pinnedPaths.slice(0, 4).map((path) => (
                  <Link
                    key={path}
                    to={path}
                    title={getPageLabel(path)}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium truncate max-w-[5.5rem] transition-colors ${
                      steel
                        ? 'text-amber-300/90 hover:text-amber-200 hover:bg-white/5'
                        : 'text-amber-400/90 hover:text-amber-300 hover:bg-amber-500/10'
                    }`}
                  >
                    {getPageLabel(path)}
                  </Link>
                ))}
              </div>
            ) : null}
            {navGroups.map((group) => (
              <DesktopDropdown key={group.label} group={group} theme={theme} />
            ))}
            <Link
              to="/settings"
              className={`flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === '/settings'
                  ? steel
                    ? 'text-[#eef3f8]'
                    : aurora
                      ? 'text-[#f5f3ff]'
                      : 'text-blue-400'
                  : steel
                    ? 'text-[#9aa8b8] hover:text-white'
                    : aurora
                      ? 'text-[#a89ec8] hover:text-[#f5f3ff]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
              title="Settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-2 sm:gap-x-2 min-w-0 shrink-0 w-full basis-full ml-auto order-2 sm:w-auto sm:basis-auto lg:order-3 lg:w-auto lg:shrink-0">
            <ThemeMenu />
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
              }}
              className={`p-1.5 rounded-lg transition shrink-0 ${
                steel
                  ? 'text-[#9aa8b8] hover:text-white hover:bg-white/5'
                  : aurora
                    ? 'text-[#a89ec8] hover:text-[#f5f3ff] hover:bg-white/5'
                    : 'hover:bg-slate-700/60 text-slate-400 hover:text-white'
              }`}
              title="Search (Ctrl+K)"
              aria-label="Search"
            >
              <Search className="w-4 h-4" />
            </button>
            {onOpenHelp && (
              <div className="relative shrink-0 hidden sm:block" ref={helpRef}>
                <button
                  type="button"
                  onClick={() => setHelpMenuOpen((v) => !v)}
                  aria-expanded={helpMenuOpen}
                  aria-haspopup="menu"
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition text-sm ${
                    steel
                      ? 'text-[#9aa8b8] hover:text-white hover:bg-white/5'
                      : aurora
                        ? 'text-[#a89ec8] hover:text-[#f5f3ff] hover:bg-white/5'
                        : 'text-slate-400 hover:bg-slate-700/60 hover:text-white'
                  } ${helpMenuOpen ? (themed ? 'bg-white/5 text-white' : 'bg-slate-700/60 text-white') : ''}`}
                  title="Help (?)"
                  aria-label="Help menu"
                >
                  <CircleHelp className="w-4 h-4 shrink-0" aria-hidden />
                  <span className="hidden md:inline text-xs font-medium">Help</span>
                  <ChevronDown
                    className={`w-3 h-3 hidden md:block transition-transform ${helpMenuOpen ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>
                {helpMenuOpen && (
                  <div
                    className={`absolute top-full right-0 mt-1 min-w-[12.5rem] rounded-xl py-1.5 z-40 animate-fade-in ${
                      steel
                        ? 'nav-steel-dropdown border border-[rgba(140,160,190,0.18)] shadow-2xl'
                        : aurora
                          ? 'nav-aurora-dropdown shadow-2xl'
                          : 'bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 shadow-2xl'
                    }`}
                    role="menu"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setHelpMenuOpen(false)
                        onOpenHelp('shortcuts')
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-sm ${
                        themed ? 'text-[#cfd8e3] hover:bg-white/5' : 'text-slate-300 hover:bg-slate-700/60'
                      }`}
                    >
                      <Keyboard className="w-4 h-4 shrink-0" aria-hidden />
                      Keyboard shortcuts
                      <kbd
                        className={`ml-auto text-[10px] px-1 py-0.5 rounded font-mono ${
                          themed ? 'bg-black/30 text-[#9aa8b8]' : 'bg-slate-700 text-slate-500'
                        }`}
                      >
                        ?
                      </kbd>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setHelpMenuOpen(false)
                        onOpenHelp('about')
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-sm ${
                        themed ? 'text-[#cfd8e3] hover:bg-white/5' : 'text-slate-300 hover:bg-slate-700/60'
                      }`}
                    >
                      <Info className="w-4 h-4 shrink-0" aria-hidden />
                      About
                    </button>
                    <a
                      role="menuitem"
                      href={ZYVOR_HELP.docs}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setHelpMenuOpen(false)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-sm ${
                        themed ? 'text-[#cfd8e3] hover:bg-white/5' : 'text-slate-300 hover:bg-slate-700/60'
                      }`}
                    >
                      <BookOpen className="w-4 h-4 shrink-0" aria-hidden />
                      Help &amp; documentation
                      <ExternalLink className="w-3 h-3 ml-auto opacity-60" aria-hidden />
                    </a>
                    <a
                      role="menuitem"
                      href={ZYVOR_HELP.contact}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setHelpMenuOpen(false)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-sm ${
                        themed ? 'text-[#cfd8e3] hover:bg-white/5' : 'text-slate-300 hover:bg-slate-700/60'
                      }`}
                    >
                      <ExternalLink className="w-4 h-4 shrink-0" aria-hidden />
                      Contact support
                    </a>
                  </div>
                )}
              </div>
            )}
            <div className="shrink-0">
              <ConnectionStatus />
            </div>
            <Link
              to="/create"
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl transition-all duration-200 text-sm font-medium shrink-0 whitespace-nowrap ${
                steel
                  ? 'bg-gradient-to-r from-[#5d90f7] to-[#3d6fd0] text-white shadow-lg shadow-black/30 hover:brightness-110'
                  : aurora
                    ? 'bg-gradient-to-r from-cyan-500 via-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-500/25 hover:brightness-110'
                    : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30'
              }`}
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="hidden lg:inline">Create VM</span>
              <span className="lg:hidden">Create</span>
            </Link>
            {user && (
              <div
                className={`flex items-center gap-1 shrink-0 pl-1.5 sm:pl-2 ml-0.5 border-l ${
                  steel
                    ? 'border-[rgba(140,160,190,0.2)]'
                    : aurora
                      ? 'border-[rgba(167,139,250,0.2)]'
                      : 'border-slate-700/60'
                }`}
              >
                <span
                  className={`hidden xl:flex text-xs items-center gap-1 max-w-[140px] 2xl:max-w-[200px] ${
                    steel ? 'text-[#9aa8b8]' : aurora ? 'text-[#a89ec8]' : 'text-slate-400'
                  }`}
                  title={user.username}
                >
                  <User className="w-3 h-3 shrink-0" aria-hidden />
                  <span className="truncate">{user.username}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition shrink-0 border ${
                    steel
                      ? 'text-[#cfd8e3] border-[rgba(140,160,190,0.25)] hover:bg-white/5 hover:text-white'
                      : aurora
                        ? 'text-[#e8e4f8] border-[rgba(167,139,250,0.28)] hover:bg-white/5 hover:text-white'
                        : 'text-slate-300 hover:bg-slate-700 hover:text-white border-slate-600/60 hover:border-slate-500'
                  }`}
                  title={`Sign out (${user.username})`}
                  aria-label="Sign out"
                >
                  <LogOut className="w-4 h-4 shrink-0 text-slate-400 hover:text-red-400" />
                  <span className="text-[11px] sm:text-xs font-medium leading-none hidden sm:inline">Log out</span>
                </button>
              </div>
            )}
            <button
              type="button"
              className={`lg:hidden p-2 rounded-lg transition shrink-0 -mr-1 ${
                steel
                  ? 'text-[#9aa8b8] hover:bg-white/5 hover:text-white'
                  : aurora
                    ? 'text-[#a89ec8] hover:bg-white/5 hover:text-[#f5f3ff]'
                    : 'hover:bg-slate-700/60'
              }`}
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Open menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div
          className={`lg:hidden border-t pb-4 animate-fade-in ${
            steel
              ? 'border-[rgba(140,160,190,0.15)] nav-steel-dropdown'
              : aurora
                ? 'border-[rgba(167,139,250,0.15)] nav-aurora-dropdown'
                : 'border-slate-700/50 bg-slate-900/95 backdrop-blur-xl'
          }`}
        >
          <div className="app-shell pt-3 space-y-4">
            {pinnedPaths.length > 0 ? (
              <div>
                <div
                  className={`text-[10px] font-bold uppercase tracking-wider px-3 mb-1.5 ${
                    steel ? 'text-[#7f8b99]' : aurora ? 'text-[#8b7aa8]' : 'text-slate-500'
                  }`}
                >
                  Pinned
                </div>
                <div className="space-y-0.5">
                  {pinnedPaths.map((path) => (
                    <Link
                      key={path}
                      to={path}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium truncate no-underline ${
                        steel
                          ? 'text-amber-300/90 hover:bg-white/5'
                          : 'text-amber-400/90 hover:bg-amber-500/10'
                      }`}
                    >
                      {getPageLabel(path)}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            {navGroups.map((group) => (
              <div key={group.label}>
                <div
                  className={`text-[10px] font-bold uppercase tracking-wider px-3 mb-1.5 ${
                    steel ? 'text-[#7f8b99]' : aurora ? 'text-[#8b7aa8]' : 'text-slate-500'
                  }`}
                >
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      item={item}
                      theme={theme}
                      onClick={() => setMobileOpen(false)}
                    />
                  ))}
                </div>
              </div>
            ))}
            <Link
              to="/settings"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                themed ? 'text-[#cfd8e3] hover:bg-white/5' : 'text-slate-300 hover:bg-slate-700/60'
              }`}
            >
              <Settings className="w-4 h-4" />
              Settings
            </Link>
            <Link
              to="/create"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl transition md:hidden font-medium ${
                steel
                  ? 'bg-gradient-to-r from-[#5d90f7] to-[#3d6fd0] text-white'
                  : aurora
                    ? 'bg-gradient-to-r from-cyan-500 via-violet-600 to-fuchsia-600 text-white'
                    : 'bg-gradient-to-r from-blue-600 to-blue-700'
              }`}
            >
              <Plus className="w-4 h-4" />
              Create VM
            </Link>
            {onOpenHelp && (
              <div className="space-y-0.5 sm:hidden">
                <div
                  className={`text-[10px] font-bold uppercase tracking-wider px-3 mb-1.5 ${
                    steel ? 'text-[#7f8b99]' : aurora ? 'text-[#8b7aa8]' : 'text-slate-500'
                  }`}
                >
                  Help
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false)
                    onOpenHelp('shortcuts')
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    themed ? 'text-[#cfd8e3] hover:bg-white/5' : 'text-slate-300 hover:bg-slate-700/60'
                  }`}
                >
                  <Keyboard className="w-4 h-4" />
                  Keyboard shortcuts
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false)
                    onOpenHelp('about')
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    themed ? 'text-[#cfd8e3] hover:bg-white/5' : 'text-slate-300 hover:bg-slate-700/60'
                  }`}
                >
                  <Info className="w-4 h-4" />
                  About
                </button>
              </div>
            )}
            {user && (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false)
                  void logout()
                }}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition text-sm w-full ${
                  themed ? 'bg-white/5 text-[#cfd8e3] hover:bg-white/10' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                <LogOut className="w-4 h-4" />
                Log out ({user.username})
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
