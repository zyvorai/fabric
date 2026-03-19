import React from 'react'
import { AlertTriangle } from 'lucide-react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
          <div className="p-3 rounded-xl bg-red-500/10 mb-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-1">Something went wrong</h2>
          <p className="text-sm text-gray-500 mb-6 text-center max-w-md">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors text-sm font-medium text-white"
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export function PageErrorBoundary({ children }: { children: React.ReactNode }) {
  const [key, setKey] = React.useState(0)

  return (
    <ErrorBoundary
      key={key}
      fallback={
        <div className="flex flex-col items-center justify-center p-12">
          <div className="p-2.5 rounded-xl bg-yellow-500/10 mb-3">
            <AlertTriangle className="w-6 h-6 text-yellow-400" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">Section error</h3>
          <p className="text-sm text-gray-500 mb-5">This section encountered an error</p>
          <div className="flex gap-2">
            <button
              onClick={() => setKey((k) => k + 1)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors text-sm font-medium"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-lg transition-colors text-sm text-gray-300"
            >
              Reload Page
            </button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}
