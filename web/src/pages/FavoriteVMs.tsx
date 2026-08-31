// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect } from 'react'
import { Star, Search, Monitor, RefreshCw, Cpu, HardDrive } from 'lucide-react'
import { Link } from 'react-router'
import { listVMs } from '../api/vm'
import ErrorBanner from '../components/ErrorBanner'
import { formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

interface FavoriteVM { name: string; added_at: string }

const STORAGE_KEY = 'vmspawnd_favorites'

function loadFavorites(): FavoriteVM[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function saveFavorites(favs: FavoriteVM[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(favs)) }

function stateColor(state: string): string {
  const s = (state || '').toLowerCase()
  if (s === 'running') return 'bg-emerald-500/10 text-emerald-600'
  if (s === 'stopped' || s === 'shutoff') return 'bg-red-500/10 text-red-600'
  if (s === 'paused') return 'bg-amber-500/10 text-amber-400'
  return 'bg-black/[0.04] text-[#6e6e73]'
}

export default function FavoriteVMs() {
  const toast = useToastContext()
  const [vms, setVMs] = useState<any[]>([])
  const [favorites, setFavorites] = useState<FavoriteVM[]>(loadFavorites)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const loadVMs = async () => {
    setLoading(true); setError('')
    try {
      setVMs(await listVMs())
    } catch (e: unknown) {
      const msg = formatUserError(e)
      setError(msg)
      toastFailure(toast, 'Failed to load VMs', e)
    } finally { setLoading(false) }
  }

  useEffect(() => { loadVMs() }, [])

  const isFavorite = (name: string) => favorites.some(f => f.name === name)
  const toggleFavorite = (vm: any) => {
    let updated: FavoriteVM[]
    if (isFavorite(vm.name)) { updated = favorites.filter(f => f.name !== vm.name) }
    else { updated = [...favorites, { name: vm.name, added_at: new Date().toISOString() }] }
    setFavorites(updated); saveFavorites(updated)
  }

  const matchesSearch = (vm: any) => !search || vm.name?.toLowerCase().includes(search.toLowerCase()) || (vm.state || '').toLowerCase().includes(search.toLowerCase())
  const pinnedVMs = favorites.map(fav => vms.find(vm => vm.name === fav.name)).filter((vm): vm is any => vm != null && matchesSearch(vm))
  const otherVMs = vms.filter(vm => !isFavorite(vm.name) && matchesSearch(vm))

  const renderVMRow = (vm: any) => {
    const starred = isFavorite(vm.name)
    return (
      <div key={vm.name} className="flex items-center gap-3 p-3 rounded-xl border bg-[#f5f5f7] border-[#d2d2d7] hover:bg-white hover:border-[#d2d2d7] transition-all">
        <button onClick={() => toggleFavorite(vm)} className="flex-shrink-0 transition-colors" title={starred ? 'Remove from favorites' : 'Add to favorites'}>
          <Star className={`w-5 h-5 ${starred ? 'text-amber-600 fill-yellow-400' : 'text-[#6e6e73] hover:text-amber-600/60'}`} />
        </button>
        <div className="flex-1 min-w-0">
          <Link to={`/app/vms/${vm.name}`} className="text-sm font-medium text-[#1d1d1f] truncate hover:text-[#0066cc] transition-colors">{vm.name}</Link>
          <div className="flex items-center gap-3 text-xs text-[#6e6e73] mt-1">
            <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{vm.cpus || 0} vCPU</span>
            <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{vm.memory ? (vm.memory > 1024 * 1024 ? (vm.memory / 1024 / 1024 / 1024).toFixed(1) : (vm.memory / 1024).toFixed(1)) : '0'} GB</span>
          </div>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0 ${stateColor(vm.state)}`}>{vm.state || 'unknown'}</span>
        <Link to={`/app/vms/${vm.name}/console`} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-all flex-shrink-0">
          <Monitor className="w-3.5 h-3.5" /> Console
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-500 to-amber-700 flex items-center justify-center shadow-lg shadow-yellow-500/20">
              <Star className="w-4 h-4 text-[#1d1d1f]" />
            </div>
            <span className="text-gradient-blue">Favorites</span>
          </h2>
          <p className="text-sm text-[#6e6e73] mt-1">{loading ? 'Loading...' : `${favorites.length} pinned, ${vms.length} total VMs`}</p>
        </div>
        <button onClick={loadVMs} disabled={loading} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${loading ? 'bg-[#e8e8ed] text-[#6e6e73] cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-blue-700 text-[#1d1d1f] hover:from-blue-500 hover:to-blue-600 shadow-lg shadow-blue-500/20'}`}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6e6e73]" />
        <input type="text" placeholder="Search VMs..." aria-label="Search VMs" value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#d2d2d7] rounded-lg text-[#1d1d1f] placeholder-[#6e6e73] focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
      </div>

      {error && (
        <ErrorBanner
          title="Could not load VMs"
          headline={error}
          hints={hintsForError(error, 'vm')}
          onRetry={loadVMs}
        />
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => (<div key={i} className="h-16 rounded-xl bg-[#f5f5f7] animate-pulse" />))}</div>
      ) : (
        <>
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-amber-600 flex items-center gap-2 mb-3"><Star className="w-4 h-4 fill-yellow-400" />Pinned VMs</h3>
            {pinnedVMs.length === 0 ? (
              <div className="text-center py-8 rounded-xl border border-dashed border-[#d2d2d7] bg-[#f5f5f7]"><Star className="w-8 h-8 text-[#6e6e73] mx-auto mb-2" /><p className="text-sm text-[#6e6e73]">No favorites yet -- star VMs for quick access</p></div>
            ) : (<div className="space-y-2">{pinnedVMs.map(renderVMRow)}</div>)}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#6e6e73] flex items-center gap-2 mb-3"><Monitor className="w-4 h-4" />All VMs</h3>
            {otherVMs.length === 0 ? (
              <div className="text-center py-8 text-sm text-[#6e6e73]">{vms.length === 0 ? 'No VMs found.' : 'All VMs are pinned or no matches.'}</div>
            ) : (<div className="space-y-2">{otherVMs.map(renderVMRow)}</div>)}
          </div>
        </>
      )}
    </div>
  )
}
