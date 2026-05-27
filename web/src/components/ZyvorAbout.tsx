// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { ExternalLink, Server } from 'lucide-react'
import { ZYVOR_URL, ZYVOR_BRAND, ZYVOR_COPY, ZYVOR_LINE } from './ZyvorBrand'
import { VMSPAWN_HELP, ZYVOR_HELP } from '../config/zyvorHelp'

export const VMSPAWN_PRODUCT = VMSPAWN_HELP.name
export const VMSPAWN_VERSION = VMSPAWN_HELP.version
export const VMSPAWN_TAGLINE = VMSPAWN_HELP.tagline

const ORANGE = '#f97316'

export type HelpDocLink = {
  label: string
  href: string
}

export const VMSPAWN_HELP_LINKS: HelpDocLink[] = [
  {
    label: 'Documentation',
    href: 'https://github.com/ssahani/vmspawn/tree/main/docs',
  },
  {
    label: 'Web UI guide',
    href: 'https://github.com/ssahani/vmspawn/blob/main/docs/web-ui.md',
  },
  {
    label: 'Getting started',
    href: 'https://github.com/ssahani/vmspawn/blob/main/docs/getting-started',
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
    <div className={`space-y-5 text-sm text-slate-300 ${className}`.trim()}>
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-blue-500/30 to-blue-700/50 border border-blue-400/30 shadow-lg shadow-blue-500/15">
          <Server className="w-8 h-8 text-blue-400" aria-hidden />
        </div>
        <div className="min-w-0 pt-0.5">
          <h3 className="text-lg font-semibold text-white">{VMSPAWN_PRODUCT}</h3>
          <p className="text-xs text-slate-500 mt-0.5">Version {VMSPAWN_VERSION}</p>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">{VMSPAWN_TAGLINE}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4 space-y-3">
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
          product family — systemd-vmspawn and systemd-machined VM lifecycle, network security,
          storage, consoles, and JWT-secured APIs.
        </p>
        <p className="text-xs text-slate-500 leading-relaxed">
          {ZYVOR_LINE} · {ZYVOR_COPY}
        </p>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Documentation</h4>
        <ul className="space-y-2">
          {VMSPAWN_HELP_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm"
              >
                {link.label}
                <ExternalLink className="w-3 h-3 shrink-0" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
