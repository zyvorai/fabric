import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-gray-800 border border-gray-700 rounded-lg ${className}`}>
      {children}
    </div>
  )
}

export function CardBody({ children, className = '' }: CardProps) {
  return (
    <div className={`p-4 ${className}`}>
      {children}
    </div>
  )
}
