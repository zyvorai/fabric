interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

function SkeletonBase({ className = '', style }: SkeletonProps) {
  return <div className={`animate-pulse bg-gray-700 rounded ${className}`} style={style} />
}

export function SkeletonText({ className = '' }: SkeletonProps) {
  return <SkeletonBase className={`h-4 ${className}`} />
}

export function SkeletonCard() {
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <SkeletonBase className="h-6 w-40 mb-2" />
          <SkeletonBase className="h-4 w-20" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <SkeletonBase className="h-4 w-24" />
        <SkeletonBase className="h-4 w-24" />
      </div>
      <div className="flex gap-2">
        <SkeletonBase className="h-9 w-20" />
        <SkeletonBase className="h-9 w-20" />
        <SkeletonBase className="h-9 w-16" />
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <div className="grid gap-4 p-4 border-b border-gray-700" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBase key={i} className="h-4" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="grid gap-4 p-4 border-b border-gray-700 last:border-b-0"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: cols }).map((_, col) => (
            <SkeletonBase key={col} className="h-4" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonChart() {
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <SkeletonBase className="h-5 w-32 mb-4" />
      <div className="flex items-end gap-2 h-40">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonBase
            key={i}
            className="flex-1"
            style={{ height: `${20 + Math.random() * 80}%` } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <SkeletonBase className="h-4 w-24 mb-2" />
            <SkeletonBase className="h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonChart />
        <SkeletonChart />
      </div>
    </div>
  )
}
