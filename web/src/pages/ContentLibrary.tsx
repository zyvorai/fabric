import { useState, useEffect } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import {
  listLibraries,
  createLibrary,
  deleteLibrary,
  listLibraryItems,
  deleteLibraryItem,
  listCustomizationSpecs,
  createCustomizationSpec,
  deleteCustomizationSpec,
  listHostProfiles,
  createHostProfile,
  deleteHostProfile,
  type Library,
  type LibraryItem,
  type GuestCustomizationSpec,
  type HostProfile,
} from '../api/contentLibrary'
import { useToastContext } from '../contexts/ToastContext'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import { PageHeader } from '../components/ui'

export default function ContentLibrary() {
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const [libraries, setLibraries] = useState<Library[]>([])
  const [items, setItems] = useState<LibraryItem[]>([])
  const [specs, setSpecs] = useState<GuestCustomizationSpec[]>([])
  const [profiles, setProfiles] = useState<HostProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'libraries' | 'items' | 'specs' | 'profiles'>('libraries')
  const [selectedLibrary, setSelectedLibrary] = useState<string | null>(null)
  const [showCreateLibrary, setShowCreateLibrary] = useState(false)
  const [showCreateSpec, setShowCreateSpec] = useState(false)
  const [showCreateProfile, setShowCreateProfile] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [libs, sp, pr] = await Promise.all([
        listLibraries(), listCustomizationSpecs(), listHostProfiles(),
      ])
      setLibraries(libs); setSpecs(sp); setProfiles(pr)

      // Load items for all libraries
      const allItems: LibraryItem[] = []
      for (const lib of libs) {
        try {
          const libItems = await listLibraryItems(lib.id)
          allItems.push(...libItems)
        } catch { /* skip */ }
      }
      setItems(allItems)
    } catch (error) {
      console.error('Failed to load content library data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteLibrary = async (id: string) => {
    if (!await confirm('Delete Library', 'Delete this library and all its items?')) return
    try { await deleteLibrary(id); toast.success('Library deleted'); loadData() }
    catch { toast.error('Failed to delete library') }
  }

  const handleDeleteItem = async (libraryId: string, itemId: string) => {
    if (!await confirm('Delete Item', 'Delete this item?')) return
    try { await deleteLibraryItem(libraryId, itemId); toast.success('Item deleted'); loadData() }
    catch { toast.error('Failed to delete item') }
  }

  const handleDeleteSpec = async (id: string) => {
    if (!await confirm('Delete Customization Spec', 'Delete this customization spec?')) return
    try { await deleteCustomizationSpec(id); toast.success('Spec deleted'); loadData() }
    catch { toast.error('Failed to delete spec') }
  }

  const handleDeleteProfile = async (id: string) => {
    if (!await confirm('Delete Host Profile', 'Delete this host profile?')) return
    try { await deleteHostProfile(id); toast.success('Profile deleted'); loadData() }
    catch { toast.error('Failed to delete profile') }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }

  const getTypeColor = (type: string) => {
    const m: Record<string, string> = {
      template: 'bg-blue-100 text-blue-800', iso: 'bg-purple-100 text-purple-800',
      ovf: 'bg-green-100 text-green-800', script: 'bg-yellow-100 text-yellow-800',
      file: 'bg-slate-500/20 text-slate-400',
    }
    return m[type] || 'bg-slate-500/20 text-slate-400'
  }

  const filteredItems = selectedLibrary ? items.filter(i => i.library_id === selectedLibrary) : items

  if (loading) return <div className="text-center py-8">Loading...</div>

  return (
    <div className="p-6">
      <PageHeader
        title="Content Library"
        actions={
          <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-slate-400 text-sm mb-1">Libraries</div>
          <div className="text-2xl font-bold">{libraries.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-slate-400 text-sm mb-1">Items</div>
          <div className="text-2xl font-bold">{items.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-slate-400 text-sm mb-1">Guest Customizations</div>
          <div className="text-2xl font-bold">{specs.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-slate-400 text-sm mb-1">Host Profiles</div>
          <div className="text-2xl font-bold">{profiles.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-900 rounded-lg p-1">
        {(['libraries', 'items', 'specs', 'profiles'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium ${activeTab === tab ? 'bg-blue-600' : 'hover:bg-white/[0.03]'}`}>
            {tab === 'specs' ? 'Guest Customization' : tab === 'profiles' ? 'Host Profiles' : tab === 'items' ? 'Item Browser' : 'Libraries'}
          </button>
        ))}
      </div>

      {/* Libraries Tab */}
      {activeTab === 'libraries' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateLibrary(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Library
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {libraries.length === 0 ? (
              <div className="col-span-full text-center py-12 text-slate-400 bg-slate-900 rounded-lg">No libraries.</div>
            ) : libraries.map(lib => (
              <div key={lib.id} className="bg-slate-900 border border-slate-700/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-lg">{lib.name}</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${lib.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-slate-500/20 text-slate-400'}`}>{lib.status}</span>
                </div>
                {lib.description && <p className="text-sm text-slate-400 mb-3">{lib.description}</p>}
                <div className="flex justify-between text-sm text-slate-400 mb-3">
                  <span>{lib.item_count} items</span>
                  <span>{formatBytes(lib.total_size_bytes)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 text-xs rounded ${lib.library_type === 'local' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                    {lib.library_type}
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setSelectedLibrary(lib.id); setActiveTab('items') }}
                      className="text-blue-400 hover:text-blue-300 text-sm">Browse</button>
                    <button onClick={() => handleDeleteLibrary(lib.id)} className="text-red-600 hover:text-red-800">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Items Tab */}
      {activeTab === 'items' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <select value={selectedLibrary || ''} onChange={e => setSelectedLibrary(e.target.value || null)}
                className="bg-slate-800 border border-slate-700/50 rounded px-3 py-2 text-sm">
                <option value="">All Libraries</option>
                {libraries.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <span className="text-sm text-slate-400">{filteredItems.length} items</span>
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-700/50 rounded-lg">
            <table className="min-w-full divide-y divide-slate-700/50">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase">
                  <th className="p-4">Name</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Version</th>
                  <th className="p-4">Size</th>
                  <th className="p-4">Updated</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filteredItems.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-400">No items found.</td></tr>
                ) : filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-slate-900">
                    <td className="p-4">
                      <div className="font-medium">{item.name}</div>
                      {item.description && <div className="text-xs text-slate-400">{item.description}</div>}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(item.item_type)}`}>{item.item_type}</span>
                    </td>
                    <td className="p-4 text-sm">{item.version}</td>
                    <td className="p-4 text-sm">{formatBytes(item.size_bytes)}</td>
                    <td className="p-4 text-sm text-slate-400">{item.updated ? new Date(item.updated).toLocaleDateString() : '-'}</td>
                    <td className="p-4">
                      <button onClick={() => handleDeleteItem(item.library_id, item.id)} className="text-red-600 hover:text-red-800">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Guest Customization Specs Tab */}
      {activeTab === 'specs' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateSpec(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Spec
            </button>
          </div>
          <div className="bg-slate-900 border border-slate-700/50 rounded-lg">
            <table className="min-w-full divide-y divide-slate-700/50">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase">
                  <th className="p-4">Name</th>
                  <th className="p-4">OS Type</th>
                  <th className="p-4">Hostname Prefix</th>
                  <th className="p-4">Domain</th>
                  <th className="p-4">DNS Servers</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {specs.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-400">No customization specs.</td></tr>
                ) : specs.map(spec => (
                  <tr key={spec.id} className="hover:bg-slate-900">
                    <td className="p-4 font-medium">{spec.name}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${spec.os_type === 'linux' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                        {spec.os_type}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-slate-400">{spec.hostname_prefix || '-'}</td>
                    <td className="p-4 text-sm text-slate-400">{spec.domain || '-'}</td>
                    <td className="p-4 text-sm font-mono text-slate-400">{spec.dns_servers?.join(', ') || '-'}</td>
                    <td className="p-4">
                      <button onClick={() => handleDeleteSpec(spec.id)} className="text-red-600 hover:text-red-800">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Host Profiles Tab */}
      {activeTab === 'profiles' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateProfile(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Profile
            </button>
          </div>
          <div className="bg-slate-900 border border-slate-700/50 rounded-lg">
            <table className="min-w-full divide-y divide-slate-700/50">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase">
                  <th className="p-4">Name</th>
                  <th className="p-4">Compliant</th>
                  <th className="p-4">Non-Compliant</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {profiles.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-400">No host profiles.</td></tr>
                ) : profiles.map(profile => (
                  <tr key={profile.id} className="hover:bg-slate-900">
                    <td className="p-4">
                      <div className="font-medium">{profile.name}</div>
                      {profile.description && <div className="text-xs text-slate-400">{profile.description}</div>}
                    </td>
                    <td className="p-4 text-sm text-green-400">{profile.compliant_hosts}</td>
                    <td className="p-4 text-sm text-red-400">{profile.non_compliant_hosts}</td>
                    <td className="p-4 text-sm">{profile.status}</td>
                    <td className="p-4">
                      <button onClick={() => handleDeleteProfile(profile.id)} className="text-red-600 hover:text-red-800">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreateLibrary && <CreateLibraryModal onClose={() => setShowCreateLibrary(false)} onCreated={() => { setShowCreateLibrary(false); loadData() }} />}
      {showCreateSpec && <CreateSpecModal onClose={() => setShowCreateSpec(false)} onCreated={() => { setShowCreateSpec(false); loadData() }} />}
      {showCreateProfile && <CreateProfileModal onClose={() => setShowCreateProfile(false)} onCreated={() => { setShowCreateProfile(false); loadData() }} />}
      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel ?? 'Delete'}
          variant={confirmState.variant ?? 'danger'}
          onConfirm={confirmState.onConfirm}
          onCancel={cancel}
        />
      )}
    </div>
  )
}

function CreateLibraryModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [libraryType, setLibraryType] = useState<'local' | 'subscribed'>('local')
  const [storagePath, setStoragePath] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await createLibrary({ name, description: description || undefined, library_type: libraryType, storage_path: storagePath }); onCreated() }
    catch { alert('Failed to create library') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create Library</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required /></div>
          <div><label className="block text-sm font-medium mb-1">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" /></div>
          <div><label className="block text-sm font-medium mb-1">Type</label>
            <select value={libraryType} onChange={e => setLibraryType(e.target.value as 'local' | 'subscribed')} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2">
              <option value="local">Local</option><option value="subscribed">Subscribed</option>
            </select></div>
          <div><label className="block text-sm font-medium mb-1">Storage Path</label>
            <input type="text" value={storagePath} onChange={e => setStoragePath(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2 font-mono" required /></div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreateSpecModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [osType, setOsType] = useState<'linux' | 'windows'>('linux')
  const [hostnamePrefix, setHostnamePrefix] = useState('')
  const [domain, setDomain] = useState('')
  const [dnsServers, setDnsServers] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createCustomizationSpec({ name, os_type: osType, hostname_prefix: hostnamePrefix || undefined, domain: domain || undefined, dns_servers: dnsServers.split(',').map(s => s.trim()).filter(Boolean) })
      onCreated()
    } catch { alert('Failed to create spec') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create Customization Spec</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required /></div>
          <div><label className="block text-sm font-medium mb-1">OS Type</label>
            <select value={osType} onChange={e => setOsType(e.target.value as 'linux' | 'windows')} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2">
              <option value="linux">Linux</option><option value="windows">Windows</option>
            </select></div>
          <div><label className="block text-sm font-medium mb-1">Hostname Prefix</label>
            <input type="text" value={hostnamePrefix} onChange={e => setHostnamePrefix(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" /></div>
          <div><label className="block text-sm font-medium mb-1">Domain</label>
            <input type="text" value={domain} onChange={e => setDomain(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" /></div>
          <div><label className="block text-sm font-medium mb-1">DNS Servers (comma-separated)</label>
            <input type="text" value={dnsServers} onChange={e => setDnsServers(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" placeholder="8.8.8.8, 8.8.4.4" /></div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreateProfileModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await createHostProfile({ name, description: description || undefined, settings: {} }); onCreated() }
    catch { alert('Failed to create profile') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create Host Profile</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required /></div>
          <div><label className="block text-sm font-medium mb-1">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" /></div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}
