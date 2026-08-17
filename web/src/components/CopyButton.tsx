// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, type MouseEvent } from 'react'
import { Check, Copy } from 'lucide-react'
import { copyText } from '../utils/copyText'
import { useToastContext } from '../contexts/ToastContext'

type Props = {
  text: string
  label?: string
  className?: string
  successMessage?: string
  /** Compact icon-only form for inline table cells, next to an ID/IP/path — no border or label text. */
  iconOnly?: boolean
}

export default function CopyButton({
  text,
  label = 'Copy',
  className = '',
  successMessage = 'Copied to clipboard',
  iconOnly = false,
}: Props) {
  const toast = useToastContext()
  const [copied, setCopied] = useState(false)

  const handleClick = async (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const ok = await copyText(text)
    if (ok) {
      setCopied(true)
      toast.success(successMessage)
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('Could not copy to clipboard')
    }
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Copy ${text}`}
        title="Copy to clipboard"
        className={`inline-flex items-center justify-center p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-700/60 transition-colors ${className}`}
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 text-xs transition ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      {label}
    </button>
  )
}
