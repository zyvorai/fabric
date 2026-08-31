// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { Plus, Menu, X, Zap, LogOut, Keyboard, Info } from 'lucide-react'
import type { HelpTab } from './HelpDialog'
import NavIconCluster, { MobileNavSections } from './NavGroupsRow'
import NavUtilityBar from './NavUtilityBar'
import { ZYVOR_FABRIC_HELP } from '../config/zyvorHelp'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { getPinnedPages } from '../utils/pinnedPages'
import { getPageLabel } from '../utils/pageLabels'
import { TOP_BAR_QUICK_LINKS } from '../utils/routes'

type NavbarProps = {
  onOpenHelp?: (tab?: HelpTab) => void
}

export default function Navbar({ onOpenHelp }: NavbarProps) {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [helpMenuOpen, setHelpMenuOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const desktopNavRef = useRef<HTMLDivElement>(null)
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
    setMobileOpen(false)
    setOpenDropdown(null)
  }, [location.pathname])

  useEffect(() => {
    if (!openDropdown) return
    const onDown = (ev: MouseEvent) => {
      const el = desktopNavRef.current
      if (el && !el.contains(ev.target as Node)) setOpenDropdown(null)
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpenDropdown(null)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [openDropdown])

  const navBarClass = steel
    ? 'border-b border-[rgba(140,160,190,0.18)] bg-gradient-to-b from-[#0f141a] via-[#1a222d] to-[#0c1117] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_30px_rgba(0,0,0,0.45)]'
    : aurora
      ? 'border-b border-[rgba(167,139,250,0.22)] bg-gradient-to-b from-[#0a0618] via-[#12082a] to-[#050816] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_10px_40px_rgba(34,211,238,0.08)]'
      : 'glass-nav'

  const mobileToggle = (
    <button
      type="button"
      className={`md:hidden p-2 rounded-lg transition shrink-0 -mr-1 ${
        steel
          ? 'text-[#9aa8b8] hover:bg-white/5 hover:text-white'
          : aurora
            ? 'text-[#a89ec8] hover:bg-white/5 hover:text-[#f5f3ff]'
            : 'hover:bg-[#d2d2d7]'
      }`}
      onClick={() => setMobileOpen(!mobileOpen)}
      aria-label="Open menu"
    >
      {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
    </button>
  )

  return (
    <nav id="app-topnav" className={`sticky top-0 z-30 ${navBarClass}`}>
      <div className="app-shell">
        <div className="flex items-center w-full min-w-0 gap-2 min-h-[56px] py-2 lg:min-h-[52px]">
          <Link
            to="/"
            title={`${ZYVOR_FABRIC_HELP.name} — ${ZYVOR_FABRIC_HELP.tagline}`}
            className={`flex items-center gap-2 sm:gap-2.5 group hover:scale-[1.02] transition-transform duration-200 shrink-0 ${
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
              {ZYVOR_FABRIC_HELP.name}
            </span>
          </Link>

          <NavIconCluster
            pinnedPaths={pinnedPaths}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            desktopNavRef={desktopNavRef}
          />

          <NavUtilityBar
            onOpenHelp={onOpenHelp}
            helpMenuOpen={helpMenuOpen}
            setHelpMenuOpen={setHelpMenuOpen}
            mobileToggle={mobileToggle}
          />
        </div>
      </div>

      {mobileOpen && (
        <div
          className={`md:hidden border-t pb-4 animate-fade-in ${
            steel
              ? 'border-[rgba(140,160,190,0.15)] nav-steel-dropdown'
              : aurora
                ? 'border-[rgba(167,139,250,0.15)] nav-aurora-dropdown'
                : 'border-slate-700/50 bg-slate-900/95 backdrop-blur-xl'
          }`}
        >
          <div className="app-shell pt-3 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-700/40 pb-3">
              <span
                className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider ${
                  steel ? 'text-[#7f8b99]' : aurora ? 'text-[#8b7aa8]' : 'text-slate-500'
                }`}
              >
                Shortcuts
              </span>
              <div className="flex min-w-0 flex-wrap gap-2">
                {TOP_BAR_QUICK_LINKS.map((item) => {
                  const QIcon = item.icon
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                        themed ? 'text-[#cfd8e3] hover:bg-white/5' : 'text-slate-300 hover:bg-[#d2d2d7]'
                      }`}
                    >
                      <QIcon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>

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

            <MobileNavSections onNavigate={() => setMobileOpen(false)} />

            <Link
              to="/app/create"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium text-sm ${
                steel
                  ? 'bg-gradient-to-r from-[#5d90f7] to-[#3d6fd0] text-white'
                  : aurora
                    ? 'bg-gradient-to-r from-cyan-500 via-violet-600 to-fuchsia-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              <Plus className="w-4 h-4" />
              Create VM
            </Link>
            {onOpenHelp && (
              <div className="space-y-0.5">
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
                    themed ? 'text-[#cfd8e3] hover:bg-white/5' : 'text-slate-300 hover:bg-[#d2d2d7]'
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
                    themed ? 'text-[#cfd8e3] hover:bg-white/5' : 'text-slate-300 hover:bg-[#d2d2d7]'
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
