// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { ZyvorBrandLine } from '../components/ZyvorBrand'
import ThemeSwitcher from '../components/ThemeSwitcher'
import {
  PremiumLoginShell,
  LoginField,
  LoginError,
  LoginSubmit,
  LoginRemember,
  type PremiumLoginFeature,
} from '../components/PremiumLoginShell'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
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
  Activity,
  Zap,
  CheckCircle,
} from 'lucide-react'

const SAVED_LOGIN_KEY = 'vmspawnd-saved-login'

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
    description: 'Start, stop, pause, snapshot, hotplug, and migrate VMs from a single control plane.',
  },
  {
    icon: <HardDrive className="w-5 h-5 text-cyan-100" />,
    gradient: 'from-cyan-500/95 to-blue-800/95',
    glow: 'shadow-cyan-500/25',
    title: 'Storage & images',
    description: 'Manage pools, disk images, backups, and golden templates for repeatable deploys.',
  },
  {
    icon: <Activity className="w-5 h-5 text-purple-100" />,
    gradient: 'from-purple-500/95 to-fuchsia-800/95',
    glow: 'shadow-purple-500/25',
    title: 'Monitoring & automation',
    description: 'Autoscale policies, scheduled backups, cost estimates, and manifest-driven provisioning.',
  },
  {
    icon: <Layers className="w-5 h-5 text-violet-100" />,
    gradient: 'from-violet-500/95 to-purple-800/95',
    glow: 'shadow-violet-500/25',
    title: 'RBAC & multi-user',
    description: 'Admin, operator, and viewer roles with JWT auth and optional system PAM login.',
  },
]

function BoltLogo({ className = 'w-7 h-7' }: { className?: string }) {
  return <Zap className={className} aria-hidden />
}

export default function Login() {
  const saved = (() => {
    try {
      const raw = localStorage.getItem(SAVED_LOGIN_KEY)
      return raw ? (JSON.parse(raw) as { username?: string; password?: string }) : null
    } catch {
      return null
    }
  })()

  const [username, setUsername] = useState(saved?.username ?? localStorage.getItem('vmspawnd_username') ?? '')
  const [password, setPassword] = useState(saved?.password ? atob(saved.password) : '')
  const [rememberMe, setRememberMe] = useState(!!saved || !!localStorage.getItem('vmspawnd_username'))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { login } = useAuth()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const reducedMotion = usePrefersReducedMotion()

  const isSteel = theme === 'steel'
  const isAurora = theme === 'aurora'
  const pageThemeClass = isSteel ? 'login-page-steel' : isAurora ? 'login-page-aurora' : ''
  const hostLabel = typeof window !== 'undefined' ? window.location.hostname : ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Username and password are required')
      return
    }
    setError('')
    setSubmitting(true)

    try {
      await login(username.trim(), password)
      if (rememberMe) {
        localStorage.setItem(
          SAVED_LOGIN_KEY,
          JSON.stringify({ username: username.trim(), password: btoa(password) }),
        )
        localStorage.setItem('vmspawnd_username', username.trim())
      } else {
        localStorage.removeItem(SAVED_LOGIN_KEY)
        localStorage.removeItem('vmspawnd_username')
      }
      navigate('/')
    } catch (err) {
      setError(formatUserError(err) || 'Login failed')
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  const logo = (
    <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-blue-400 via-blue-600 to-indigo-800 shadow-xl shadow-blue-500/40 border border-white/20">
      <BoltLogo className="w-7 h-7 text-white drop-shadow" />
    </div>
  )

  return (
    <PremiumLoginShell
      pageThemeClass={pageThemeClass}
      themeSwitcher={<ThemeSwitcher />}
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
      heroSubheadline="QEMU/KVM provisioning, storage pools, hotplug, autoscale, and lifecycle automation — on the hypervisor host."
      pills={[
        { icon: <Server className="w-3 h-3" />, label: 'QEMU/KVM', glow: true },
        { icon: <HardDrive className="w-3 h-3" />, label: 'qcow2 images' },
        { label: 'Hotplug & RBAC' },
        { label: 'PAM + local auth' },
      ]}
      features={features}
      heroFooter={<ZyvorBrandLine />}
      hostLabel={hostLabel}
      mobileSubtitle="QEMU/KVM · lifecycle · storage"
      panelTitle="Welcome back"
      panelSubtitle="Sign in to spawn and manage VMs"
      panelHint={
        <>
          Use the <code className="text-[11px] px-1 rounded bg-slate-800/80 text-slate-300">admin</code> account
          (see <code className="text-[11px] px-1 rounded bg-slate-800/80 text-slate-300">.admin_password</code> on
          the host) or your system SSH credentials.
        </>
      }
    >
      <form onSubmit={handleSubmit} autoComplete="on" aria-label="Sign in">
        {error ? <LoginError message={error} reducedMotion={reducedMotion} /> : null}

        <div className="space-y-5">
          <LoginField label="Username" id="login-username">
            <User className="login-field-icon" />
            <input
              id="login-username"
              name="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={submitting}
              autoComplete="username"
              autoFocus
              placeholder="admin"
              className="login-input"
            />
          </LoginField>

          <LoginField label="Password" id="login-password">
            <Lock className="login-field-icon" />
            <input
              id="login-password"
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

        <LoginRemember
          checked={rememberMe}
          onChange={(checked) => {
            setRememberMe(checked)
            if (!checked) {
              localStorage.removeItem(SAVED_LOGIN_KEY)
              localStorage.removeItem('vmspawnd_username')
            }
          }}
          label="Remember me on this device"
        />

        <LoginSubmit loading={submitting} disabled={!username || !password}>
          {submitting ? (
            <>
              <Loader2 className={`h-4 w-4 relative z-10 ${reducedMotion ? '' : 'animate-spin'}`} />
              <span className="relative z-10">Signing in…</span>
            </>
          ) : (
            <>
              <span className="relative z-10">Sign in with password</span>
              <ArrowRight className="h-4 w-4 relative z-10 group-hover:translate-x-0.5 transition-transform" />
            </>
          )}
        </LoginSubmit>

        <div className="mt-6 pt-5 border-t border-slate-700/50 flex items-center justify-center gap-2 text-xs text-slate-500">
          <CheckCircle className="h-3.5 w-3.5 text-emerald-500/70" aria-hidden />
          <span>Secured with local accounts and system PAM</span>
        </div>
      </form>
    </PremiumLoginShell>
  )
}
