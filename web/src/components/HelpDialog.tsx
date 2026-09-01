// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useRef } from 'react'
import { X, Keyboard, Info } from 'lucide-react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { helpShortcuts } from './helpShortcuts'
import ZyvorAbout from './ZyvorAbout'
// ZyvorAbout — Zyvor Fabric product panel

export type HelpTab = 'shortcuts' | 'about'

type HelpDialogProps = {
  open: boolean
  tab: HelpTab
  onClose: () => void
  onTabChange: (tab: HelpTab) => void
}

const TABS: { id: HelpTab; label: string; icon: React.ReactNode }[] = [
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard className="w-4 h-4" aria-hidden /> },
  { id: 'about', label: 'About', icon: <Info className="w-4 h-4" aria-hidden /> },
]

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="px-1.5 py-0.5 bg-[#e8e8ed] border border-[#d2d2d7] rounded text-xs font-mono text-[#1d1d1f] min-w-[1.5rem] text-center">
      {children}
    </kbd>
  )
}

export default function HelpDialog({ open, tab, onClose, onTabChange }: HelpDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, open)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm animate-fade-in flex items-start justify-center pt-[8vh] px-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Help"
        className="bg-white border border-[#d2d2d7] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#d2d2d7]">
          <h2 className="text-lg font-semibold text-[#1d1d1f]">Help</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-black/[0.04] rounded-lg transition text-[#6e6e73] hover:text-[#1d1d1f]"
            aria-label="Close help"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-[#d2d2d7] px-2 pt-1" role="tablist" aria-label="Help sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTabChange(t.id)}
              className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-blue-500 text-[#0066cc]'
                  : 'border-transparent text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="max-h-[min(70vh,32rem)] overflow-y-auto p-5">
          {tab === 'shortcuts' ? (
            <div role="tabpanel">
              <div className="space-y-3">
                {helpShortcuts.map((s) => (
                  <div key={s.description} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-[#1d1d1f]">{s.description}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.keys.map((k, i) => (
                        <span key={`${s.description}-${k}-${i}`} className="flex items-center gap-1">
                          {i > 0 && <span className="text-[#6e6e73] text-xs">+</span>}
                          <Kbd>{k}</Kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#6e6e73] mt-4 pt-3 border-t border-[#d2d2d7]">
                Shortcuts are disabled when typing in input fields. Open{' '}
                <strong className="text-[#6e6e73]">Help → About</strong> for product info and documentation links.
              </p>
            </div>
          ) : (
            <div role="tabpanel">
              <ZyvorAbout />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
