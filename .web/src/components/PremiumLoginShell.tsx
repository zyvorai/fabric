// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

/**
 * Machina-style premium login shell — aurora, particles, split hero + glass panel.
 */
import type { CSSProperties, ReactNode } from 'react';
import { AlertCircle, Sparkles } from 'lucide-react';

export type LoginOrb = {
  size: number;
  top: string;
  left: string;
  delay: string;
  duration: string;
  hue?: 'blue' | 'violet' | 'cyan' | 'red';
};

export type PremiumLoginFeature = {
  icon: ReactNode;
  title: string;
  description: string;
  gradient?: string;
  glow?: string;
  highlight?: boolean;
};

export type PremiumLoginPill = {
  icon?: ReactNode;
  label: string;
  glow?: boolean;
};

export type LoginAccent =
  | 'blue'
  | 'amber'
  | 'orange'
  | 'violet'
  | 'rose'
  | 'cyan'
  | 'copper'
  | 'steel';

const DEFAULT_ORBS: LoginOrb[] = [
  { size: 340, top: '4%', left: '6%', delay: '0s', duration: '11s', hue: 'blue' },
  { size: 220, top: '55%', left: '12%', delay: '2.2s', duration: '13s', hue: 'violet' },
  { size: 180, top: '18%', left: '58%', delay: '0.8s', duration: '9s', hue: 'cyan' },
  { size: 400, top: '58%', left: '68%', delay: '3.2s', duration: '15s', hue: 'red' },
];

const PARTICLE_SEEDS = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: `${(i * 17 + 7) % 100}%`,
  top: `${(i * 23 + 11) % 100}%`,
  delay: `${(i % 7) * 0.45}s`,
  size: 2 + (i % 3),
}));

export type PremiumLoginShellProps = {
  accent?: LoginAccent;
  pageThemeClass?: string;
  heroWidth?: '55' | '58';
  themeSwitcher?: ReactNode;
  logo: ReactNode;
  productName: string;
  productSubtitle?: string;
  heroHeadline: ReactNode;
  heroSubheadline: string;
  pills?: PremiumLoginPill[];
  features?: PremiumLoginFeature[];
  heroFooter?: ReactNode;
  orbs?: LoginOrb[];
  mobileSubtitle?: string;
  panelTitle?: string;
  panelSubtitle?: string;
  panelHint?: ReactNode;
  footer?: ReactNode;
  formClassName?: string;
  children: ReactNode;
};

export function PremiumLoginShell({
  accent = 'blue',
  pageThemeClass = '',
  heroWidth = '58',
  themeSwitcher,
  logo,
  productName,
  productSubtitle,
  heroHeadline,
  heroSubheadline,
  pills = [],
  features = [],
  heroFooter,
  orbs = DEFAULT_ORBS,
  mobileSubtitle,
  panelTitle = 'Welcome back',
  panelSubtitle = 'Sign in to continue',
  panelHint,
  footer,
  formClassName = '',
  children,
}: PremiumLoginShellProps) {
  const accentClass = accent === 'blue' ? '' : `login-accent-${accent}`;
  const heroClass = heroWidth === '55' ? 'lg:w-[55%]' : 'lg:w-[58%]';
  const beamClass = heroWidth === '55' ? 'login-beam-w55' : 'login-beam-w58';

  return (
    <div className="min-h-screen flex flex-col">
      <div
        className={`login-page flex-1 flex flex-col lg:flex-row relative overflow-hidden ${accentClass} ${pageThemeClass}`.trim()}
      >
        <div className="login-aurora" aria-hidden />
        <div className="login-scanline" aria-hidden />

        {themeSwitcher}

        <aside
          className={`login-hero hidden lg:flex ${heroClass} flex-col justify-between p-10 xl:p-12 overflow-hidden relative`}
        >
          <div className="login-hero-mesh" aria-hidden />
          <div className="login-spotlight" aria-hidden />

          {orbs.map((orb, i) => (
            <div
              key={i}
              className={`login-orb login-orb-${orb.hue ?? 'blue'}`}
              style={
                {
                  width: orb.size,
                  height: orb.size,
                  top: orb.top,
                  left: orb.left,
                  '--login-delay': orb.delay,
                  '--login-duration': orb.duration,
                } as CSSProperties
              }
            />
          ))}

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

          <div className="relative z-10">
            <div className="login-fade-in flex items-center gap-4 mb-8">
              <div className="login-logo-ring">{logo}</div>
              <div>
                <span className="text-4xl font-bold tracking-tight text-white block">{productName}</span>
                {productSubtitle ? (
                  <span className="text-xs font-medium uppercase tracking-[0.28em] text-sky-300/80 mt-0.5 block">
                    {productSubtitle}
                  </span>
                ) : null}
              </div>
            </div>
            <h2 className="login-fade-in login-fade-in-d1 text-4xl xl:text-[2.75rem] font-extrabold text-white leading-[1.08] mb-4 max-w-xl">
              {heroHeadline}
            </h2>
            <p className="login-fade-in login-fade-in-d2 text-lg text-slate-300/90 max-w-lg leading-relaxed">
              {heroSubheadline}
            </p>
            {pills.length > 0 ? (
              <div className="login-fade-in login-fade-in-d3 flex flex-wrap gap-2 mt-6">
                {pills.map((pill) => (
                  <span
                    key={pill.label}
                    className={`login-stat-pill${pill.glow ? ' login-stat-pill-glow' : ''}`}
                  >
                    {pill.icon}
                    {pill.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {features.length > 0 ? (
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
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br ${
                      f.gradient ?? 'from-blue-500/95 to-indigo-800/95'
                    } shadow-lg ${f.glow ?? 'shadow-blue-500/25'}`}
                  >
                    {f.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white flex items-center gap-2">
                      {f.title}
                      {f.highlight ? (
                        <Sparkles className="w-3.5 h-3.5 text-amber-300/90 shrink-0" aria-hidden />
                      ) : null}
                    </div>
                    <p className="text-xs mt-1 text-slate-400 leading-relaxed">{f.description}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {heroFooter ? <div className="relative z-10 login-fade-in login-fade-in-d4">{heroFooter}</div> : null}
        </aside>

        <div className={`login-beam hidden lg:block ${beamClass}`} aria-hidden />

        <main className="login-panel flex-1 flex items-center justify-center relative px-6 py-12 min-h-screen lg:min-h-0">
          <div className="login-panel-grid" aria-hidden />
          <div className="login-panel-glow" aria-hidden />
          <div className="w-full max-w-[420px] relative z-10">
            <div className="lg:hidden text-center mb-8">
              <div className="login-logo-ring inline-block mb-4">{logo}</div>
              <h1 className="text-2xl font-bold text-white">{productName}</h1>
              <p className="text-sm mt-1 text-slate-400">{mobileSubtitle ?? productSubtitle ?? panelSubtitle}</p>
            </div>

            <div className="hidden lg:block mb-8">
              <h2 className="text-2xl font-bold mb-1 text-white">{panelTitle}</h2>
              <p className="text-sm text-slate-400">{panelSubtitle}</p>
            </div>

            <div className={`login-glass login-glass-border rounded-2xl p-8 shadow-2xl ${formClassName}`.trim()}>
              {children}
            </div>

            {panelHint ? (
              <p className="text-xs text-center mt-4 max-w-sm mx-auto leading-relaxed text-slate-500">{panelHint}</p>
            ) : null}
          </div>
        </main>
      </div>
      {footer}
    </div>
  );
}

export function LoginError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2.5 bg-red-950/50 border border-red-500/40 rounded-xl p-3 mb-6 login-shake" role="alert">
      <AlertCircle className="h-4 w-4 text-red-400 shrink-0" aria-hidden />
      <span className="text-sm text-red-300">{message}</span>
    </div>
  );
}

export function LoginField({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-300 mb-2">
        {label}
      </label>
      <div className="relative group">{children}</div>
    </div>
  );
}

export function LoginSubmit({
  loading,
  disabled,
  children,
  className = '',
}: {
  loading?: boolean;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button type="submit" disabled={disabled || loading} className={`login-btn-primary group ${className}`.trim()}>
      {children}
    </button>
  );
}

export function LoginRemember({
  checked,
  onChange,
  label = 'Remember me on this device',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <label className="flex items-center gap-2.5 mt-5 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-slate-600 bg-slate-900 accent-blue-500"
      />
      <span className="text-sm text-slate-400">{label}</span>
    </label>
  );
}

export function LoginDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="relative py-3 mt-4 text-center text-xs uppercase tracking-[0.22em] text-slate-500">
      <span className="relative px-2 bg-slate-900/40">{label}</span>
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-slate-700/60" />
    </div>
  );
}

/** @deprecated typo guard — use PremiumLoginShell */
export const PremumLoginShell = PremiumLoginShell;
