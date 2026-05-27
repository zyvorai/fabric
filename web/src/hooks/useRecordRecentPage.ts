// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { recordRecentPage } from '../utils/recentPages'

/** Records the current route for command palette "Recent pages". */
export function useRecordRecentPage() {
  const location = useLocation()

  useEffect(() => {
    recordRecentPage(location.pathname + location.search)
  }, [location.pathname, location.search])
}
