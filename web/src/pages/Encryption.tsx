import { useState, useEffect } from 'react'
import { Plus, Trash2, RefreshCw, Key, Shield } from 'lucide-react'
import {
  listProviders,
  registerProvider,
  removeProvider,
  listEncryptionPolicies,
  createEncryptionPolicy,
  listEncryptedVms,
  rotateVmKey,
  type KeyProvider,
  type EncryptionPolicy,
  type VmEncryptionStatus,
} from '../api/encryption'
import { useToastContext } from '../contexts/ToastContext'

export default function Encryption() {
  const toast = useToastContext()
  const [providers, setProviders] = useState<KeyProvider[]>([])
  const [policies, setPolicies] = useState<EncryptionPolicy[]>([])
  const [encryptedVMs, setEncryptedVMs] = useState<VmEncryptionStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'providers' | 'policies' | 'vms'>('providers')
  const [showCreateProvider, setShowCreateProvider] = useState(false)
  const [showCreatePolicy, setShowCreatePolicy] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [prov, pol, vms] = await Promise.all([
        listProviders(),
        listEncryptionPolicies(),
        listEncryptedVms(),
      ])
      setProviders(prov)
      setPolicies(pol)
      setEncryptedVMs(vms)
    } catch (error) {
      console.error('Failed to load encryption data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveProvider = async (id: string) => {
    if (!confirm('Remove this key provider?')) return
    try {
      await removeProvider(id)
      toast.success('Key provider removed')
      loadData()
    } catch { toast.error('Failed to remove key provider') }
  }

  const handleRotateKey = async (vmId: string) => {
    if (!confirm('Rotate encryption key for this VM?')) return
    try {
      await rotateVmKey(vmId)
      toast.success('Key rotation initiated')
      loadData()
    } catch { toast.error('Failed to rotate key') }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      connected: 'bg-green-100 text-green-800',
      disconnected: 'bg-red-100 text-red-800',
      error: 'bg-red-100 text-red-800',
      encrypted: 'bg-green-100 text-green-800',
      encrypting: 'bg-blue-100 text-blue-800',
      decrypting: 'bg-yellow-100 text-yellow-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Encryption</h1>
        <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Key className="w-4 h-4" /> Key Providers
          </div>
          <div className="text-3xl font-bold">{providers.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Shield className="w-4 h-4" /> Policies
          </div>
          <div className="text-3xl font-bold">{policies.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-400 text-sm mb-1">Encrypted VMs</div>
          <div className="text-3xl font-bold text-green-400">
            {encryptedVMs.filter(v => v.encrypted).length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-400 text-sm mb-1">Total Keys</div>
          <div className="text-3xl font-bold">
            {providers.reduce((s, p) => s + p.key_count, 0)}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-800 rounded-lg p-1">
        {(['providers', 'policies', 'vms'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium capitalize ${activeTab === tab ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>
            {tab === 'providers' ? 'Key Providers' : tab === 'vms' ? 'Encrypted VMs' : 'Policies'}
          </button>
        ))}
      </div>

      {/* Key Providers Tab */}
      {activeTab === 'providers' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateProvider(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Provider
            </button>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg">
            <table className="min-w-full divide-y divide-gray-700">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase">
                  <th className="p-4">Name</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Endpoint</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Keys</th>
                  <th className="p-4">Default</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {providers.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-400">No key providers registered.</td></tr>
                ) : providers.map(prov => (
                  <tr key={prov.id} className="hover:bg-gray-750">
                    <td className="p-4 font-medium">{prov.name}</td>
                    <td className="p-4 text-sm">{prov.provider_type}</td>
                    <td className="p-4 text-sm font-mono text-gray-400">{prov.endpoint}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(prov.status)}`}>
                        {prov.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm">{prov.key_count}</td>
                    <td className="p-4 text-sm">{prov.default_provider ? 'Yes' : 'No'}</td>
                    <td className="p-4">
                      <button onClick={() => handleRemoveProvider(prov.id)} className="text-red-600 hover:text-red-800">
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

      {/* Policies Tab */}
      {activeTab === 'policies' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreatePolicy(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Policy
            </button>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg">
            <table className="min-w-full divide-y divide-gray-700">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase">
                  <th className="p-4">Name</th>
                  <th className="p-4">Provider</th>
                  <th className="p-4">Algorithm</th>
                  <th className="p-4">Key Size</th>
                  <th className="p-4">Auto Rotate</th>
                  <th className="p-4">Rotation Interval</th>
                  <th className="p-4">Enabled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {policies.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-400">No encryption policies.</td></tr>
                ) : policies.map(pol => (
                  <tr key={pol.id} className="hover:bg-gray-750">
                    <td className="p-4">
                      <div className="font-medium">{pol.name}</div>
                      {pol.description && <div className="text-xs text-gray-400">{pol.description}</div>}
                    </td>
                    <td className="p-4 text-sm text-gray-400">{pol.provider_id}</td>
                    <td className="p-4 text-sm font-mono">{pol.algorithm}</td>
                    <td className="p-4 text-sm">{pol.key_size} bits</td>
                    <td className="p-4 text-sm">{pol.auto_rotate ? 'Yes' : 'No'}</td>
                    <td className="p-4 text-sm">{pol.rotation_interval_days ? `${pol.rotation_interval_days} days` : '-'}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${pol.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {pol.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Encrypted VMs Tab */}
      {activeTab === 'vms' && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-700">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase">
                <th className="p-4">VM</th>
                <th className="p-4">Encrypted</th>
                <th className="p-4">Policy</th>
                <th className="p-4">Algorithm</th>
                <th className="p-4">Last Key Rotation</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {encryptedVMs.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-gray-400">No encrypted VMs.</td></tr>
              ) : encryptedVMs.map(vm => (
                <tr key={vm.vm_id} className="hover:bg-gray-750">
                  <td className="p-4 font-medium">{vm.vm_name}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${vm.encrypted ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {vm.encrypted ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-400">{vm.policy_name || '-'}</td>
                  <td className="p-4 text-sm font-mono">{vm.algorithm || '-'}</td>
                  <td className="p-4 text-sm text-gray-400">
                    {vm.last_key_rotation ? new Date(vm.last_key_rotation).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="p-4">
                    {vm.encrypted && (
                      <button onClick={() => handleRotateKey(vm.vm_id)}
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm">
                        <RefreshCw className="w-3 h-3" /> Rotate Key
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Provider Modal */}
      {showCreateProvider && (
        <CreateProviderModal onClose={() => setShowCreateProvider(false)}
          onCreated={() => { setShowCreateProvider(false); loadData() }} />
      )}

      {/* Create Policy Modal */}
      {showCreatePolicy && (
        <CreatePolicyModal providers={providers} onClose={() => setShowCreatePolicy(false)}
          onCreated={() => { setShowCreatePolicy(false); loadData() }} />
      )}
    </div>
  )
}

function CreateProviderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [providerType, setProviderType] = useState('KMIP')
  const [endpoint, setEndpoint] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await registerProvider({ name, provider_type: providerType, endpoint })
      onCreated()
    } catch { alert('Failed to register provider') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Register Key Provider</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select value={providerType} onChange={e => setProviderType(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2">
              <option value="KMIP">KMIP</option>
              <option value="Native">Native</option>
              <option value="Cloud">Cloud</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Endpoint</label>
            <input type="text" value={endpoint} onChange={e => setEndpoint(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
              placeholder="https://kms.example.com:5696" required />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Register</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreatePolicyModal({ providers, onClose, onCreated }: { providers: KeyProvider[]; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [providerId, setProviderId] = useState(providers[0]?.id || '')
  const [algorithm, setAlgorithm] = useState('AES-256-XTS')
  const [keySize, setKeySize] = useState(256)
  const [autoRotate, setAutoRotate] = useState(false)
  const [rotationDays, setRotationDays] = useState(90)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createEncryptionPolicy({
        name, description: description || undefined, provider_id: providerId,
        algorithm, key_size: keySize, auto_rotate: autoRotate,
        rotation_interval_days: autoRotate ? rotationDays : undefined,
      })
      onCreated()
    } catch { alert('Failed to create policy') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create Encryption Policy</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Key Provider</label>
            <select value={providerId} onChange={e => setProviderId(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2">
              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Algorithm</label>
              <select value={algorithm} onChange={e => setAlgorithm(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2">
                <option value="AES-256-XTS">AES-256-XTS</option>
                <option value="AES-128-XTS">AES-128-XTS</option>
                <option value="AES-256-CBC">AES-256-CBC</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Key Size</label>
              <select value={keySize} onChange={e => setKeySize(Number(e.target.value))}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2">
                <option value={128}>128 bits</option>
                <option value={256}>256 bits</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={autoRotate} onChange={e => setAutoRotate(e.target.checked)} />
            <span className="text-sm">Auto-rotate keys</span>
          </label>
          {autoRotate && (
            <div>
              <label className="block text-sm font-medium mb-1">Rotation Interval (days)</label>
              <input type="number" value={rotationDays} onChange={e => setRotationDays(Number(e.target.value))}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" min={1} />
            </div>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}
