import { Link } from 'react-router'
import { Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
      <div className="relative mb-6">
        <div className="text-[140px] font-extrabold leading-none bg-gradient-to-b from-gray-500 via-gray-700 to-transparent bg-clip-text text-transparent select-none tracking-tight">
          404
        </div>
        <div className="absolute inset-0 text-[140px] font-extrabold leading-none text-transparent select-none tracking-tight blur-2xl bg-gradient-to-b from-blue-500/10 to-transparent bg-clip-text">
          404
        </div>
      </div>
      <h2 className="text-lg font-semibold text-white mb-1">Page not found</h2>
      <p className="text-sm text-gray-500 mb-8 max-w-sm">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl transition-all text-sm text-gray-300 card-hover"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </button>
        <Link
          to="/"
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-xl transition-all text-sm text-white shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30"
        >
          <Home className="w-4 h-4" />
          Dashboard
        </Link>
      </div>
    </div>
  )
}
