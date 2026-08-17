// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useEffect, useState } from 'react'
import { formatDateTime, formatRelativeTime } from '../utils/format'

interface RelativeTimeProps {
  date: string | Date
  className?: string
}

/** Live "3m ago" label; hover for the exact timestamp. Ticks forward on its own so it doesn't go stale on a long-open page. */
export default function RelativeTime({ date, className = '' }: RelativeTimeProps) {
  const [, forceTick] = useState(0)

  useEffect(() => {
    const i = setInterval(() => forceTick((n) => n + 1), 30_000)
    return () => clearInterval(i)
  }, [])

  if (!date) return <span className={className}>-</span>

  return (
    <span className={className} title={formatDateTime(date)}>
      {formatRelativeTime(date)}
    </span>
  )
}
