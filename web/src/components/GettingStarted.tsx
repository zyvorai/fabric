// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'

const STEPS = [
  {
    title: 'Create your first VM',
    description: 'Pick an image, size it, and boot — usually under a minute.',
    to: '/app/create',
    cta: 'Create VM',
  },
  {
    title: 'Start from a template',
    description: 'Skip blank-VM setup with a preconfigured starting point.',
    to: '/app/templates',
    cta: 'View templates',
  },
  {
    title: 'Explore the API',
    description: 'Fire live requests at every endpoint without writing a client.',
    to: '/app/playground',
    cta: 'Open playground',
  },
  {
    title: 'Invite your team',
    description: 'Set up access control before handing out the console.',
    to: '/app/access-control',
    cta: 'Configure access',
  },
]

/** Shown when the fleet is empty — calm first-run guidance. */
export function GettingStarted() {
  return (
    <div className="zf-panel p-10 animate-fade-in">
      <h2 className="text-[28px] font-semibold tracking-[-0.03em] text-[var(--zf-ink)] mb-2">
        Get started
      </h2>
      <p className="text-[15px] text-[var(--zf-muted)] mb-10 max-w-xl">
        Your private cloud is ready. Create a VM or explore the surfaces below.
      </p>
      <div className="grid sm:grid-cols-2 gap-6">
        {STEPS.map((step) => (
          <div key={step.to} className="border-t border-[var(--zf-hairline)] pt-5">
            <h3 className="text-[17px] font-semibold tracking-[-0.02em] mb-1">{step.title}</h3>
            <p className="text-[14px] text-[var(--zf-muted)] mb-4">{step.description}</p>
            <Link to={step.to} className="inline-flex items-center gap-1 text-[14px] font-medium text-[var(--zf-link)]">
              {step.cta}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
