// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

type Tone = 'amber' | 'red'

type Props = {
  title: string
  headline: string
  hints?: string[]
  technicalDetail?: string
  tone?: Tone
  onDismiss?: () => void
  onRetry?: () => void
  retryLabel?: string
  actions?: ReactNode
}

const toneStyles: Record<Tone, { border: string; bg: string; title: string; text: string }> = {
  amber: {
    border: 'border-amber-500/40',
    bg: 'bg-amber-950/40',
    title: 'text-amber-100',
    text: 'text-amber-50/95',
  },
  red: {
    border: 'border-red-500/40',
    bg: 'bg-red-950/35',
    title: 'text-red-100',
    text: 'text-red-50/95',
  },
}

/** Actionable error panel with optional hints and technical details. */
export default function ErrorBanner({
  title,
  headline,
  hints,
  technicalDetail,
  tone = 'amber',
  onDismiss,
  onRetry,
  retryLabel = 'Retry',
  actions,
}: Props) {
  const s = toneStyles[tone]

  return (
    <div
      role="alert"
      className={`rounded-xl border ${s.border} ${s.bg} px-4 py-3 space-y-3`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${tone === 'red' ? 'text-red-400' : 'text-amber-400'}`} />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className={`text-sm font-semibold ${s.title}`}>{title}</h3>
          <p className={`text-sm ${s.text} leading-relaxed`}>{headline}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-xs px-2 py-1 rounded border border-amber-500/30 text-amber-200 hover:bg-amber-500/10"
            >
              {retryLabel}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-xs text-amber-200/80 hover:text-amber-50 px-2 py-1 rounded border border-amber-500/30"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>

      {hints && hints.length > 0 && (
        <div className="pl-7 space-y-1.5">
          <p className="text-xs font-medium text-amber-200/90">What usually fixes it</p>
          <ul className="text-xs text-amber-100/85 list-disc pl-4 space-y-1">
            {hints.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      {actions && <div className="pl-7 flex flex-wrap gap-2">{actions}</div>}

      {technicalDetail && (
        <details className="pl-7 group">
          <summary className="text-xs text-amber-200/80 cursor-pointer hover:text-amber-100">
            Technical details
          </summary>
          <pre className="mt-2 text-[11px] leading-snug text-slate-300 bg-slate-950/80 border border-slate-700/80 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-56 overflow-y-auto">
            {technicalDetail}
          </pre>
        </details>
      )}
    </div>
  )
}
