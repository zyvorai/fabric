interface StatusBadgeProps {
  status: string
  variant?: 'dot' | 'pill'
}

const statusStyles: Record<string, string> = {
  running: 'text-green-400 bg-green-400/10',
  active: 'text-green-400 bg-green-400/10',
  enabled: 'text-green-400 bg-green-400/10',
  healthy: 'text-green-400 bg-green-400/10',
  completed: 'text-green-400 bg-green-400/10',
  success: 'text-green-400 bg-green-400/10',
  stopped: 'text-red-400 bg-red-400/10',
  failed: 'text-red-400 bg-red-400/10',
  error: 'text-red-400 bg-red-400/10',
  disabled: 'text-red-400 bg-red-400/10',
  paused: 'text-yellow-400 bg-yellow-400/10',
  warning: 'text-yellow-400 bg-yellow-400/10',
  pending: 'text-yellow-400 bg-yellow-400/10',
  unknown: 'text-gray-400 bg-gray-400/10',
}

export function StatusBadge({ status, variant = 'pill' }: StatusBadgeProps) {
  const style = statusStyles[status.toLowerCase()] || statusStyles.unknown

  if (variant === 'dot') {
    const dotColor = style.split(' ')[0].replace('text-', 'bg-')
    return (
      <span className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} aria-hidden="true" />
        <span className="capitalize">{status}</span>
      </span>
    )
  }

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${style}`}>
      {status}
    </span>
  )
}
