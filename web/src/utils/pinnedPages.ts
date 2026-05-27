// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

const KEY = 'vmspawnd-pinned-pages'
const MAX_PINNED = 8

function loadPinned(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

function savePinned(paths: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(paths))
  } catch {
    /* ignore */
  }
}

export function getPinnedPages(): string[] {
  return loadPinned()
}

export function isPagePinned(path: string): boolean {
  const normalized = path.split('?')[0] || path
  return loadPinned().includes(normalized)
}

export function togglePinnedPage(path: string): string[] {
  const normalized = path.split('?')[0] || path
  const current = loadPinned()
  const next = current.includes(normalized)
    ? current.filter((p) => p !== normalized)
    : [normalized, ...current].slice(0, MAX_PINNED)
  savePinned(next)
  return next
}
