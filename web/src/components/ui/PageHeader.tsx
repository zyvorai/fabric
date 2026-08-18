// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { ReactNode, type ComponentType } from 'react'
import { RefreshCw } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  onRefresh?: () => void
  refreshing?: boolean
  primaryAction?: ReactNode
  /** Optional lucide icon, rendered in a glass squircle tile beside the title. */
  icon?: ComponentType<{ className?: string }>
  /** Tint for the icon tile, matches the .icon-tile-{color} palette. */
  iconColor?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'cyan'
}

export function PageHeader({
  title,
  description,
  actions,
  onRefresh,
  refreshing,
  primaryAction,
  icon: Icon,
  iconColor = 'blue',
}: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className={`icon-tile icon-tile-md icon-tile-${iconColor}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white truncate">{title}</h1>
          {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
        </div>
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
