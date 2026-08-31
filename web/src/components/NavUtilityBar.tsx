// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import type { ReactNode } from 'react'
import { useRef, useEffect } from 'react'
import { Link } from 'react-router'
import {
  Plus, ChevronDown, LogOut, User, Search,
  CircleHelp, Keyboard, Info, BookOpen, ExternalLink,
} from 'lucide-react'
import { ZYVOR_HELP } from '../config/zyvorHelp'
import type { HelpTab } from './HelpDialog'
import ConnectionStatus from './ConnectionStatus'
import ThemeMenu from './ThemeMenu'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

type NavUtilityBarProps = {
  onOpenHelp?: (tab?: HelpTab) => void
  helpMenuOpen: boolean
  setHelpMenuOpen: (open: boolean) => void
  mobileToggle: ReactNode
}

export default function NavUtilityBar({
  onOpenHelp,
  helpMenuOpen,
  setHelpMenuOpen,
  mobileToggle,
}: NavUtilityBarProps) {
  const helpRef = useRef<HTMLDivElement>(null)
  const { user, logout } = useAuth()
  const { theme } = useTheme()
  const steel = theme === 'steel'
  const aurora = theme === 'aurora'
  const themed = steel || aurora

  useEffect(() => {
    if (!helpMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) setHelpMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [helpMenuOpen, setHelpMenuOpen])

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-2 sm:gap-x-2 min-w-0 shrink-0 ml-auto">
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
              : 'hover:bg-[#d2d2d7] text-slate-400 hover:text-white'
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
            onClick={() => setHelpMenuOpen(!helpMenuOpen)}
            aria-expanded={helpMenuOpen}
            aria-haspopup="menu"
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition text-sm ${
              steel
                ? 'text-[#9aa8b8] hover:text-white hover:bg-white/5'
                : aurora
                  ? 'text-[#a89ec8] hover:text-[#f5f3ff] hover:bg-white/5'
                  : 'text-slate-400 hover:bg-[#d2d2d7] hover:text-white'
            } ${helpMenuOpen ? (themed ? 'bg-white/5 text-white' : 'bg-[#d2d2d7] text-white') : ''}`}
            title="Help (?)"
            aria-label="Help menu"
          >
            <CircleHelp className="w-4 h-4 shrink-0" aria-hidden />
            <span className="hidden xl:inline text-xs font-medium">Help</span>
            <ChevronDown
              className={`w-3.5 h-3.5 hidden xl:block transition-transform ${helpMenuOpen ? 'rotate-180' : ''}`}
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
                  themed ? 'text-[#cfd8e3] hover:bg-white/5' : 'text-slate-300 hover:bg-[#d2d2d7]'
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
                  themed ? 'text-[#cfd8e3] hover:bg-white/5' : 'text-slate-300 hover:bg-[#d2d2d7]'
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
                  themed ? 'text-[#cfd8e3] hover:bg-white/5' : 'text-slate-300 hover:bg-[#d2d2d7]'
                }`}
              >
                <BookOpen className="w-4 h-4 shrink-0" aria-hidden />
                Help &amp; documentation
                <ExternalLink className="w-3.5 h-3.5 ml-auto opacity-60" aria-hidden />
              </a>
              <a
                role="menuitem"
                href={ZYVOR_HELP.contact}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setHelpMenuOpen(false)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm ${
                  themed ? 'text-[#cfd8e3] hover:bg-white/5' : 'text-slate-300 hover:bg-[#d2d2d7]'
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
        to="/app/create"
        className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-sm font-medium shrink-0 whitespace-nowrap ${
          steel
            ? 'bg-gradient-to-r from-[#5d90f7] to-[#3d6fd0] text-white hover:brightness-110'
            : aurora
              ? 'bg-gradient-to-r from-cyan-500 via-violet-600 to-fuchsia-600 text-white hover:brightness-110'
              : 'bg-blue-600 hover:bg-blue-500'
        }`}
      >
        <Plus className="w-4 h-4 shrink-0" />
        <span className="hidden xl:inline">Create VM</span>
        <span className="xl:hidden">Create</span>
      </Link>
      {user && (
        <div
          className={`flex items-center gap-1 shrink-0 pl-1.5 sm:pl-2 ml-0.5 border-l ${
            steel
              ? 'border-[rgba(140,160,190,0.2)]'
              : aurora
                ? 'border-[rgba(167,139,250,0.2)]'
                : 'border-[#d2d2d7]'
          }`}
        >
          <span
            className={`hidden xl:flex text-xs items-center gap-1 max-w-[140px] 2xl:max-w-[200px] ${
              steel ? 'text-[#9aa8b8]' : aurora ? 'text-[#a89ec8]' : 'text-slate-400'
            }`}
            title={user.username}
          >
            <User className="w-3.5 h-3.5 shrink-0" aria-hidden />
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
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white border-slate-600/60 hover:border-[#6e6e73]'
            }`}
            title={`Sign out (${user.username})`}
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4 shrink-0 text-slate-400 hover:text-red-400" />
            <span className="text-[11px] sm:text-xs font-medium leading-none hidden sm:inline">Log out</span>
          </button>
        </div>
      )}
      {mobileToggle}
    </div>
  )
}
