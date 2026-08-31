// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

export {
  NAV_GROUPS as navGroups,
  ALL_NAV_ITEMS,
  TOP_BAR_QUICK_LINKS,
  PAGE_TITLE_BY_PATH,
  routeLabels,
  flattenNavGroup,
  navDropdownSections,
  type NavItem,
  type NavGroup,
  type NavSection,
} from '../navigation/navConfig'

import type { NavGroup, NavItem } from '../navigation/navConfig'
import { flattenNavGroup } from '../navigation/navConfig'

export function navItemActive(item: NavItem, pathname: string, search = ''): boolean {
  const [path, query] = item.path.split('?')
  if (query) {
    if (pathname !== path) return false
    const params = new URLSearchParams(query)
    for (const [k, v] of params.entries()) {
      if (new URLSearchParams(search).get(k) !== v) return false
    }
    return true
  }
  if (path === '/' || path === '/app') return pathname === path || pathname === '/app/'
  return pathname === path || pathname.startsWith(path + '/')
}

export function navGroupHasActive(group: NavGroup, pathname: string, search = ''): boolean {
  return flattenNavGroup(group).some((item) => navItemActive(item, pathname, search))
}
