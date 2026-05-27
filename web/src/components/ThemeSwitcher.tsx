// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { Moon, Cloud, Sparkles } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

/** Login-page theme picker — 3-column Dark / Steel / Aurora grid (Machina-style). */
export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const isSteel = theme === 'steel'
  const isAurora = theme === 'aurora'
  const shell = isSteel
    ? 'border-[rgba(140,160,190,0.25)] bg-[#1a2230]/92 shadow-lg shadow-black/30'
    : isAurora
      ? 'border-[rgba(167,139,250,0.3)] bg-[#0a0618]/92 shadow-lg shadow-violet-900/40'
      : 'border-slate-600/50 bg-slate-900/85 shadow-lg shadow-black/40'

  return (
    <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-30" role="group" aria-label="Theme">
      <div className={`login-theme-switch grid grid-cols-3 gap-1 rounded-xl p-1 backdrop-blur-xl border ${shell}`}>
        {(
          [
            { id: 'dark' as const, label: 'Dark', Icon: Moon },
            { id: 'steel' as const, label: 'Steel', Icon: Cloud },
            { id: 'aurora' as const, label: 'Aurora', Icon: Sparkles },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            className={`login-theme-btn rounded-lg border px-2 py-2 text-[10px] font-semibold uppercase tracking-wide flex flex-col items-center gap-1 transition ${
              theme === id
                ? isAurora && id === 'aurora'
                  ? 'border-cyan-400/80 bg-cyan-500/15 text-cyan-100 ring-2 ring-violet-400/40'
                  : 'border-blue-500/80 bg-blue-500/20 text-blue-100 ring-2 ring-blue-400/30'
                : 'border-transparent text-slate-400 hover:bg-white/5'
            }`}
          >
            <Icon className="w-4 h-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
