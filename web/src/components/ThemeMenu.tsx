// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { Palette, Sparkles } from 'lucide-react'
import { useTheme, type AppTheme } from '../contexts/ThemeContext'

/** Navbar theme select + cycle button (Machina-style). */
export default function ThemeMenu() {
  const { theme, setTheme, cycleTheme } = useTheme()
  const steel = theme === 'steel'
  const aurora = theme === 'aurora'

  return (
    <>
      <label className="flex items-center gap-1 shrink-0 min-w-0" title="Theme">
        <Palette
          className={`w-3.5 h-3.5 shrink-0 ${steel ? 'text-[#8fa0b2]' : aurora ? 'text-[#a89ec8]' : 'text-slate-500'}`}
          aria-hidden
        />
        <select
          aria-label="Theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value as AppTheme)}
          className={`text-xs rounded-xl border px-1.5 sm:px-2 py-1.5 max-w-[6.5rem] sm:max-w-[7.5rem] cursor-pointer outline-none transition min-w-0 ${
            steel
              ? 'nav-steel-select text-[#d7dde5]'
              : aurora
                ? 'nav-aurora-select text-[#e8e4f8]'
                : 'bg-slate-900/80 border-slate-600 text-slate-200'
          }`}
        >
          <option value="dark">Dark</option>
          <option value="steel">Steel</option>
          <option value="aurora">Aurora</option>
        </select>
      </label>
      <button
        type="button"
        onClick={() => void cycleTheme()}
        className={`p-1.5 rounded-lg transition shrink-0 ${
          steel
            ? 'text-[#9aa8b8] hover:text-white hover:bg-white/5'
            : aurora
              ? 'text-[#a89ec8] hover:text-[#f5f3ff] hover:bg-white/5'
              : 'hover:bg-[#d2d2d7] text-slate-400 hover:text-white'
        }`}
        title="Cycle theme (dark → steel → aurora)"
        aria-label="Cycle theme"
      >
        <Sparkles className={`w-4 h-4 ${aurora ? 'text-[#67e8f9]' : ''}`} />
      </button>
    </>
  )
}
