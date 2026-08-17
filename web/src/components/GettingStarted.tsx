// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { ReactNode } from 'react'
import { Link } from 'react-router'
import { Rocket, Terminal, LayoutTemplate, ShieldCheck, ArrowRight } from 'lucide-react'

interface Step {
  icon: ReactNode
  title: string
  description: string
  to: string
  cta: string
  gradient: string
  glow: string
}

const STEPS: Step[] = [
  {
    icon: <Rocket className="h-5 w-5 text-white" />,
    title: 'Create your first VM',
    description: 'Pick an image, size it, and boot it — usually under a minute.',
    to: '/create',
    cta: 'Create VM',
    gradient: 'from-blue-500 to-blue-700',
    glow: 'shadow-blue-500/20',
  },
  {
    icon: <LayoutTemplate className="h-5 w-5 text-white" />,
    title: 'Start from a template',
    description: 'Skip the blank-VM setup with a preconfigured starting point.',
    to: '/templates',
    cta: 'View templates',
    gradient: 'from-purple-500 to-purple-700',
    glow: 'shadow-purple-500/20',
  },
  {
    icon: <Terminal className="h-5 w-5 text-white" />,
    title: 'Explore the API',
    description: 'Fire live requests at every endpoint without writing a client.',
    to: '/playground',
    cta: 'Open playground',
    gradient: 'from-cyan-500 to-blue-700',
    glow: 'shadow-cyan-500/20',
  },
  {
    icon: <ShieldCheck className="h-5 w-5 text-white" />,
    title: 'Invite your team',
    description: 'Set up access control before handing out the dashboard.',
    to: '/access-control',
    cta: 'Configure access',
    gradient: 'from-emerald-500 to-emerald-700',
    glow: 'shadow-emerald-500/20',
  },
]

/** Shown in place of the plain "no VMs" message on a fresh install — a first customer's dashboard is otherwise an empty table with no sense of what to do next. */
export function GettingStarted() {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
      <div className="px-6 pt-6 pb-2 animate-fade-in">
        <h2 className="text-lg font-semibold text-white">Welcome to Zyvor Fabric</h2>
        <p className="text-sm text-slate-400 mt-1">A few places to start — jump to whichever fits what you're doing.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6">
        {STEPS.map((step, i) => (
          <Link
            key={step.title}
            to={step.to}
            className="group animate-fade-in rounded-lg border border-slate-700/50 bg-slate-900/40 p-4 flex items-start gap-4 transition-all hover:border-slate-600 hover:bg-slate-900/70 hover:-translate-y-0.5"
            style={{ animationDelay: `${i * 70}ms`, animationFillMode: 'backwards' }}
          >
            <div className={`shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br ${step.gradient} flex items-center justify-center shadow-lg ${step.glow}`}>
              {step.icon}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-white">{step.title}</div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{step.description}</p>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 mt-2 group-hover:text-blue-300">
                {step.cta}
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
