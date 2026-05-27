// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback } from 'react';
import { Gauge, Plus, Trash2 } from 'lucide-react';
import { quotaApi } from '../utils/api';
import { formatMemory } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { Quota } from '../types';

export default function Quotas() {
  const [name, setName] = useState('');
  const [maxVMs, setMaxVMs] = useState('10');
  const [maxCPUs, setMaxCPUs] = useState('32');
  const [maxMem, setMaxMem] = useState('65536');
  const [maxStorage, setMaxStorage] = useState('1000');
  const [creating, setCreating] = useState(false);

  const fetchQuotas = useCallback(() => quotaApi.list() as Promise<Quota[]>, []);
  const { data: quotas, loading, refresh } = usePolling<Quota[]>(fetchQuotas, 15000);
  const quotaList = (quotas || []) as Quota[];

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await quotaApi.create({ name, max_vms: +maxVMs, max_cpus: +maxCPUs, max_memory: +maxMem, max_storage: +maxStorage, enabled: true });
      setName(''); refresh();
    } catch (err) { console.error('Create failed:', err); }
    finally { setCreating(false); }
  };

  const handleToggle = async (q: Quota) => {
    try { q.enabled ? await quotaApi.disable(q.id) : await quotaApi.enable(q.id); refresh(); }
    catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this quota?')) return;
    try { await quotaApi.delete(id); refresh(); } catch (err) { console.error(err); }
  };

  const usageBar = (used: number, max: number) => {
    const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
    const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-blue-500';
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-700 rounded-full h-1.5"><div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} /></div>
        <span className="text-xs text-slate-400 w-12 text-right">{used}/{max}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Quotas</h1><p className="text-sm text-slate-400 mt-1">Resource quotas and usage limits</p></div>

      {/* Create */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-semibold text-white mb-3">New Quota</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div><label className="block text-xs text-slate-400 mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="team-dev"
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Max VMs</label>
            <input type="number" value={maxVMs} onChange={e => setMaxVMs(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Max CPUs</label>
            <input type="number" value={maxCPUs} onChange={e => setMaxCPUs(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Max Memory (MB)</label>
            <input type="number" value={maxMem} onChange={e => setMaxMem(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Max Storage (GB)</label>
            <input type="number" value={maxStorage} onChange={e => setMaxStorage(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" /></div>
        </div>
        <button onClick={handleCreate} disabled={creating || !name.trim()}
          className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
          <Plus className="w-4 h-4" />{creating ? 'Creating...' : 'Create'}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : quotaList.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500"><Gauge className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>No quotas configured</p></div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full"><thead><tr className="border-b border-slate-700/50">
            {['Name', 'VMs', 'CPUs', 'Memory', 'Storage', 'Enabled', 'Actions'].map(h =>
              <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-700/30">
            {quotaList.map(q => (
              <tr key={q.id} className="hover:bg-slate-700/20">
                <td className="px-4 py-3 text-sm text-white font-medium">{q.name}</td>
                <td className="px-4 py-3 text-sm w-32">{usageBar(q.usage?.vms ?? 0, q.max_vms)}</td>
                <td className="px-4 py-3 text-sm w-32">{usageBar(q.usage?.cpus ?? 0, q.max_cpus)}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{formatMemory(q.max_memory)}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{q.max_storage} GB</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleToggle(q)} className={`relative w-10 h-5 rounded-full transition-colors ${q.enabled ? 'bg-blue-600' : 'bg-slate-600'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${q.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(q.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}
