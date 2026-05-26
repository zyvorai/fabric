// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useMemo } from 'react'
import { Download, Search, HardDrive, ArrowUpDown, FolderSearch } from 'lucide-react'
import { apiFetch, getToken } from '../api/client'

interface DiskImage { name: string; path: string; format: string; size_bytes: number; mod_time: string }
type SortField = 'name' | 'size_bytes' | 'mod_time'
type SortDir = 'asc' | 'desc'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

const formatBadgeColor: Record<string, string> = {
  qcow2: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  vmdk: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  vhd: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  vhdx: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  raw: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  img: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

export default function DownloadDisk() {
  const [images, setImages] = useState<DiskImage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('mod_time')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [customPath, setCustomPath] = useState('')

  const fetchImages = (extraPath?: string) => {
    setLoading(true); setError('')
    let url = '/api/images'
    if (extraPath) url += `?path=${encodeURIComponent(extraPath)}`
    apiFetch(url)
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then((data) => setImages(data.images || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchImages() }, [])

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir(field === 'name' ? 'asc' : 'desc') }
  }

  const filtered = useMemo(() => {
    let list = [...images]
    if (search) { const q = search.toLowerCase(); list = list.filter((img) => img.name.toLowerCase().includes(q) || img.format.toLowerCase().includes(q) || img.path.toLowerCase().includes(q)) }
    list.sort((a, b) => {
      let cmp = 0
      if (sortField === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortField === 'size_bytes') cmp = a.size_bytes - b.size_bytes
      else cmp = new Date(a.mod_time).getTime() - new Date(b.mod_time).getTime()
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [images, search, sortField, sortDir])

  const totalSize = images.reduce((sum, img) => sum + img.size_bytes, 0)
  const handleDownload = (path: string) => {
    const token = getToken()
    const params = new URLSearchParams({ path })
    if (token) params.set('token', token)
    window.location.href = `/api/images/download?${params.toString()}`
  }

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <button onClick={() => handleSort(field)} className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors">
      {label} <ArrowUpDown className={`w-3 h-3 ${sortField === field ? 'text-blue-400' : ''}`} />
    </button>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20"><Download className="w-5 h-5 text-cyan-400" /></div>
          <div><h2 className="text-xl font-bold text-white">Download Disk Images</h2><p className="text-sm text-slate-400">Browse and download VM disk images</p></div>
        </div>
        <button onClick={() => fetchImages()} className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">Refresh</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4"><p className="text-xs text-slate-400 mb-1">Total Images</p><p className="text-2xl font-bold text-white">{images.length}</p></div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4"><p className="text-xs text-slate-400 mb-1">Total Size</p><p className="text-2xl font-bold text-white">{formatBytes(totalSize)}</p></div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4"><p className="text-xs text-slate-400 mb-1">Formats</p><p className="text-2xl font-bold text-white">{new Set(images.map((i) => i.format)).size}</p></div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <label className="block text-sm font-medium text-slate-300 mb-2">Custom Path</label>
        <div className="flex gap-2">
          <input type="text" value={customPath} onChange={(e) => setCustomPath(e.target.value)} placeholder="/path/to/disk-image.qcow2 or /path/to/directory/"
            className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            onKeyDown={(e) => { if (e.key === 'Enter') handleDownload(customPath.trim()) }} />
          <button onClick={() => fetchImages(customPath.trim())} className="px-3 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors text-sm flex items-center gap-1.5">
            <FolderSearch className="w-4 h-4" /> Browse
          </button>
          <button onClick={() => handleDownload(customPath.trim())} disabled={!customPath.trim()}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Download
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by name, format, or path..." aria-label="Filter disk images"
          className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500" />
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400">Failed to load disk images: {error}</div>}
      {loading && <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>}

      {!loading && filtered.length === 0 && <div className="text-center py-12 text-slate-500"><HardDrive className="w-10 h-10 mx-auto mb-3 opacity-50" /><p className="text-sm">No disk images found</p></div>}

      {!loading && filtered.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3"><SortButton field="name" label="Name" /></th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Format</th>
                <th className="text-left px-4 py-3"><SortButton field="size_bytes" label="Size" /></th>
                <th className="text-left px-4 py-3"><SortButton field="mod_time" label="Modified" /></th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Path</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400">Action</th>
              </tr></thead>
              <tbody>
                {filtered.map((img, idx) => (
                  <tr key={img.path} className={`border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-800/30'}`}>
                    <td className="px-4 py-3 font-medium text-white">{img.name}</td>
                    <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${formatBadgeColor[img.format] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>{img.format}</span></td>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">{formatBytes(img.size_bytes)}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{new Date(img.mod_time).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs font-mono max-w-[200px] truncate" title={img.path}>{img.path}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleDownload(img.path)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-600/30 transition-colors text-xs font-medium">
                        <Download className="w-3.5 h-3.5" /> Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
