// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import type { ReactNode } from 'react'

type Props = {
  steps: readonly string[]
  current: number
  onStep: (index: number) => void
  trailing?: ReactNode
}

/** Horizontal step buttons for multi-step forms (Create VM, Import, etc.). */
export default function WizardStepper({ steps, current, onStep, trailing }: Props) {
  return (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        {steps.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => onStep(i)}
            className={`text-xs px-2.5 py-1.5 rounded-lg transition font-medium ${
              i === current
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/20'
                : i < current
                  ? 'bg-slate-700/80 text-slate-200 hover:bg-slate-600'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>
      {trailing}
    </div>
  )
}
