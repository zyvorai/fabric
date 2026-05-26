// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useEffect, useState } from 'react'
import { Cpu, MemoryStick, HardDrive, Plus, Trash2, Layers } from 'lucide-react'
import { listProfiles, createProfile, deleteProfile, VMProfile } from '../api/profiles'
import { useToastContext } from '../contexts/ToastContext'

export default function Profiles() {
  const toast = useToastContext()
  const [profiles, setProfiles] = useState<VMProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  useEffect(() => { loadProfiles() }, [])

  const loadProfiles = async () => {
    try {
      const data = await listProfiles()
      setProfiles(data)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  const handleDelete = async (name: string) => {
    try {
      await deleteProfile(name)
      toast.success(`Profile '${name}' deleted`)
      loadProfiles()
    } catch { toast.error('Cannot delete built-in profiles') }
  }

  const categoryColors: Record<string, string> = {
    general: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    compute: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    memory: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    storage: 'bg-green-500/20 text-green-400 border-green-500/30',
    gpu: 'bg-red-500/20 text-red-400 border-red-500/30',
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-3"><Layers className="w-8 h-8" /> Instance Types</h1>
        <button onClick={() => setShowCreateDialog(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"><Plus className="w-4 h-4" />Create Profile</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {profiles.map(p => (
          <div key={p.name} className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50 hover:border-slate-700/50 transition">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold">{p.name}</h3>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs border ${categoryColors[p.category] || categoryColors.general}`}>{p.category}</span>
              </div>
              {!p.builtin && <button onClick={() => handleDelete(p.name)} className="p-1 hover:bg-red-600 rounded"><Trash2 className="w-4 h-4" /></button>}
            </div>
            <p className="text-sm text-slate-400 mb-4">{p.description}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400 flex items-center gap-1"><Cpu className="w-3 h-3" />CPUs</span><span className="font-medium">{p.cpus}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 flex items-center gap-1"><MemoryStick className="w-3 h-3" />Memory</span><span className="font-medium">{p.memory >= 1024 ? `${p.memory / 1024} GB` : `${p.memory} MB`}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 flex items-center gap-1"><HardDrive className="w-3 h-3" />Disk</span><span className="font-medium">{p.disk} GB</span></div>
              {p.network_bandwidth && <div className="flex justify-between"><span className="text-slate-400">Network</span><span className="font-medium">{p.network_bandwidth}</span></div>}
            </div>
            {p.builtin && <div className="mt-3 text-xs text-slate-500">Built-in</div>}
          </div>
        ))}
      </div>

      {showCreateDialog && <CreateProfileDialog onClose={() => setShowCreateDialog(false)} onSuccess={() => { toast.success('Profile created'); setShowCreateDialog(false); loadProfiles() }} />}
    </div>
  )
}

function CreateProfileDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const toast = useToastContext()
  const [name, setName] = useState('')
  const [cpus, setCpus] = useState(2)
  const [memory, setMemory] = useState(2048)
  const [disk, setDisk] = useState(20)
  const [category, setCategory] = useState('general')

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Enter a profile name'); return }
    try {
      await createProfile({ name, description: `Custom ${name} profile`, cpus, memory, disk, category: category as VMProfile['category'], network_bandwidth: undefined })
      onSuccess()
    } catch (e) { toast.error(`Failed: ${e}`) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800/50 rounded-lg shadow-2xl border border-slate-700/50 w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50"><h2 className="text-xl font-bold">Create Profile</h2><button onClick={onClose} className="p-2 hover:bg-white/[0.03] rounded"><span className="text-2xl">&times;</span></button></div>
        <div className="p-6 space-y-4">
          <div><label className="block text-sm font-medium text-slate-300 mb-2">Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="my-profile" className="w-full bg-slate-800 border border-slate-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500" autoFocus /></div>
          <div><label className="block text-sm font-medium text-slate-300 mb-2">Category</label><select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg py-2 px-4 text-white"><option value="general">General</option><option value="compute">Compute</option><option value="memory">Memory</option><option value="storage">Storage</option></select></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-sm text-slate-300 mb-1">CPUs</label><input type="number" value={cpus} onChange={e => setCpus(+e.target.value)} min={1} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg py-2 px-3 text-white" /></div>
            <div><label className="block text-sm text-slate-300 mb-1">Memory (MB)</label><input type="number" value={memory} onChange={e => setMemory(+e.target.value)} min={256} step={256} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg py-2 px-3 text-white" /></div>
            <div><label className="block text-sm text-slate-300 mb-1">Disk (GB)</label><input type="number" value={disk} onChange={e => setDisk(+e.target.value)} min={1} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg py-2 px-3 text-white" /></div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-6 border-t border-slate-700/50">
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded-lg">Cancel</button>
          <button onClick={handleCreate} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg">Create</button>
        </div>
      </div>
    </div>
  )
}
