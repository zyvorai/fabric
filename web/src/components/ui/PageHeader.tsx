// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  onRefresh?: () => void
  refreshing?: boolean
  primaryAction?: ReactNode
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
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 border border-slate-700/50 hover:bg-slate-800/60 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
        {primaryAction}
        {actions}
      </div>
    </div>
  )
}
