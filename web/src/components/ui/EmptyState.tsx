// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-20 px-4">
      <div className="icon-tile icon-tile-lg mx-auto mb-5 text-[var(--zf-muted)]">{icon}</div>
      <h3 className="text-[21px] font-semibold tracking-[-0.016em] text-[var(--zf-ink)] mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-[17px] text-[var(--zf-secondary)] mb-6 max-w-md mx-auto tracking-[-0.022em]">
          {description}
        </p>
      )}
      {action}
    </div>
  )
}
