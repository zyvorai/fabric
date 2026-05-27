// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, Disc } from 'lucide-react'
import { apiFetch } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import { PageHeader, EmptyState } from '../components/ui'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

interface ISOFile {
  name: string
  path: string
  size_bytes: number
  mod_time: string
}

interface VMWithISO {
  vm: string
  iso_path: string
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isVirtioWin(name: string): boolean {
  return name.toLowerCase().includes('virtio-win')
}

export default function ISOImages() {
  const toast = useToastContext()
  const [isos, setISOs] = useState<ISOFile[]>([])
  const [vmsWithISOs, setVMsWithISOs] = useState<VMWithISO[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const fetchISOs = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const resp = await apiFetch('/api/isos')
      if (!resp.ok) {
        const body = await resp.text()
        throw new Error(formatHttpErrorBody(resp.status, resp.statusText, body))
      }
      const data = await resp.json()
      setISOs(data.isos || [])
      setVMsWithISOs(data.vms_with_isos || [])
    } catch (err) {
      const msg = formatUserError(err)
      setLoadError(msg)
      toastFailure(toast, 'Failed to load ISO images', err)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchISOs()
    const interval = setInterval(fetchISOs, 30000)
    return () => clearInterval(interval)
  }, [fetchISOs])

  const filtered = useMemo(() => {
    if (!search) return isos
    const q = search.toLowerCase()
    return isos.filter(
      (iso) => iso.name.toLowerCase().includes(q) || iso.path.toLowerCase().includes(q),
    )
  }, [isos, search])

  const isoVMMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const entry of vmsWithISOs) {
      if (!map[entry.iso_path]) map[entry.iso_path] = []
      map[entry.iso_path].push(entry.vm)
    }
    return map
  }, [vmsWithISOs])

  return (
    <div className="space-y-6">
      <PageHeader
        title="ISO Images"
        description="Installer and virtio ISOs available on the host"
        onRefresh={fetchISOs}
        refreshing={loading}
      />

      {loadError && (
        <ErrorBanner
          title="Could not load ISO images"
          headline={loadError}
          hints={hintsForError(loadError, 'storage')}
          onRetry={fetchISOs}
        />
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search ISOs by name or path…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search ISOs"
          className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
        />
      </div>

      {loading && !loadError ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 flex flex-col items-center justify-center text-slate-500 gap-3">
          <div className="w-6 h-6 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-sm">Scanning for ISO images…</span>
        </div>
      ) : !loadError && filtered.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50">
          <EmptyState
            icon={<Disc className="w-10 h-10" />}
            title={isos.length === 0 ? 'No ISO images found' : 'No ISOs match your search'}
            description="Place ISO files in the configured images directory on the host"
          />
        </div>
      ) : !loadError ? (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Path</th>
                <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Size</th>
                <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Modified</th>
                <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Attached VMs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filtered.map((iso) => (
                <tr key={iso.path} className="hover:bg-slate-700/30 transition-colors">
                  <td className="p-3">
                    <div className="font-medium text-white flex items-center gap-2">
                      {iso.name}
                      {isVirtioWin(iso.name) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">
                          virtio-win
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-slate-400 font-mono text-xs truncate max-w-xs" title={iso.path}>
                    {iso.path}
                  </td>
                  <td className="p-3 text-slate-300 whitespace-nowrap">{formatSize(iso.size_bytes)}</td>
                  <td className="p-3 text-slate-400 text-xs whitespace-nowrap">{formatDate(iso.mod_time)}</td>
                  <td className="p-3 text-slate-400 text-xs">
                    {(isoVMMap[iso.path] || []).join(', ') || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
