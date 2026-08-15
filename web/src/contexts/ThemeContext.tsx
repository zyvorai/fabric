// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

export type AppTheme = 'dark' | 'steel' | 'aurora'

const THEME_CYCLE: AppTheme[] = ['dark', 'steel', 'aurora']

interface ThemeContextType {
  theme: AppTheme
  setTheme: (t: AppTheme) => void
  cycleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  cycleTheme: () => {},
})

function parseStoredTheme(raw: string | null): AppTheme {
  if (raw === 'light') return 'dark'
  if (raw === 'aurora' || raw === 'steel' || raw === 'dark') return raw
  return 'dark'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() =>
    parseStoredTheme(typeof localStorage !== 'undefined' ? localStorage.getItem('zyvor-fabricd-theme') : null),
  )

  const setTheme = useCallback((t: AppTheme) => {
    setThemeState(t)
  }, [])

  useEffect(() => {
    localStorage.setItem('zyvor-fabricd-theme', theme)
    const root = document.documentElement
    root.classList.remove('steel-theme', 'aurora-theme')
    if (theme === 'steel') {
      root.classList.add('steel-theme')
    } else if (theme === 'aurora') {
      root.classList.add('aurora-theme')
    }
  }, [theme])

  const cycleTheme = useCallback(() => {
    setThemeState((t) => {
      const i = THEME_CYCLE.indexOf(t)
      return THEME_CYCLE[(i + 1) % THEME_CYCLE.length]
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
