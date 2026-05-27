// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useEffect, useState, useCallback } from 'react'
import { Package, Plus } from 'lucide-react'
import { buildImage, listBuilds, listImages, ImageBuildStatus, ImageInfo } from '../api/images'
import { useToastContext } from '../contexts/ToastContext'
import PageLoadBanner from '../components/PageLoadBanner'
import { PageHeader } from '../components/ui'
import { usePageLoader } from '../hooks/usePageLoader'
import { toastFailure } from '../utils/toastError'

export default function ImageBuilder() {
  const toast = useToastContext()
  const [builds, setBuilds] = useState<ImageBuildStatus[]>([])
  const [images, setImages] = useState<ImageInfo[]>([])
  const { loading, loadError, run } = usePageLoader('Failed to load image builder data')
  const [showBuildDialog, setShowBuildDialog] = useState(false)

  const loadData = useCallback(() => {
    return run(async () => {
      const [b, i] = await Promise.all([listBuilds(), listImages()])
      setBuilds(b)
      setImages(i)
    })
  }, [run])

  useEffect(() => {
    void loadData()
    const interval = setInterval(() => void loadData(), 5000)
    return () => clearInterval(interval)
  }, [loadData])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Image Builder"
        onRefresh={() => void loadData()}
        refreshing={loading}
        actions={
          <button onClick={() => setShowBuildDialog(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Build Image
          </button>
        }
      />
      <PageLoadBanner title="Could not load image builder data" headline={loadError} onRetry={() => void loadData()} />
      {loading && !loadError && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
      )}
      {!loadError && (
      <>
      {/* Active builds */}
      {builds.filter(b => b.state === 'pending' || b.state === 'building').length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Active Builds</h2>
          {builds.filter(b => b.state === 'pending' || b.state === 'building').map(build => (
            <div key={build.id} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold">{build.name}</span>
                  <span className="text-slate-400 ml-2">{build.distribution}</span>
                </div>
                <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-full text-xs">{build.state}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Available images */}
      <div>
        <h2 className="text-xl font-semibold mb-3">Available Images</h2>
        {images.length === 0 ? (
          <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <Package className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <p className="text-xl text-slate-400 mb-4">No images found</p>
            <p className="text-slate-500">Build an image with mkosi to get started</p>
          </div>
        ) : (
          <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">Name</th>
                  <th className="text-left p-4 font-medium text-slate-300">Format</th>
                  <th className="text-left p-4 font-medium text-slate-300">Size</th>
                  <th className="text-left p-4 font-medium text-slate-300">Path</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {images.map(img => (
                  <tr key={img.path} className="hover:bg-white/[0.03]/50">
                    <td className="p-4 font-medium">{img.name}</td>
                    <td className="p-4"><span className="px-2 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded text-xs">{img.format.toUpperCase()}</span></td>
                    <td className="p-4 font-mono text-sm">{(img.size_bytes / (1024 * 1024)).toFixed(1)} MB</td>
                    <td className="p-4 font-mono text-xs text-slate-400">{img.path}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Build history */}
      {builds.filter(b => b.state === 'completed' || b.state === 'failed').length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-3">Build History</h2>
          <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-300">Name</th>
                  <th className="text-left p-4 font-medium text-slate-300">Distribution</th>
                  <th className="text-left p-4 font-medium text-slate-300">Status</th>
                  <th className="text-left p-4 font-medium text-slate-300">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {builds.filter(b => b.state === 'completed' || b.state === 'failed').map(build => (
                  <tr key={build.id} className="hover:bg-white/[0.03]/50">
                    <td className="p-4 font-medium">{build.name}</td>
                    <td className="p-4 text-slate-400">{build.distribution}</td>
                    <td className="p-4"><span className={`px-3 py-1 rounded-full text-xs border ${build.state === 'completed' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>{build.state}</span></td>
                    <td className="p-4 text-sm text-slate-400">{new Date(build.started).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showBuildDialog && (
        <BuildImageDialog onClose={() => setShowBuildDialog(false)} onSuccess={() => { toast.success('Build started'); setShowBuildDialog(false); void loadData() }} />
      )}
      </>
      )}
    </div>
  )
}

function BuildImageDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const toast = useToastContext()
  const [name, setName] = useState('')
  const [distro, setDistro] = useState('fedora')
  const [packages, setPackages] = useState('systemd,openssh-server,iproute,vim-minimal')
  const [building, setBuilding] = useState(false)

  const handleBuild = async () => {
    if (!name.trim()) { toast.error('Enter an image name'); return }
    setBuilding(true)
    try {
      await buildImage({ name, distribution: distro, packages: packages.split(',').map(p => p.trim()).filter(Boolean), autologin: true })
      onSuccess()
    } catch (e) {
      toastFailure(toast, 'Build failed', e)
    } finally {
      setBuilding(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800/50 rounded-lg shadow-2xl border border-slate-700/50 w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
          <h2 className="text-xl font-bold">Build Image (mkosi)</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/[0.03] rounded"><span className="text-2xl">&times;</span></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Image Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="my-image" className="w-full bg-slate-800 border border-slate-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Distribution</label>
            <select value={distro} onChange={e => setDistro(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500">
              <option value="fedora">Fedora</option>
              <option value="ubuntu">Ubuntu</option>
              <option value="debian">Debian</option>
              <option value="centos">CentOS</option>
              <option value="arch">Arch Linux</option>
              <option value="opensuse">openSUSE</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Packages (comma-separated)</label>
            <input value={packages} onChange={e => setPackages(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500" />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-6 border-t border-slate-700/50">
          <button onClick={onClose} disabled={building} className="px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded-lg disabled:opacity-50">Cancel</button>
          <button onClick={handleBuild} disabled={building} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">{building ? 'Building...' : 'Build'}</button>
        </div>
      </div>
    </div>
  )
}
