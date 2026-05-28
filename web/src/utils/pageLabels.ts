// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { navGroups, routeLabels, flattenNavGroup } from './routes'

/** Human-readable label for an app route path. */
export function getPageLabel(path: string): string {
  const base = path.split('?')[0] || '/'
  if (routeLabels[base]) return routeLabels[base]

  for (const group of navGroups) {
    for (const item of flattenNavGroup(group)) {
      const itemPath = item.path.split('?')[0]
      if (itemPath === base) return item.label
    }
  }

  const segments = base.split('/').filter(Boolean)
  const slug = segments[segments.length - 1] || 'Page'
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
