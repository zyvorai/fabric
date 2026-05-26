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
    <div className="text-center py-16 px-4">
      <div className="text-slate-600 mb-4 flex justify-center">{icon}</div>
      <h3 className="text-sm font-medium text-slate-400 mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-600 mb-4">{description}</p>}
      {action}
    </div>
  )
}
