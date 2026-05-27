// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { Link, useLocation } from 'react-router'
import { ChevronRight, Home } from 'lucide-react'
import { routeLabels } from '../utils/routes'

export default function Breadcrumb() {
  const { pathname } = useLocation()

  if (pathname === '/') return null

  const segments = pathname.split('/').filter(Boolean)
  const crumbs: { path: string; label: string }[] = []

  let cumulative = ''
  for (const seg of segments) {
    cumulative += `/${seg}`
    const label = routeLabels[cumulative] || decodeURIComponent(seg)
    crumbs.push({ path: cumulative, label })
  }

  if (crumbs.length === 0) return null

  return (
    <nav className="mb-6 flex items-center gap-1.5 text-sm flex-wrap">
      <Link to="/" className="text-slate-400 hover:text-white transition flex items-center gap-1">
        <Home className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Dashboard</span>
      </Link>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <span key={crumb.path} className="flex items-center gap-1.5">
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            {isLast ? (
              <span className="text-white font-medium">{crumb.label}</span>
            ) : (
              <Link to={crumb.path} className="text-slate-400 hover:text-white transition">
                {crumb.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
