// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import {
  Server, Plus, Settings,
  Menu, X, ChevronDown,
  LogOut, User, Palette, Search,
  CircleHelp, Keyboard, Info,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import ConnectionStatus from './ConnectionStatus'
import { navGroups, navGroupHasActive, navItemActive } from '../utils/routes'
import type { HelpTab } from './HelpDialog'

type NavbarProps = {
  onOpenHelp?: (tab?: HelpTab) => void
}

export default function Navbar({ onOpenHelp }: NavbarProps) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const { theme, cycleTheme } = useTheme()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const dropdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const isGroupActive = (group: (typeof navGroups)[0]) =>
    navGroupHasActive(group, location.pathname, location.search)

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
                          navItemActive(item, location.pathname, location.search)
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

            {/* Help */}
            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setHelpOpen((o) => !o)
                  setOpenDropdown(null)
                }}
                className="h-8 w-8 rounded-lg hover:bg-slate-800 flex items-center justify-center transition-colors text-slate-400 hover:text-slate-200"
                title="Help"
                aria-expanded={helpOpen}
              >
                <CircleHelp className="w-4 h-4" />
              </button>
              {helpOpen && (
                <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-2 min-w-[200px] z-50">
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700/50"
                    onClick={() => { setHelpOpen(false); onOpenHelp?.('shortcuts') }}
                  >
                    <Keyboard className="w-4 h-4" /> Shortcuts
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700/50"
                    onClick={() => { setHelpOpen(false); onOpenHelp?.('about') }}
                  >
                    <Info className="w-4 h-4" /> About
                  </button>
                </div>
              )}
            </div>

            {/* Theme cycle */}
            <button
              type="button"
              onClick={cycleTheme}
              className="h-8 w-8 rounded-lg hover:bg-slate-800 flex items-center justify-center transition-colors text-slate-400 hover:text-slate-200"
              title={`Theme: ${theme} (click to cycle)`}
            >
              <Palette className="w-4 h-4" />
            </button>

            <ConnectionStatus />

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
                        navItemActive(item, location.pathname, location.search)
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
