// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { ExternalLink, Server } from 'lucide-react'
import { ZYVOR_URL, ZYVOR_BRAND, ZYVOR_COPY, ZYVOR_LINE } from './ZyvorBrand'
import { ZYVOR_FABRIC_DAEMON, ZYVOR_FABRIC_HELP, ZYVOR_HELP } from '../config/zyvorHelp'

export const ZYVOR_FABRIC_PRODUCT = ZYVOR_FABRIC_HELP.name
export const ZYVOR_FABRIC_VERSION = ZYVOR_FABRIC_HELP.version
export const ZYVOR_FABRIC_TAGLINE = ZYVOR_FABRIC_HELP.tagline

/** @deprecated Use ZYVOR_FABRIC_PRODUCT */
export const VMSPAWN_PRODUCT = ZYVOR_FABRIC_PRODUCT
/** @deprecated Use ZYVOR_FABRIC_VERSION */
export const VMSPAWN_VERSION = ZYVOR_FABRIC_VERSION
/** @deprecated Use ZYVOR_FABRIC_TAGLINE */
export const VMSPAWN_TAGLINE = ZYVOR_FABRIC_TAGLINE

const ORANGE = '#f97316'

export type HelpDocLink = {
  label: string
  href: string
}

export const VMSPAWN_HELP_LINKS: HelpDocLink[] = [
  {
    label: 'Documentation',
    href: 'https://github.com/ssahani/zyvor-fabric/tree/main/docs',
  },
  {
    label: 'Web UI guide',
    href: 'https://github.com/ssahani/zyvor-fabric/blob/main/docs/web-ui.md',
  },
  {
    label: 'Getting started',
    href: 'https://github.com/ssahani/zyvor-fabric/blob/main/docs/getting-started',
  },
  {
    label: 'Zyvor documentation',
    href: ZYVOR_HELP.docs,
  },
  {
    label: 'Zyvor — product suite',
    href: ZYVOR_URL,
  },
]

export default function ZyvorAbout({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-5 text-sm text-[#1d1d1f] ${className}`.trim()}>
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-blue-500/30 to-blue-700/50 border border-blue-400/30 shadow-lg shadow-blue-500/15">
          <Server className="w-8 h-8 text-[#0066cc]" aria-hidden />
        </div>
        <div className="min-w-0 pt-0.5">
          <h3 className="text-lg font-semibold text-[#1d1d1f]">{ZYVOR_FABRIC_PRODUCT}</h3>
          <p className="text-xs text-[#6e6e73] mt-0.5">Version {ZYVOR_FABRIC_VERSION}</p>
          <p className="text-sm text-[#6e6e73] mt-2 leading-relaxed">{ZYVOR_FABRIC_TAGLINE}</p>
        </div>
      </div>

      <div className="rounded-xl border border-[#d2d2d7] bg-white p-4 space-y-3">
        <p className="leading-relaxed">
          Part of the{' '}
          <a
            href={ZYVOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold hover:underline"
            style={{ color: ORANGE }}
          >
            {ZYVOR_BRAND}
          </a>{' '}
          product family — clustering, networking, security, storage, HA, GPU passthrough, and
          operators on Ephemera, a disposable-VM engine with no systemd dependency. Daemon:{' '}
          <span className="font-mono text-[#6e6e73]">{ZYVOR_FABRIC_DAEMON}</span>.
        </p>
        <p className="text-xs text-[#6e6e73] leading-relaxed">
          {ZYVOR_LINE} · {ZYVOR_COPY}
        </p>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-[#6e6e73] uppercase tracking-wider mb-2">Documentation</h4>
        <ul className="space-y-2">
          {VMSPAWN_HELP_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[#0066cc] hover:text-blue-300 text-sm"
              >
                {link.label}
                <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
