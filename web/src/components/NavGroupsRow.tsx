// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { useTheme, type AppTheme } from '../contexts/ThemeContext'
import { filterNavGroups } from '../navigation/navTiers'
import { getPageLabel } from '../utils/pageLabels'
import {
  navGroups as allNavGroups,
  TOP_BAR_QUICK_LINKS,
  navDropdownSections,
  navGroupHasActive,
  navItemActive,
  flattenNavGroup,
  type NavGroup,
  type NavItem,
} from '../utils/routes'

function navIconBtnClass(theme: AppTheme, active: boolean): string {
  if (theme === 'steel') {
    return `nav-icon-btn flex h-9 w-9 items-center justify-center rounded-lg transition-colors shrink-0 ${
      active ? 'nav-icon-btn-active text-[#eef3f8]' : 'text-[#9aa8b8] hover:text-white hover:bg-white/5'
    }`
  }
  if (theme === 'aurora') {
    return `nav-icon-btn flex h-9 w-9 items-center justify-center rounded-lg transition-colors shrink-0 ${
      active ? 'nav-icon-btn-active text-[#f5f3ff]' : 'text-[#a89ec8] hover:text-[#f5f3ff] hover:bg-white/5'
    }`
  }
  return `flex h-9 w-9 items-center justify-center rounded-lg transition-colors shrink-0 ${
    active
      ? 'bg-blue-600/25 text-blue-400 ring-1 ring-blue-500/35'
      : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
  }`
}

function dropdownPanelClass(theme: AppTheme, isMore: boolean): string {
  const scroll = isMore ? 'max-h-[min(70vh,28rem)] overflow-y-auto' : ''
  if (theme === 'steel') {
    return `nav-steel-dropdown p-2 rounded-xl min-w-[220px] shadow-2xl border border-[rgba(140,160,190,0.18)] ${scroll}`
  }
  if (theme === 'aurora') {
    return `nav-aurora-dropdown p-2 rounded-xl min-w-[220px] shadow-2xl ${scroll}`
  }
  return `bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl p-2 min-w-[200px] ${scroll}`
}

function dropdownLinkClass(theme: AppTheme, active: boolean): string {
  if (theme === 'steel') {
    return `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors no-underline ${
      active ? 'text-[#eef3f8] bg-white/5' : 'text-[#9aa8b8] hover:text-white hover:bg-white/5'
    }`
  }
  if (theme === 'aurora') {
    return `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors no-underline ${
      active ? 'text-[#f5f3ff] bg-white/5' : 'text-[#a89ec8] hover:text-[#f5f3ff] hover:bg-white/5'
    }`
  }
  return `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors no-underline ${
    active ? 'bg-blue-600/80 text-white' : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
  }`
}

function DesktopNavDropdown({
  group,
  theme,
  open,
  onOpen,
  onClose,
}: {
  group: NavGroup
  theme: AppTheme
  open: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const location = useLocation()
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasActive = navGroupHasActive(group, location.pathname, location.search)
  const BarIcon = group.barIcon
  const isMore = group.compact === 'More'

  const handleEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    onOpen()
  }

  const handleLeave = () => {
    // 150ms wasn't enough time for a real (non-teleporting) mouse to travel
    // from the 36px trigger icon down into the panel below it -- live user
    // report: the dropdown was closing before they could reach an item.
    closeTimer.current = setTimeout(onClose, 400)
  }

  return (
    <div className="relative shrink-0" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        type="button"
        title={group.name}
        aria-label={group.name}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? onClose() : onOpen())}
        className={navIconBtnClass(theme, hasActive)}
      >
        <BarIcon className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[200] min-w-[220px] pt-2">
          <div className={dropdownPanelClass(theme, isMore)}>
            {navDropdownSections(group).map((section) => (
              <div key={section.label || '_'} className={section.label ? 'mb-2 last:mb-0' : ''}>
                {section.label ? (
                  <p
                    className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                      theme === 'steel' ? 'text-[#7f8b99]' : theme === 'aurora' ? 'text-[#8b7aa8]' : 'text-slate-500'
                    }`}
                  >
                    {section.label}
                  </p>
                ) : null}
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon
                    const active = navItemActive(item, location.pathname, location.search)
                    return (
                      <Link
                        key={`${section.label}-${item.path}`}
                        to={item.path}
                        onClick={onClose}
                        className={dropdownLinkClass(theme, active)}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function NavLink({
  item,
  onClick,
  theme,
}: {
  item: NavItem
  onClick?: () => void
  theme: AppTheme
}) {
  const location = useLocation()
  const active = navItemActive(item, location.pathname, location.search)
  const Icon = item.icon

  if (theme === 'steel') {
    return (
      <Link
        to={item.path}
        onClick={onClick}
        className={`nav-steel-link flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium no-underline transition-colors ${
          active ? 'nav-steel-link-active text-[#eef3f8]' : 'text-[#9aa8b8] hover:text-white hover:bg-white/5'
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" aria-hidden />
        {item.label}
      </Link>
    )
  }

  if (theme === 'aurora') {
    return (
      <Link
        to={item.path}
        onClick={onClick}
        className={`nav-aurora-link flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium no-underline transition-colors ${
          active ? 'nav-aurora-link-active text-[#f5f3ff]' : 'text-[#a89ec8] hover:text-[#f5f3ff] hover:bg-white/5'
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" aria-hidden />
        {item.label}
      </Link>
    )
  }

  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors no-underline ${
        active
          ? 'bg-blue-600/90 text-white shadow-lg shadow-blue-600/20'
          : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" aria-hidden />
      {item.label}
    </Link>
  )
}

type NavIconClusterProps = {
  pinnedPaths: string[]
  openDropdown: string | null
  setOpenDropdown: (name: string | null) => void
  desktopNavRef: React.RefObject<HTMLDivElement | null>
}

export default function NavIconCluster({
  pinnedPaths,
  openDropdown,
  setOpenDropdown,
  desktopNavRef,
}: NavIconClusterProps) {
  const { user } = useAuth()
  const { theme } = useTheme()
  const location = useLocation()
  const navGroups = filterNavGroups(allNavGroups, user?.role)
  const steel = theme === 'steel'
  const aurora = theme === 'aurora'

  return (
    <div
      ref={desktopNavRef}
      className="hidden md:flex flex-1 min-w-0 items-center justify-center gap-2 overflow-visible lg:gap-3"
    >
      {pinnedPaths.length > 0 ? (
        <div
          className={`flex items-center gap-0.5 mr-1 pr-2 shrink-0 max-w-[12rem] xl:max-w-[14rem] ${
            steel
              ? 'border-r border-[rgba(140,160,190,0.2)]'
              : aurora
                ? 'border-r border-[rgba(167,139,250,0.2)]'
                : 'border-r border-slate-700/60'
          }`}
        >
          {pinnedPaths.slice(0, 3).map((path) => (
            <Link
              key={path}
              to={path}
              title={getPageLabel(path)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium truncate max-w-[5rem] xl:max-w-[5.5rem] transition-colors ${
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

      <nav aria-label="Main navigation" className="flex items-center gap-0.5 overflow-visible">
        {navGroups.map((group) => (
          <DesktopNavDropdown
            key={group.name}
            group={group}
            theme={theme}
            open={openDropdown === group.name}
            onOpen={() => setOpenDropdown(group.name)}
            onClose={() => setOpenDropdown(null)}
          />
        ))}
      </nav>

      <div
        className={`flex flex-shrink-0 items-center gap-0.5 border-l pl-2 ${
          steel ? 'border-[rgba(140,160,190,0.2)]' : aurora ? 'border-[rgba(167,139,250,0.2)]' : 'border-slate-700/60'
        }`}
        aria-label="Toolbar shortcuts"
      >
        {TOP_BAR_QUICK_LINKS.map((item) => {
          const QIcon = item.icon
          const quickActive = navItemActive(item, location.pathname, location.search)
          return (
            <Link
              key={item.path}
              to={item.path}
              title={item.label}
              aria-label={item.label}
              aria-current={quickActive ? 'page' : undefined}
              className={navIconBtnClass(theme, quickActive)}
            >
              <QIcon className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden />
            </Link>
          )
        })}
      </div>
    </div>
  )
}

/** Mobile drawer sections — same data as desktop dropdowns. */
export function MobileNavSections({ onNavigate }: { onNavigate: () => void }) {
  const { theme } = useTheme()

  return (
    <>
      {allNavGroups.map((group) => (
        <div key={group.name} className="px-0 py-0">
          <div
            className={`text-[10px] font-bold uppercase tracking-wider px-3 mb-1.5 ${
              theme === 'steel' ? 'text-[#7f8b99]' : theme === 'aurora' ? 'text-[#8b7aa8]' : 'text-slate-500'
            }`}
          >
            {group.name}
          </div>
          <div className="space-y-3">
            {navDropdownSections(group).map((section) => (
              <div key={section.label || '_'}>
                {section.label ? (
                  <p
                    className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 pl-3 ${
                      theme === 'steel' ? 'text-[#7f8b99]/80' : theme === 'aurora' ? 'text-[#8b7aa8]/80' : 'text-slate-500/80'
                    }`}
                  >
                    {section.label}
                  </p>
                ) : null}
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink key={`${section.label}-${item.path}`} item={item} theme={theme} onClick={onNavigate} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

export { flattenNavGroup }
