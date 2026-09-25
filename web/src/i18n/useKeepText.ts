// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useSyncExternalStore } from 'react'
import { detectLocale, KeepKey, Locale, saveLocale, translate } from './keep'

let current: Locale = detectLocale()
const listeners = new Set<() => void>()

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** The Keep pages' language and translator. The choice is shared across pages and remembered. */
export function useKeepText() {
  const locale = useSyncExternalStore(subscribe, () => current, () => 'en' as Locale)
  const t = useCallback(
    (key: KeepKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  )
  const toggle = useCallback(() => {
    current = current === 'en' ? 'zh-CN' : 'en'
    saveLocale(current)
    listeners.forEach((fn) => fn())
  }, [])
  return { t, locale, toggle }
}
