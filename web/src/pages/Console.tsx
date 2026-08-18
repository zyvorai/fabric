// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, Terminal as TerminalIcon, Monitor } from 'lucide-react'
import Terminal from '../components/Terminal'
import VNCViewer from '../components/VNCViewer'
import { getVM } from '../api/vm'
import ErrorBanner from '../components/ErrorBanner'
import { formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { useToastContext } from '../contexts/ToastContext'

export default function Console() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const toast = useToastContext()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<'terminal' | 'vnc'>(searchParams.get('mode') === 'vnc' ? 'vnc' : 'terminal')
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!name) return
    let cancelled = false
    setLoadError(null)
    getVM(name)
      .catch((err) => {
        if (!cancelled) {
          const msg = formatUserError(err)
          setLoadError(msg)
          toastFailure(toast, 'Could not open console', err)
        }
      })
    return () => { cancelled = true }
  }, [name, toast])

  if (!name) return null

  return (
    <div>
      {loadError && (
        <ErrorBanner
          title="Console unavailable"
          headline={loadError}
        />
      )}
      <button
        onClick={() => navigate(`/vms/${name}`)}
        className="flex items-center gap-2 mb-6 text-slate-400 hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to VM Details
      </button>

      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="icon-tile icon-tile-md icon-tile-blue">
            {mode === 'terminal' ? <TerminalIcon className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white truncate">Console: {name}</h1>
            <p className="text-sm text-slate-500 mt-1">Interactive access to this VM</p>
          </div>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-800/50 border border-slate-700/50 rounded-xl shrink-0">
          <button
            onClick={() => setMode('terminal')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === 'terminal'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TerminalIcon className="w-4 h-4" />
            Terminal
          </button>
          <button
            onClick={() => setMode('vnc')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === 'vnc'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor className="w-4 h-4" />
            VNC
          </button>
        </div>
      </div>

      {mode === 'terminal' ? <Terminal vmName={name} /> : <VNCViewer vmName={name} />}
    </div>
  )
}
