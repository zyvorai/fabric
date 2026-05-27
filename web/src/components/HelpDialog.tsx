// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useRef } from 'react'
import { X, Keyboard, Info } from 'lucide-react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { helpShortcuts } from './helpShortcuts'
import ZyvorAbout from './ZyvorAbout'
// ZyvorAbout is vmspawnd-branded

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
    <kbd className="px-1.5 py-0.5 bg-slate-700 border border-slate-600 rounded text-xs font-mono text-slate-300 min-w-[1.5rem] text-center">
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
        className="bg-slate-800 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Help</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded-lg transition text-slate-400 hover:text-white"
            aria-label="Close help"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-slate-700/50 px-2 pt-1" role="tablist" aria-label="Help sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTabChange(t.id)}
              className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
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
                    <span className="text-sm text-slate-300">{s.description}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.keys.map((k, i) => (
                        <span key={`${s.description}-${k}-${i}`} className="flex items-center gap-1">
                          {i > 0 && <span className="text-slate-600 text-xs">+</span>}
                          <Kbd>{k}</Kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-4 pt-3 border-t border-slate-700/50">
                Shortcuts are disabled when typing in input fields. Open{' '}
                <strong className="text-slate-400">Help → About</strong> for product info and documentation links.
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
