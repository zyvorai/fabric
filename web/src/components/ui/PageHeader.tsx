// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { ReactNode, type ComponentType } from 'react'
import { RefreshCw } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  onRefresh?: () => void
  refreshing?: boolean
  primaryAction?: ReactNode
  icon?: ComponentType<{ className?: string }>
  iconColor?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'cyan'
}

export function PageHeader({
  title,
  description,
  actions,
  onRefresh,
  refreshing,
  primaryAction,
}: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-8 animate-fade-in">
      <div className="min-w-0">
        <h1 className="text-[32px] font-semibold tracking-[-0.022em] text-[var(--zf-ink)] truncate">
          {title}
        </h1>
        {description && (
          <p className="text-[17px] text-[var(--zf-secondary)] mt-1.5 max-w-2xl leading-snug tracking-[-0.022em]">
            {description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="zf-btn zf-btn-ghost zf-btn-sm"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
        {primaryAction}
        {actions}
      </div>
    </div>
  )
}
