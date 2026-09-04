// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { AlertCircle, Loader2, Lock, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { formatUserError } from '../utils/apiError'

function ZMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M2 2h14L6.6 16H16"
        fill="none"
        stroke="#ff5a15"
        strokeWidth="2.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

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
      <div className="signin-glow" aria-hidden="true" />

      <Link to="/" className="signin-logo animate-fade-in">
        <span className="signin-logo-mark">
          <ZMark />
        </span>
        <span className="signin-logo-word">Zyvor Fabric</span>
      </Link>

      <div className="signin-card animate-fade-in" style={{ animationDelay: '0.08s' }}>
        <h1>Sign in</h1>
        <p className="sub">Use your Fabric account to open the console.</p>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <label className="signin-label" htmlFor="username">
              Username
            </label>
            <div className="signin-input-wrap">
              <span className="signin-field-icon">
                <User size={17} strokeWidth={1.75} />
              </span>
              <input
                id="username"
                className="signin-input"
                autoComplete="username"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="signin-label" htmlFor="password">
              Password
            </label>
            <div className="signin-input-wrap">
              <span className="signin-field-icon">
                <Lock size={16} strokeWidth={1.75} />
              </span>
              <input
                id="password"
                type="password"
                className="signin-input"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {error && (
            <div className="signin-error animate-fade-in" role="alert">
              <AlertCircle size={15} strokeWidth={2} style={{ marginTop: 1, flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="signin-submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 size={17} strokeWidth={2.25} className="animate-spin" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>
      </div>

      <p className="signin-footer">© 2026 Zyvor. All rights reserved.</p>
    </div>
  )
}
