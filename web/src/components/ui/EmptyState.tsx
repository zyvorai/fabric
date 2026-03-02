import { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <div className="text-gray-500 mb-4 flex justify-center">{icon}</div>
      <h3 className="text-lg font-medium text-gray-300 mb-2">{title}</h3>
      {description && <p className="text-gray-500 mb-4">{description}</p>}
      {action}
    </div>
  )
}
