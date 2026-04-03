import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search } from 'lucide-react'
import { apiFetch } from '../api/client'

interface ISOFile { name: string; path: string; size_bytes: number; mod_time: string }
interface VMWithISO { vm: string; iso_path: string }

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
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function isVirtioWin(name: string): boolean { return name.toLowerCase().includes('virtio-win') }

export default function ISOImages() {
  const [isos, setISOs] = useState<ISOFile[]>([])
  const [vmsWithISOs, setVMsWithISOs] = useState<VMWithISO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const fetchISOs = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const resp = await apiFetch('/api/isos')
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setISOs(data.isos || [])
      setVMsWithISOs(data.vms_with_isos || [])
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to fetch ISOs') } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchISOs(); const interval = setInterval(fetchISOs, 30000); return () => clearInterval(interval) }, [fetchISOs])

  const filtered = useMemo(() => {
    if (!search) return isos
    const q = search.toLowerCase()
    return isos.filter((iso) => iso.name.toLowerCase().includes(q) || iso.path.toLowerCase().includes(q))
  }, [isos, search])

  const isoVMMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const entry of vmsWithISOs) { if (!map[entry.iso_path]) map[entry.iso_path] = []; map[entry.iso_path].push(entry.vm) }
    return map
  }, [vmsWithISOs])

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 flex flex-col items-center justify-center text-slate-500 gap-3">
        <div className="w-6 h-6 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
        <span className="text-sm">Scanning for ISO images...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-6 border border-red-700/50">
        <div className="text-red-400 text-sm mb-3">Failed to load ISOs: {error}</div>
        <button onClick={fetchISOs} className="px-4 py-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors">Retry</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">ISO Images</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">{filtered.length} of {isos.length} ISOs</span>
          <button onClick={fetchISOs} className="px-3 py-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors">Refresh</button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input type="text" placeholder="Search ISOs by name or path..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search ISOs"
          className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50" />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 flex flex-col items-center justify-center text-slate-500 gap-3">
          <span className="text-sm">{isos.length === 0 ? 'No ISO images found' : 'No ISOs match your search'}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((iso) => {
            const virtio = isVirtioWin(iso.name)
            const attachedVMs = isoVMMap[iso.path] || []
            return (
              <div key={iso.path} className={`bg-slate-800/50 rounded-xl p-4 border transition-colors ${virtio ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-700/50'}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-lg ${virtio ? 'text-emerald-400' : 'text-slate-400'}`}>&#128191;</span>
                    <span className="font-medium text-white text-sm truncate">{iso.name}</span>
                  </div>
                  {virtio && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 flex-shrink-0 ml-2">VirtIO</span>}
                </div>
                <div className="text-xs text-slate-500 truncate mb-3" title={iso.path}>{iso.path}</div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">{formatSize(iso.size_bytes)}</span>
                  <span className="text-slate-500">{formatDate(iso.mod_time)}</span>
                </div>
                {attachedVMs.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <span className="text-xs text-slate-500">Attached to:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {attachedVMs.map((vm) => (<span key={vm} className="px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-400">{vm}</span>))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
