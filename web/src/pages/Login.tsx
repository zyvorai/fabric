// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { ZyvorBrandLine } from '../components/ZyvorBrand'
import { ZYVOR_FABRIC_HELP } from '../config/zyvorHelp'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { formatUserError } from '../utils/apiError'
import {
  Lock,
  User,
  AlertCircle,
  Server,
  Loader2,
  Eye,
  EyeOff,
  HardDrive,
  ArrowRight,
  Layers,
  Activity,
  Zap,
  Moon,
  Cloud,
  Sparkles,
  CheckCircle,
  Play,
} from 'lucide-react'

const SAVED_LOGIN_KEY = 'zyvor-fabricd-saved-login'

const LOGIN_ORBS = [
  { size: 340, top: '4%', left: '6%', delay: '0s', duration: '11s', hue: 'blue' as const },
  { size: 220, top: '55%', left: '12%', delay: '2.2s', duration: '13s', hue: 'violet' as const },
  { size: 180, top: '18%', left: '58%', delay: '0.8s', duration: '9s', hue: 'cyan' as const },
  { size: 400, top: '58%', left: '68%', delay: '3.2s', duration: '15s', hue: 'red' as const },
]

const PARTICLE_SEEDS = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: `${(i * 17 + 7) % 100}%`,
  top: `${(i * 23 + 11) % 100}%`,
  delay: `${(i % 7) * 0.45}s`,
  size: 2 + (i % 3),
}))

const features = [
  {
    icon: <Server className="w-5 h-5 text-blue-100" />,
    gradient: 'from-blue-500/95 to-indigo-800/95',
    glow: 'shadow-blue-500/25',
    title: 'VM lifecycle fabric',
    description: 'Create, migrate, snapshot, and operate QEMU/KVM guests with clustering, HA, and GPU passthrough.',
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
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const reducedMotion = usePrefersReducedMotion()
  const isSteel = theme === 'steel'
  const isAurora = theme === 'aurora'
  const pageThemeClass = isSteel ? 'login-page-steel' : isAurora ? 'login-page-aurora' : ''
  const hostLabel = typeof window !== 'undefined' ? window.location.hostname : ''

  async function handleSubmit(e: FormEvent) {
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

  return (
    <div
      className={`login-page min-h-screen flex flex-col lg:flex-row relative overflow-hidden ${pageThemeClass}${reducedMotion ? ' login-page-reduced-motion' : ''}`}
    >
      {!reducedMotion && <div className="login-aurora" aria-hidden />}
      {!reducedMotion && <div className="login-scanline" aria-hidden />}

      <ThemeSwitcher theme={theme} setTheme={setTheme} isSteel={isSteel} isAurora={isAurora} />

      <aside className="login-hero hidden lg:flex lg:w-[58%] flex-col justify-between p-10 xl:p-12 overflow-hidden relative">
        <div className="login-hero-mesh" aria-hidden />
        <div className="login-spotlight" aria-hidden />

        {!reducedMotion &&
          LOGIN_ORBS.map((orb, i) => (
            <div
              key={i}
              className={`login-orb login-orb-${orb.hue}`}
              style={{
                width: orb.size,
                height: orb.size,
                top: orb.top,
                left: orb.left,
                ['--login-delay' as string]: orb.delay,
                ['--login-duration' as string]: orb.duration,
              }}
            />
          ))}

        {!reducedMotion && (
          <div className="login-particles" aria-hidden>
            {PARTICLE_SEEDS.map((p) => (
              <span
                key={p.id}
                className="login-particle"
                style={{
                  left: p.left,
                  top: p.top,
                  width: p.size,
                  height: p.size,
                  animationDelay: p.delay,
                }}
              />
            ))}
          </div>
        )}

        <div className="relative z-10">
          <div className="login-fade-in flex items-center gap-4 mb-8">
            <div className="login-logo-ring">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-blue-400 via-blue-600 to-indigo-800 shadow-xl shadow-blue-500/40 border border-white/20">
                <BoltLogo className="w-7 h-7 text-white drop-shadow" />
              </div>
            </div>
            <div>
              <span className="text-4xl font-bold tracking-tight text-white block">{ZYVOR_FABRIC_HELP.name}</span>
              <span className="text-xs font-medium uppercase tracking-[0.28em] text-sky-300/80 mt-0.5 block">
                {ZYVOR_FABRIC_HELP.tagline}
              </span>
            </div>
          </div>
          <h2 className="login-fade-in login-fade-in-d1 text-4xl xl:text-[2.75rem] font-extrabold text-white leading-[1.08] mb-4 max-w-xl">
            Private cloud control plane
            <br />
            <span className="login-text-gradient">for Linux infrastructure</span>
          </h2>
          <p className="login-fade-in login-fade-in-d2 text-lg text-slate-300/90 max-w-lg leading-relaxed">
            Clustering, networking, security, storage, operators, Terraform, and monitoring — built on
            Ephemera, a disposable-VM engine with no systemd dependency.
          </p>
          <div className="login-fade-in login-fade-in-d3 flex flex-wrap gap-2 mt-6">
            <span className="login-stat-pill login-stat-pill-glow">
              <Server className="w-3 h-3" /> VMs &amp; HA
            </span>
            <span className="login-stat-pill">
              <HardDrive className="w-3 h-3" /> Storage fabric
            </span>
            <span className="login-stat-pill">Network &amp; security</span>
            <span className="login-stat-pill">PAM + RBAC</span>
          </div>
        </div>

        <div className="relative z-10 space-y-2.5 max-h-[42vh] overflow-y-auto login-feature-scroll pr-1">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`login-feature-card login-fade-in flex items-start gap-4 p-4 rounded-xl backdrop-blur-md ${
                f.highlight
                  ? 'login-feature-card-highlight'
                  : 'bg-white/[0.04] border border-white/10 hover:border-white/20'
              }`}
              style={{ animationDelay: `${0.35 + i * 0.07}s`, opacity: 0 }}
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br ${f.gradient} shadow-lg ${f.glow}`}
              >
                {f.icon}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  {f.title}
                  {f.highlight && (
                    <Sparkles className="w-3.5 h-3.5 text-amber-300/90 shrink-0" aria-hidden />
                  )}
                </div>
                <p className="text-xs mt-1 text-slate-400 leading-relaxed">{f.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative z-10 pt-4 shrink-0">
          <ZyvorBrandLine />
        </div>
      </aside>

      {!reducedMotion && <div className="login-beam hidden lg:block" aria-hidden />}

      <main className="login-panel flex-1 flex items-center justify-center relative px-6 py-12 min-h-screen">
        <div className="login-panel-grid" aria-hidden />
        <div className="login-panel-glow" aria-hidden />
        <div className="w-full max-w-[420px] relative z-10">
          <MobileBrand hostLabel={hostLabel} />
          <DesktopHeading hostLabel={hostLabel} />

          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="login-glass login-glass-border rounded-2xl p-8 shadow-2xl"
            autoComplete="on"
            aria-label="Sign in"
          >
            {error && (
              <div
                role="alert"
                className={`flex items-center gap-2.5 bg-red-950/50 border border-red-500/40 rounded-xl p-3 mb-6 ${reducedMotion ? '' : 'login-shake'}`}
              >
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0" aria-hidden />
                <span className="text-sm text-red-300">{error}</span>
              </div>
            )}

            <div className="space-y-5">
              <Field label="Username" id="login-username">
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
              </Field>

              <Field label="Password" id="login-password">
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
              </Field>
            </div>

            <label className="flex items-center gap-2.5 mt-5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => {
                  const checked = e.target.checked
                  setRememberMe(checked)
                  if (!checked) {
                    localStorage.removeItem(SAVED_LOGIN_KEY)
                    localStorage.removeItem('vmspawnd_username')
                  }
                }}
                className="w-4 h-4 rounded border-slate-600 bg-slate-900 accent-blue-500"
              />
              <span className="text-sm text-slate-400">Remember me on this device</span>
            </label>

            <button
              type="submit"
              disabled={submitting || !username || !password}
              className="login-btn-primary group"
            >
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
            </button>

            <div className="mt-6 pt-5 border-t border-slate-700/50 flex items-center justify-center gap-2 text-xs text-slate-500">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500/70" aria-hidden />
              <span>Local admin account or system PAM (Linux password)</span>
            </div>
          </form>

          <p className="text-xs text-center mt-4 max-w-sm mx-auto leading-relaxed text-slate-500">
            <strong className="text-slate-400 font-medium">Local admin:</strong> use{' '}
            <code className="text-[11px] px-1 rounded bg-slate-800/80 text-slate-300">admin</code> with the
            password in{' '}
            <code className="text-[11px] px-1 rounded bg-slate-800/80 text-slate-300">.admin_password</code> on
            the host.
            <br />
            <strong className="text-slate-400 font-medium">System user:</strong> sign in with your Linux account
            (same password as SSH). SSH key-only accounts need{' '}
            <code className="text-[11px] px-1 rounded bg-slate-800/80 text-slate-300">passwd</code> set on the
            server first.
          </p>

          <div className="lg:hidden text-center mt-6">
            <ZyvorBrandLine />
          </div>
        </div>
      </main>
    </div>
  )
}

function ThemeSwitcher({
  theme,
  setTheme,
  isSteel,
  isAurora,
}: {
  theme: string
  setTheme: (t: 'dark' | 'steel' | 'aurora') => void
  isSteel: boolean
  isAurora: boolean
}) {
  const shell = isSteel
    ? 'border-[rgba(140,160,190,0.25)] bg-[#1a2230]/92 shadow-lg shadow-black/30'
    : isAurora
      ? 'border-[rgba(167,139,250,0.3)] bg-[#0a0618]/92 shadow-lg shadow-violet-900/40'
      : 'border-slate-600/50 bg-slate-900/85 shadow-lg shadow-black/40'

  return (
    <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-30" role="group" aria-label="Theme">
      <div className={`login-theme-switch grid grid-cols-3 gap-1 rounded-xl p-1 backdrop-blur-xl border ${shell}`}>
        {(
          [
            { id: 'dark' as const, label: 'Dark', Icon: Moon },
            { id: 'steel' as const, label: 'Steel', Icon: Cloud },
            { id: 'aurora' as const, label: 'Aurora', Icon: Sparkles },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            className={`login-theme-btn rounded-lg border px-2 py-2 text-[10px] font-semibold uppercase tracking-wide flex flex-col items-center gap-1 transition ${
              theme === id
                ? isAurora && id === 'aurora'
                  ? 'border-cyan-400/80 bg-cyan-500/15 text-cyan-100 ring-2 ring-violet-400/40'
                  : 'border-blue-500/80 bg-blue-500/20 text-blue-100 ring-2 ring-blue-400/30'
                : 'border-transparent text-slate-400 hover:bg-white/5'
            }`}
          >
            <Icon className="w-4 h-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function MobileBrand({ hostLabel }: { hostLabel: string }) {
  return (
    <div className="lg:hidden text-center mb-8">
      <div className="login-logo-ring inline-block mb-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-700 shadow-lg shadow-blue-500/30 border border-blue-400/25">
          <BoltLogo className="w-7 h-7 text-white" />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-white">{ZYVOR_FABRIC_HELP.name}</h1>
      <p className="text-sm mt-1 text-slate-400">{ZYVOR_FABRIC_HELP.tagline}</p>
      {hostLabel && (
        <p className="text-xs mt-2 font-mono text-slate-500" title="Hypervisor host">
          {hostLabel}
        </p>
      )}
    </div>
  )
}

function DesktopHeading({ hostLabel }: { hostLabel: string }) {
  return (
    <div className="hidden lg:block mb-8">
      <h2 className="text-2xl font-bold mb-1 text-white">Welcome back</h2>
      <p className="text-sm text-slate-400">
        Sign in to manage your infrastructure
        {hostLabel ? (
          <>
            {' '}
            on <span className="font-mono text-slate-300">{hostLabel}</span>
          </>
        ) : (
          ' on this host'
        )}
      </p>
    </div>
  )
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-300 mb-2">
        {label}
      </label>
      <div className="relative group">{children}</div>
    </div>
  )
}
