// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { ZyvorFooter } from '../components/ZyvorBrand'
import {
  PremiumLoginShell,
  LoginField,
  LoginError,
  LoginSubmit,
  LoginRemember,
  type PremiumLoginFeature,
} from '../components/PremiumLoginShell'
import { formatUserError } from '../utils/apiError'
import {
  Lock,
  User,
  Loader2,
  Eye,
  EyeOff,
  Server,
  Play,
  HardDrive,
  ArrowRight,
  Layers,
} from 'lucide-react'

const features: PremiumLoginFeature[] = [
  {
    icon: <Server className="w-5 h-5 text-blue-100" />,
    gradient: 'from-blue-500/95 to-indigo-800/95',
    glow: 'shadow-blue-500/25',
    title: 'Instant VM spawn',
    description: 'Launch QEMU/KVM guests from qcow2 images with network, storage, and cloud-init profiles.',
    highlight: true,
  },
  {
    icon: <Play className="w-5 h-5 text-emerald-100" />,
    gradient: 'from-emerald-500/95 to-teal-800/95',
    glow: 'shadow-emerald-500/25',
    title: 'Lifecycle control',
    description: 'Start, stop, pause, snapshot, and migrate VMs from a single control plane.',
  },
  {
    icon: <HardDrive className="w-5 h-5 text-cyan-100" />,
    gradient: 'from-cyan-500/95 to-blue-800/95',
    glow: 'shadow-cyan-500/25',
    title: 'Storage & images',
    description: 'Manage pools, disk images, backups, and golden templates for repeatable deploys.',
  },
  {
    icon: <Layers className="w-5 h-5 text-violet-100" />,
    gradient: 'from-violet-500/95 to-purple-800/95',
    glow: 'shadow-violet-500/25',
    title: 'Migration & automation',
    description: 'Bulk migrations, scheduled backups, cost estimates, and manifest-driven provisioning.',
  },
]

const logo = (
  <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-blue-400 via-blue-600 to-indigo-800 shadow-xl shadow-blue-500/40 border border-white/20">
    <Lock className="w-7 h-7 text-white drop-shadow" />
  </div>
)

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
      setError(formatUserError(err))
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PremiumLoginShell
      accent="blue"
      logo={logo}
      productName="vmspawnd"
      productSubtitle="VM spawn & lifecycle"
      heroHeadline={
        <>
          Spawn and manage
          <br />
          <span className="login-text-gradient">virtual machines at scale</span>
        </>
      }
      heroSubheadline="QEMU/KVM provisioning, storage pools, migrations, and lifecycle automation — without leaving the host."
      pills={[
        { icon: <Server className="w-3 h-3" />, label: 'QEMU/KVM', glow: true },
        { icon: <HardDrive className="w-3 h-3" />, label: 'qcow2 images' },
        { label: 'Lifecycle ops' },
        { label: 'PAM auth' },
      ]}
      features={features}
      mobileSubtitle="VM spawn & lifecycle"
      panelTitle="Welcome back"
      panelSubtitle="Sign in to your account"
      footer={<ZyvorFooter />}
    >
      <form onSubmit={handleSubmit} autoComplete="on">
        {error && (
          <LoginError message={error} />
        )}

        <div className="space-y-5">
          <LoginField label="Username" id="username">
            <User className="login-field-icon" />
            <input
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={submitting}
              autoComplete="username"
              autoFocus
              placeholder="System username"
              className="login-input"
            />
          </LoginField>

          <LoginField label="Password" id="password">
            <Lock className="login-field-icon" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={submitting}
              autoComplete="current-password"
              placeholder="Password"
              className="login-input pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </LoginField>
        </div>

        <LoginRemember checked={rememberMe} onChange={setRememberMe} label="Remember me" />

        <LoginSubmit loading={submitting} disabled={!username || !password}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin relative z-10" />
              <span className="relative z-10">Signing in…</span>
            </>
          ) : (
            <>
              <span className="relative z-10">Sign in</span>
              <ArrowRight className="h-4 w-4 relative z-10 group-hover:translate-x-0.5 transition-transform" />
            </>
          )}
        </LoginSubmit>
      </form>
    </PremiumLoginShell>
  )
}
