// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

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
    <div className="bg-[#f5f5f7] rounded-xl p-4 border border-[#d2d2d7] flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        {steps.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => onStep(i)}
            className={`text-xs px-2.5 py-1.5 rounded-lg transition font-medium ${
              i === current
                ? 'bg-[#0066cc] text-white shadow-sm'
                : i < current
                  ? 'bg-[#e8e8ed] text-[#1d1d1f] hover:bg-[#d2d2d7]'
                  : 'bg-white text-[#6e6e73] hover:bg-black/[0.04]'
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
