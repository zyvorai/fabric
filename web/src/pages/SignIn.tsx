// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { formatUserError } from '../utils/apiError'

export default function SignIn() {
  const { login, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && isAuthenticated) {
    return <Navigate to="/app" replace />
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(formatUserError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="signin-page">
      <div className="signin-card animate-fade-in">
        <Link to="/" className="block text-center text-[13px] font-semibold tracking-[-0.02em] text-[var(--zf-ink)] mb-8">
          Zyvor Fabric
        </Link>
        <h1>Sign in</h1>
        <p className="sub">Use your Fabric account to open the console.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--zf-muted)] mb-1.5" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="input-field"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--zf-muted)] mb-1.5" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input-field"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="text-sm text-[var(--zf-danger)]" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="zf-btn zf-btn-primary w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
