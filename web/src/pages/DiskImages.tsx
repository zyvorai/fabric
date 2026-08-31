// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useMemo } from 'react'
import { Search, HardDrive, RefreshCw } from 'lucide-react'
import { apiFetch } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import { formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

interface DiskImage { name: string; path: string; format: string; size_bytes: number; mod_time?: string }

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

const formatColor: Record<string, string> = {
  qcow2: 'bg-blue-500/20 text-[#0066cc]', vmdk: 'bg-purple-500/20 text-purple-400',
  vhd: 'bg-cyan-500/20 text-cyan-400', vhdx: 'bg-cyan-500/20 text-cyan-400',
  raw: 'bg-black/[0.06] text-[#6e6e73]', img: 'bg-black/[0.06] text-[#6e6e73]',
}

export default function DiskImages() {
  const toast = useToastContext()
  const [images, setImages] = useState<DiskImage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const fetchImages = async () => {
    setLoading(true); setError(null)
    try {
      const res = await apiFetch('/api/images')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setImages(Array.isArray(data) ? data : data.images || data.disk_images || [])
    } catch (err: unknown) {
      const msg = formatUserError(err)
      setError(msg)
      toastFailure(toast, 'Failed to load disk images', err)
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchImages() }, [])

  const filtered = useMemo(() => {
    if (!search) return images
    const q = search.toLowerCase()
    return images.filter(img => img.name.toLowerCase().includes(q) || img.format.toLowerCase().includes(q) || img.path.toLowerCase().includes(q))
  }, [images, search])

  const totalSize = images.reduce((sum, img) => sum + (img.size_bytes || 0), 0)
  const toggleSelect = (path: string) => setSelected(prev => { const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next })

  if (loading) return <div className="flex items-center justify-center h-64 text-[#6e6e73]"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mr-3" />Loading disk images...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20"><HardDrive className="w-5 h-5 text-violet-400" /></div>
          <div><h1 className="text-xl font-bold text-[#1d1d1f]">Disk Images</h1><p className="text-sm text-[#6e6e73]">Browse and manage VM disk images</p></div>
        </div>
        <button onClick={fetchImages} title="Refresh images" className="flex items-center gap-2 px-3 py-2 text-sm bg-[#e8e8ed] hover:bg-[#d2d2d7] text-[#1d1d1f] rounded-lg transition-colors"><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>

      {error && (
        <ErrorBanner
          title="Could not load disk images"
          headline={error}
          hints={hintsForError(error, 'storage')}
          onRetry={fetchImages}
        />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card-blue rounded-xl border border-[#d2d2d7] px-4 py-3 card-glow transition-all hover:scale-[1.02]"><div className="text-2xl font-bold text-[#1d1d1f]">{images.length}</div><div className="text-xs text-[#6e6e73] mt-1">Total Images</div></div>
        <div className="stat-card-purple rounded-xl border border-[#d2d2d7] px-4 py-3 card-glow-purple transition-all hover:scale-[1.02]"><div className="text-2xl font-bold text-[#1d1d1f]">{formatBytes(totalSize)}</div><div className="text-xs text-[#6e6e73] mt-1">Total Size</div></div>
        <div className="stat-card-cyan rounded-xl border border-[#d2d2d7] px-4 py-3 card-glow-cyan transition-all hover:scale-[1.02]"><div className="text-2xl font-bold text-[#1d1d1f]">{new Set(images.map(i => i.format)).size}</div><div className="text-xs text-[#6e6e73] mt-1">Formats</div></div>
        <div className="stat-card-green rounded-xl border border-[#d2d2d7] px-4 py-3 card-glow-green transition-all hover:scale-[1.02]"><div className="text-2xl font-bold text-[#1d1d1f]">{selected.size}</div><div className="text-xs text-[#6e6e73] mt-1">Selected</div></div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6e6e73]" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, format, or path..." aria-label="Search disk images"
          className="w-full pl-10 pr-4 py-2.5 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl text-sm text-[#1d1d1f] placeholder-[#6e6e73] focus:outline-none focus:ring-1 focus:ring-blue-500" />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#f5f5f7] rounded-xl p-10 border border-[#d2d2d7] text-center text-[#6e6e73]"><HardDrive className="w-10 h-10 mx-auto mb-3 opacity-50" /><p className="text-sm">{images.length === 0 ? 'No disk images found' : 'No images match your search'}</p></div>
      ) : (
        <div className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#d2d2d7]">
              <th className="px-4 py-3 text-left w-10"><span className="sr-only">Select</span></th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#6e6e73] uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#6e6e73] uppercase">Format</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#6e6e73] uppercase">Size</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#6e6e73] uppercase">Path</th>
            </tr></thead>
            <tbody>
              {filtered.map(img => (
                <tr key={img.path} onClick={() => toggleSelect(img.path)} className={`border-b border-[#d2d2d7]/60 cursor-pointer transition-colors ${selected.has(img.path) ? 'bg-[#0066cc]/10' : 'hover:bg-black/[0.04]'}`}>
                  <td className="px-4 py-3"><input type="checkbox" checked={selected.has(img.path)} onChange={() => toggleSelect(img.path)} className="rounded border-[#d2d2d7] bg-[#e8e8ed] text-blue-500" /></td>
                  <td className="px-4 py-3 text-[#1d1d1f] font-medium">{img.name}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${formatColor[img.format] || 'bg-black/[0.06] text-[#6e6e73]'}`}>{img.format}</span></td>
                  <td className="px-4 py-3 text-[#1d1d1f] font-mono text-xs">{formatBytes(img.size_bytes)}</td>
                  <td className="px-4 py-3 text-[#6e6e73] text-xs font-mono truncate max-w-[250px]" title={img.path}>{img.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
