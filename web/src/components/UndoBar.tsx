// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { Undo2 } from 'lucide-react'
import type { PendingUndo } from '../hooks/useUndoableAction'

interface UndoBarProps {
  pending: PendingUndo | null
  onUndo: () => void
}

/** Bottom-center grace-period bar for a deferred destructive action — pairs with useUndoableAction. */
export default function UndoBar({ pending, onUndo }: UndoBarProps) {
  if (!pending) return null
  const progress = (pending.secondsLeft / pending.totalSeconds) * 100

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-in">
      <div className="flex items-center gap-4 pl-4 pr-2 py-2 rounded-xl border border-[#d2d2d7] bg-white backdrop-blur-md shadow-xl">
        <span className="text-sm text-[#1d1d1f]">{pending.label}</span>
        <button
          type="button"
          onClick={onUndo}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0066cc]/10 border border-[#0066cc]/30 text-[#0066cc] text-xs font-medium hover:bg-[#0066cc]/15 transition-colors"
        >
          <Undo2 className="w-3.5 h-3.5" />
          Undo
        </button>
        <svg className="w-6 h-6 -rotate-90 shrink-0" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#d2d2d7]" />
          <circle
            cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"
            className="text-[#0066cc] transition-all duration-1000 ease-linear"
            strokeDasharray={2 * Math.PI * 10}
            strokeDashoffset={2 * Math.PI * 10 * (1 - progress / 100)}
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  )
}
