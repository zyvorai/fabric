// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import { encryptionApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';
import type { EncryptionProvider, EncryptionPolicy } from '../types';

export default function Encryption() {
  const [provName, setProvName] = useState('');
  const [provType, setProvType] = useState('local');
  const [polName, setPolName] = useState('');
  const [polAlgorithm, setPolAlgorithm] = useState('AES-256');
  const [polKeySize, setPolKeySize] = useState(256);
  const [polProvider, setPolProvider] = useState('');
  const [encryptVm, setEncryptVm] = useState('');
  const [encryptPolicy, setEncryptPolicy] = useState('');

  const fetchProviders = useCallback(() => encryptionApi.listProviders() as Promise<EncryptionProvider[]>, []);
  const fetchPolicies = useCallback(() => encryptionApi.listPolicies() as Promise<EncryptionPolicy[]>, []);
  const fetchEncryptedVms = useCallback(() => encryptionApi.listEncryptedVms(), []);

  const { data: provData, refresh: refreshProviders } = usePolling<EncryptionProvider[]>(fetchProviders, 15000);
  const { data: polData, refresh: refreshPolicies } = usePolling<EncryptionPolicy[]>(fetchPolicies, 15000);
  const { data: encVms, refresh: refreshVms } = usePolling<unknown[]>(fetchEncryptedVms, 15000);

  const providers = (provData || []) as EncryptionProvider[];
  const policies = (polData || []) as EncryptionPolicy[];
  const encryptedVms = (encVms || []) as { name: string; status: string; policy_id: string }[];

  const handleRegisterProvider = async () => {
    if (!provName.trim()) return;
    try { await encryptionApi.registerProvider({ name: provName, type: provType }); setProvName(''); refreshProviders(); }
    catch (err) { console.error('Failed to register provider:', err); }
  };

  const handleTestProvider = async (id: string) => {
    try { await encryptionApi.testProvider(id); alert('Provider test successful'); }
    catch (err) { console.error('Provider test failed:', err); alert('Provider test failed'); }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!confirm('Delete this provider?')) return;
    try { await encryptionApi.removeProvider(id); refreshProviders(); }
    catch (err) { console.error('Failed to delete provider:', err); }
  };

  const handleCreatePolicy = async () => {
    if (!polName.trim() || !polProvider.trim()) return;
    try { await encryptionApi.createPolicy({ name: polName, algorithm: polAlgorithm, key_size: polKeySize, provider_id: polProvider }); setPolName(''); setPolProvider(''); refreshPolicies(); }
    catch (err) { console.error('Failed to create policy:', err); }
  };

  const handleDeletePolicy = async (id: string) => {
    if (!confirm('Delete this policy?')) return;
    try { await encryptionApi.deletePolicy(id); refreshPolicies(); }
    catch (err) { console.error('Failed to delete policy:', err); }
  };

  const handleEncrypt = async () => {
    if (!encryptVm.trim() || !encryptPolicy.trim()) return;
    try { await encryptionApi.encryptVm(encryptVm, { policy_id: encryptPolicy }); setEncryptVm(''); setEncryptPolicy(''); refreshVms(); }
    catch (err) { console.error('Failed to encrypt VM:', err); }
  };

  const handleDecrypt = async (name: string) => {
    if (!confirm(`Decrypt VM ${name}?`)) return;
    try { await encryptionApi.decryptVm(name); refreshVms(); }
    catch (err) { console.error('Failed to decrypt VM:', err); }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-500/20 text-green-400', encrypted: 'bg-green-500/20 text-green-400',
      error: 'bg-red-500/20 text-red-400', inactive: 'bg-slate-500/20 text-slate-400',
    };
    return colors[status] || 'bg-slate-500/20 text-slate-400';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Encryption</h2>
        <p className="text-sm text-slate-400 mt-1">Manage encryption providers, policies, and VM encryption</p>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Register Provider</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input value={provName} onChange={e => setProvName(e.target.value)} placeholder="Provider name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <select value={provType} onChange={e => setProvType(e.target.value)} className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500">
            <option value="local">Local</option><option value="vault">HashiCorp Vault</option><option value="kmip">KMIP</option>
          </select>
        </div>
        <button onClick={handleRegisterProvider} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Register</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Providers</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400"><tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-700/50">
            {providers.map(p => (
              <tr key={p.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white font-medium">{p.name}</td><td className="px-5 py-3">{p.type}</td>
                <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(p.status)}`}>{p.status}</span></td>
                <td className="px-5 py-3 space-x-2">
                  <button onClick={() => handleTestProvider(p.id)} className="px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded-lg">Test</button>
                  <button onClick={() => handleDeleteProvider(p.id)} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Delete</button>
                </td>
              </tr>
            ))}
            {providers.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">No providers</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Create Policy</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input value={polName} onChange={e => setPolName(e.target.value)} placeholder="Policy name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <select value={polAlgorithm} onChange={e => setPolAlgorithm(e.target.value)} className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500">
            <option value="AES-256">AES-256</option><option value="AES-128">AES-128</option><option value="ChaCha20">ChaCha20</option>
          </select>
          <input type="number" value={polKeySize} onChange={e => setPolKeySize(Number(e.target.value))} placeholder="Key size" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={polProvider} onChange={e => setPolProvider(e.target.value)} placeholder="Provider ID" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={handleCreatePolicy} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Create Policy</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Policies</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400"><tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Algorithm</th><th className="px-5 py-3">Key Size</th><th className="px-5 py-3">Provider</th><th className="px-5 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-700/50">
            {policies.map(p => (
              <tr key={p.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white font-medium">{p.name}</td><td className="px-5 py-3">{p.algorithm}</td>
                <td className="px-5 py-3">{p.key_size}</td><td className="px-5 py-3 font-mono text-xs">{p.provider_id}</td>
                <td className="px-5 py-3"><button onClick={() => handleDeletePolicy(p.id)} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Delete</button></td>
              </tr>
            ))}
            {policies.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No policies</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Encrypt VM</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input value={encryptVm} onChange={e => setEncryptVm(e.target.value)} placeholder="VM name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={encryptPolicy} onChange={e => setEncryptPolicy(e.target.value)} placeholder="Policy ID" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={handleEncrypt} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Encrypt</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Encrypted VMs</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400"><tr><th className="px-5 py-3">VM</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Policy</th><th className="px-5 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-700/50">
            {encryptedVms.map(v => (
              <tr key={v.name} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white font-medium">{v.name}</td>
                <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(v.status)}`}>{v.status}</span></td>
                <td className="px-5 py-3 font-mono text-xs">{v.policy_id}</td>
                <td className="px-5 py-3"><button onClick={() => handleDecrypt(v.name)} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Decrypt</button></td>
              </tr>
            ))}
            {encryptedVms.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">No encrypted VMs</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
