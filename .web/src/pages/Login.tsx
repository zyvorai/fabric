import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { Lock, User, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const [username, setUsername] = useState(() => localStorage.getItem('vmspawnd_username') || '')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem('vmspawnd_username'))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      await login(username, password)
      if (rememberMe) {
        localStorage.setItem('vmspawnd_username', username)
      } else {
        localStorage.removeItem('vmspawnd_username')
      }
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 page-bg">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-600/20">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gradient-blue">
            vmspawnd
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            Sign in to your account
          </p>
        </div>

        {/* Login form */}
        <form
          onSubmit={handleSubmit}
          className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl border-gradient"
        >
          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2.5 bg-red-900/30 border border-red-800/50 rounded-lg p-3 mb-6">
              <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-400">{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-1.5">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={submitting}
                  autoComplete="username"
                  autoFocus
                  placeholder="System username"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={submitting}
                  autoComplete="current-password"
                  placeholder="Password"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Remember Me */}
          <div className="mt-4">
            <label className="flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={submitting}
                className="w-4 h-4 mr-2 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 disabled:cursor-not-allowed accent-blue-500"
              />
              <span className="text-sm text-slate-400 font-medium">
                Remember me
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting || !username || !password}
            className="w-full mt-6 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-medium rounded-lg py-2.5 px-4 transition-all hover:scale-[1.02] text-sm disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-blue-600/20"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</>
            ) : (
              <><Lock className="h-4 w-4" /> Sign in</>
            )}
          </button>

          {/* Footer */}
          <div className="mt-5 pt-4 border-t border-slate-700/50 text-center">
            <span className="text-slate-500 text-xs">
              Virtual Machine Manager &middot; Powered by systemd-vmspawn
            </span>
          </div>
        </form>
      </div>
    </div>
  )
}
