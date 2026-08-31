// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, RefreshCw, Key, Shield, Lock, Unlock } from 'lucide-react'
import {
  listProviders,
  registerProvider,
  removeProvider,
  listEncryptionPolicies,
  createEncryptionPolicy,
  listEncryptedVms,
  rotateVmKey,
  encryptVm,
  decryptVm,
  type KeyProvider,
  type EncryptionPolicy,
  type VmEncryptionStatus,
} from '../api/encryption'
import { listVMs, VM } from '../api/vm'
import { useToastContext } from '../contexts/ToastContext'
import { toastFailure } from '../utils/toastError'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import { PageHeader } from '../components/ui'
import PageLoadBanner from '../components/PageLoadBanner'
import { usePageLoader } from '../hooks/usePageLoader'

export default function Encryption() {
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const [providers, setProviders] = useState<KeyProvider[]>([])
  const [policies, setPolicies] = useState<EncryptionPolicy[]>([])
  const [encryptedVMs, setEncryptedVMs] = useState<VmEncryptionStatus[]>([])
  const [allVMs, setAllVMs] = useState<VM[]>([])
  const { loading, loadError, run } = usePageLoader('Failed to load encryption data')
  const [activeTab, setActiveTab] = useState<'providers' | 'policies' | 'vms'>('providers')
  const [showCreateProvider, setShowCreateProvider] = useState(false)
  const [showCreatePolicy, setShowCreatePolicy] = useState(false)
  const [showEncryptVM, setShowEncryptVM] = useState(false)

  const loadData = useCallback(() => {
    return run(async () => {
      const [prov, pol, vms, allVms] = await Promise.all([
        listProviders(),
        listEncryptionPolicies(),
        listEncryptedVms(),
        listVMs(),
      ])
      setProviders(prov)
      setPolicies(pol)
      setEncryptedVMs(vms)
      setAllVMs(allVms)
    })
  }, [run])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleRemoveProvider = async (id: string) => {
    const ok = await confirm('Remove Key Provider', 'Remove this key provider?', { variant: 'danger', confirmLabel: 'Remove' })
    if (!ok) return
    try {
      await removeProvider(id)
      toast.success('Key provider removed')
      loadData()
    } catch { toast.error('Failed to remove key provider') }
  }

  const handleRotateKey = async (vmId: string) => {
    const ok = await confirm('Rotate Encryption Key', 'Rotate encryption key for this VM?', { variant: 'danger', confirmLabel: 'Rotate' })
    if (!ok) return
    try {
      await rotateVmKey(vmId)
      toast.success('Key rotation initiated')
      loadData()
    } catch { toast.error('Failed to rotate key') }
  }

  const handleDecrypt = async (vmName: string) => {
    const ok = await confirm('Decrypt VM', `Decrypt '${vmName}'? The VM's disk will no longer be protected by the encryption policy.`, { variant: 'danger', confirmLabel: 'Decrypt' })
    if (!ok) return
    try {
      await decryptVm(vmName)
      toast.success(`'${vmName}' decrypted`)
      loadData()
    } catch (err) { toastFailure(toast, 'Failed to decrypt VM', err) }
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
    return colors[status] || 'bg-black/[0.06] text-[#6e6e73]'
  }


  return (
    <div className="p-6">
      <PageHeader
        onRefresh={() => void loadData()}
        refreshing={loading}
        title="Encryption"
      />

      <PageLoadBanner title="Could not load encryption data" headline={loadError} onRetry={() => void loadData()} />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 text-[#6e6e73] text-sm mb-1">
            <Key className="w-4 h-4" /> Key Providers
          </div>
          <div className="text-2xl font-bold">{providers.length}</div>
        </div>
        <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 text-[#6e6e73] text-sm mb-1">
            <Shield className="w-4 h-4" /> Policies
          </div>
          <div className="text-2xl font-bold">{policies.length}</div>
        </div>
        <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-4 py-3">
          <div className="text-[#6e6e73] text-sm mb-1">Encrypted VMs</div>
          <div className="text-2xl font-bold text-emerald-600">
            {encryptedVMs.filter(v => v.encrypted).length}
          </div>
        </div>
        <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-4 py-3">
          <div className="text-[#6e6e73] text-sm mb-1">Connected Providers</div>
          <div className="text-2xl font-bold">
            {providers.filter(p => p.status === 'connected').length}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-[#f5f5f7] rounded-lg p-1">
        {(['providers', 'policies', 'vms'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium capitalize ${activeTab === tab ? 'bg-[#0066cc]' : 'hover:bg-white/[0.03]'}`}>
            {tab === 'providers' ? 'Key Providers' : tab === 'vms' ? 'Encrypted VMs' : 'Policies'}
          </button>
        ))}
      </div>

      {/* Key Providers Tab */}
      {activeTab === 'providers' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateProvider(true)}
              className="bg-[#0066cc] text-white px-4 py-2 rounded hover:bg-[#0077ed] flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Provider
            </button>
          </div>
          <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg">
            <table className="min-w-full divide-y divide-[#d2d2d7]">
              <thead>
                <tr className="text-left text-xs text-[#6e6e73] uppercase">
                  <th className="p-4">Name</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Endpoint</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d2d2d7]">
                {providers.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-[#6e6e73]">No key providers registered.</td></tr>
                ) : providers.map(prov => (
                  <tr key={prov.id} className="hover:bg-white">
                    <td className="p-4 font-medium">{prov.name}</td>
                    <td className="p-4 text-sm">{prov.provider_type}</td>
                    <td className="p-4 text-sm font-mono text-[#6e6e73]">{prov.endpoint}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(prov.status)}`}>
                        {prov.status}
                      </span>
                    </td>
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
              className="bg-[#0066cc] text-white px-4 py-2 rounded hover:bg-[#0077ed] flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Policy
            </button>
          </div>
          <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg">
            <table className="min-w-full divide-y divide-[#d2d2d7]">
              <thead>
                <tr className="text-left text-xs text-[#6e6e73] uppercase">
                  <th className="p-4">Name</th>
                  <th className="p-4">Provider</th>
                  <th className="p-4">Algorithm</th>
                  <th className="p-4">Encrypt vMotion</th>
                  <th className="p-4">Auto Rotate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d2d2d7]">
                {policies.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-[#6e6e73]">No encryption policies.</td></tr>
                ) : policies.map(pol => (
                  <tr key={pol.id} className="hover:bg-white">
                    <td className="p-4">
                      <div className="font-medium">{pol.name}</div>
                      {pol.description && <div className="text-xs text-[#6e6e73]">{pol.description}</div>}
                    </td>
                    <td className="p-4 text-sm text-[#6e6e73]">{providers.find(p => p.id === pol.key_provider_id)?.name || pol.key_provider_id}</td>
                    <td className="p-4 text-sm font-mono">{pol.algorithm}</td>
                    <td className="p-4 text-sm">{pol.encrypt_vmotion ? 'Yes' : 'No'}</td>
                    <td className="p-4 text-sm">{pol.auto_rotate_days ? `Every ${pol.auto_rotate_days} days` : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Encrypted VMs Tab */}
      {activeTab === 'vms' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowEncryptVM(true)} disabled={policies.length === 0}
              title={policies.length === 0 ? 'Create an encryption policy first' : undefined}
              className="bg-[#0066cc] text-white px-4 py-2 rounded hover:bg-[#0077ed] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <Lock className="w-4 h-4" /> Encrypt VM
            </button>
          </div>
          <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg">
            <table className="min-w-full divide-y divide-[#d2d2d7]">
              <thead>
                <tr className="text-left text-xs text-[#6e6e73] uppercase">
                  <th className="p-4">VM</th>
                  <th className="p-4">Encrypted</th>
                  <th className="p-4">Policy</th>
                  <th className="p-4">Algorithm</th>
                  <th className="p-4">Last Key Rotation</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d2d2d7]">
                {encryptedVMs.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-[#6e6e73]">No encrypted VMs.</td></tr>
                ) : encryptedVMs.map(vm => (
                  <tr key={vm.vm_name} className="hover:bg-white">
                    <td className="p-4 font-medium">{vm.vm_name}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${vm.encrypted ? 'bg-green-100 text-green-800' : 'bg-black/[0.06] text-[#6e6e73]'}`}>
                        {vm.encrypted ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-[#6e6e73]">{policies.find(p => p.id === vm.policy_id)?.name || vm.policy_id || '-'}</td>
                    <td className="p-4 text-sm font-mono">{vm.algorithm || '-'}</td>
                    <td className="p-4 text-sm text-[#6e6e73]">
                      {vm.last_key_rotation ? new Date(vm.last_key_rotation).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="p-4">
                      {vm.encrypted && (
                        <div className="flex items-center gap-3">
                          <button onClick={() => handleRotateKey(vm.vm_name)}
                            className="flex items-center gap-1 text-[#0066cc] hover:text-blue-300 text-sm">
                            <RefreshCw className="w-3.5 h-3.5" /> Rotate Key
                          </button>
                          <button onClick={() => handleDecrypt(vm.vm_name)}
                            className="flex items-center gap-1 text-red-600 hover:text-red-300 text-sm">
                            <Unlock className="w-3.5 h-3.5" /> Decrypt
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      {/* Encrypt VM Modal */}
      {showEncryptVM && (
        <EncryptVMModal
          vms={allVMs.filter(v => !encryptedVMs.some(e => e.vm_name === v.name && e.encrypted))}
          policies={policies}
          onClose={() => setShowEncryptVM(false)}
          onEncrypted={() => { setShowEncryptVM(false); loadData() }}
        />
      )}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          variant={confirmState.variant}
          onConfirm={confirmState.onConfirm}
          onCancel={cancel}
        />
      )}
    </div>
  )
}

function CreateProviderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToastContext()
  const [name, setName] = useState('')
  const [providerType, setProviderType] = useState('kmip')
  const [endpoint, setEndpoint] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await registerProvider({ name, provider_type: providerType, endpoint })
      onCreated()
    } catch { toast.error('Failed to register provider') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#f5f5f7] rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Register Key Provider</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-white border border-[#d2d2d7] rounded px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select value={providerType} onChange={e => setProviderType(e.target.value)}
              className="w-full bg-white border border-[#d2d2d7] rounded px-3 py-2">
              <option value="kmip">KMIP</option>
              <option value="local">Local (software-based)</option>
              <option value="vault_transit">HashiCorp Vault (Transit)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Endpoint</label>
            <input type="text" value={endpoint} onChange={e => setEndpoint(e.target.value)}
              className="w-full bg-white border border-[#d2d2d7] rounded px-3 py-2"
              placeholder="https://kms.example.com:5696" required />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-white hover:bg-[#d2d2d7] rounded">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-[#0066cc] hover:bg-[#0077ed] rounded">Register</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreatePolicyModal({ providers, onClose, onCreated }: { providers: KeyProvider[]; onClose: () => void; onCreated: () => void }) {
  const toast = useToastContext()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [keyProviderId, setKeyProviderId] = useState(providers[0]?.id || '')
  const [algorithm, setAlgorithm] = useState('aes256_xts')
  const [encryptVmotion, setEncryptVmotion] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [rotationDays, setRotationDays] = useState(90)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createEncryptionPolicy({
        name, description: description || undefined, key_provider_id: keyProviderId,
        algorithm, encrypt_vmotion: encryptVmotion,
        auto_rotate_days: autoRotate ? rotationDays : undefined,
      })
      onCreated()
    } catch { toast.error('Failed to create policy') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#f5f5f7] rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create Encryption Policy</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-white border border-[#d2d2d7] rounded px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              className="w-full bg-white border border-[#d2d2d7] rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Key Provider</label>
            <select value={keyProviderId} onChange={e => setKeyProviderId(e.target.value)}
              className="w-full bg-white border border-[#d2d2d7] rounded px-3 py-2">
              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Algorithm</label>
            <select value={algorithm} onChange={e => setAlgorithm(e.target.value)}
              className="w-full bg-white border border-[#d2d2d7] rounded px-3 py-2">
              <option value="aes256_xts">AES-256-XTS</option>
              <option value="aes256_cbc">AES-256-CBC</option>
              <option value="cha_cha20_poly1305">ChaCha20-Poly1305</option>
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={encryptVmotion} onChange={e => setEncryptVmotion(e.target.checked)} />
            <span className="text-sm">Encrypt vMotion traffic</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={autoRotate} onChange={e => setAutoRotate(e.target.checked)} />
            <span className="text-sm">Auto-rotate keys</span>
          </label>
          {autoRotate && (
            <div>
              <label className="block text-sm font-medium mb-1">Rotation Interval (days)</label>
              <input type="number" value={rotationDays} onChange={e => setRotationDays(Number(e.target.value))}
                className="w-full bg-white border border-[#d2d2d7] rounded px-3 py-2" min={1} />
            </div>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-white hover:bg-[#d2d2d7] rounded">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-[#0066cc] hover:bg-[#0077ed] rounded">Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EncryptVMModal({ vms, policies, onClose, onEncrypted }: { vms: VM[]; policies: EncryptionPolicy[]; onClose: () => void; onEncrypted: () => void }) {
  const toast = useToastContext()
  const [vmName, setVmName] = useState(vms[0]?.name || '')
  const [policyId, setPolicyId] = useState(policies[0]?.id || '')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vmName || !policyId) return
    setSubmitting(true)
    try {
      await encryptVm(vmName, policyId)
      toast.success(`Encrypting '${vmName}'`)
      onEncrypted()
    } catch (err) { toastFailure(toast, 'Failed to encrypt VM', err) } finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#f5f5f7] rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Encrypt Virtual Machine</h2>
        {vms.length === 0 ? (
          <>
            <p className="text-sm text-[#6e6e73] mb-4">All VMs are already encrypted, or no VMs exist yet.</p>
            <button onClick={onClose} className="w-full px-4 py-2 bg-white hover:bg-[#d2d2d7] rounded">Close</button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">VM</label>
              <select value={vmName} onChange={e => setVmName(e.target.value)}
                className="w-full bg-white border border-[#d2d2d7] rounded px-3 py-2">
                {vms.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Encryption Policy</label>
              <select value={policyId} onChange={e => setPolicyId(e.target.value)}
                className="w-full bg-white border border-[#d2d2d7] rounded px-3 py-2">
                {policies.map(p => <option key={p.id} value={p.id}>{p.name} ({p.algorithm})</option>)}
              </select>
            </div>
            <p className="text-xs text-[#6e6e73]">The VM's disk will be encrypted using the selected policy's key provider and algorithm.</p>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-white hover:bg-[#d2d2d7] rounded">Cancel</button>
              <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-[#0066cc] hover:bg-[#0077ed] rounded disabled:opacity-50">{submitting ? 'Encrypting...' : 'Encrypt'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
