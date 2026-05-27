// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { navGroups, routeLabels } from './routes'

/** Human-readable label for an app route path. */
export function getPageLabel(path: string): string {
  const base = path.split('?')[0] || '/'
  if (routeLabels[base]) return routeLabels[base]

  for (const group of navGroups) {
    for (const item of group.items) {
      const itemPath = item.to.split('?')[0]
      if (itemPath === base) return item.label
    }
  }

  const segments = base.split('/').filter(Boolean)
  return segments[segments.length - 1] || 'Page'
}
