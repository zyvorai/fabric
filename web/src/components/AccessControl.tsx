// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback } from 'react';
import { Users, Plus, Shield, RefreshCw, Trash2, TestTube2 } from 'lucide-react';
import { auth } from '../utils/api';
import { usePolling } from '../hooks/usePolling';

interface AuthProvider {
  id?: string;
  name?: string;
  type?: string;
  client_id?: string;
  issuer_url?: string;
  enabled?: boolean;
}

export default function AccessControl() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', type: 'oidc', client_id: '', client_secret: '', issuer_url: '' });
  const [testResult, setTestResult] = useState<{ id: string; status: string } | null>(null);

  const fetchProviders = useCallback(() => auth.listProviders() as Promise<AuthProvider[]>, []);
  const { data: providers, loading, refresh } = usePolling(fetchProviders, 20000);

  const items = providers || [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await auth.createProvider(formData);
      setFormData({ name: '', type: 'oidc', client_id: '', client_secret: '', issuer_url: '' });
      setShowForm(false);
      refresh();
    } catch { /* ignore */ }
  };

  const handleTest = async (id: string) => {
    try {
      await auth.testProvider(id);
      setTestResult({ id, status: 'success' });
    } catch {
      setTestResult({ id, status: 'failed' });
    }
    setTimeout(() => setTestResult(null), 3000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this authentication provider?')) return;
    await auth.deleteProvider(id);
    refresh();
  };

  if (loading && !providers) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Access Control</h1>
          <p className="text-sm text-slate-400 mt-1">System authentication uses PAM. Configure external identity providers below.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={refresh}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Add Provider
          </button>
        </div>
      </div>

      {/* PAM info */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-green-500/20">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">PAM Authentication</h3>
            <p className="text-xs text-slate-400">Active — users authenticate with system credentials</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-500" /> Enabled
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-xs">
          <div className="bg-slate-900/50 rounded-lg p-3">
            <div className="text-slate-500 mb-1">Service</div>
            <div className="text-white font-medium">login</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-3">
            <div className="text-slate-500 mb-1">Admin Groups</div>
            <div className="text-white font-medium">wheel, sudo, adm</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-3">
            <div className="text-slate-500 mb-1">Token Expiry</div>
            <div className="text-white font-medium">24 hours</div>
          </div>
        </div>
      </div>

      {/* Add Provider Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 space-y-4">
          <h3 className="text-base font-semibold text-white">Add External Auth Provider</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="Provider name" required
              className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}
              className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
              <option value="oidc">OIDC</option>
              <option value="ldap">LDAP</option>
              <option value="saml">SAML</option>
            </select>
            <input value={formData.issuer_url} onChange={e => setFormData({ ...formData, issuer_url: e.target.value })}
              placeholder="Issuer URL / Server URL" required
              className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            <input value={formData.client_id} onChange={e => setFormData({ ...formData, client_id: e.target.value })}
              placeholder="Client ID"
              className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            <input value={formData.client_secret} onChange={e => setFormData({ ...formData, client_secret: e.target.value })}
              placeholder="Client Secret" type="password"
              className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Create</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {/* Providers Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Users className="w-4 h-4 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-white">External Identity Providers</h2>
          <span className="ml-auto text-xs font-medium text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">{items.length}</span>
        </div>
        {items.length === 0 ? (
          <div className="p-10 text-center">
            <Shield className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No external auth providers configured</p>
            <p className="text-xs text-slate-600 mt-1">PAM is the primary authentication method</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Issuer</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {items.map((p, i) => (
                  <tr key={p.id || i} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-white">{p.name || `provider-${i}`}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">{p.type || 'oidc'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs font-mono truncate max-w-[200px]">{p.issuer_url || '-'}</td>
                    <td className="px-4 py-3">
                      {testResult && testResult.id === p.id ? (
                        <span className={`text-xs ${testResult.status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                          {testResult.status === 'success' ? 'Connected' : 'Failed'}
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 text-xs ${p.enabled !== false ? 'text-green-400' : 'text-slate-500'}`}>
                          <span className={`w-2 h-2 rounded-full ${p.enabled !== false ? 'bg-green-500' : 'bg-slate-500'}`} />
                          {p.enabled !== false ? 'Active' : 'Disabled'}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right flex items-center justify-end gap-2">
                      <button onClick={() => p.id && handleTest(p.id)}
                        className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors" title="Test connection">
                        <TestTube2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => p.id && handleDelete(p.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 transition-colors" title="Remove">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
