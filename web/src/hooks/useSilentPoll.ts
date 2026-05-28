// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useEffect } from 'react'

/** Poll on an interval; initial load is the caller's responsibility. */
export function useSilentPoll(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => void callback(), intervalMs)
    return () => clearInterval(id)
  }, [callback, intervalMs, enabled])
}
