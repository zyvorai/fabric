// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback } from 'react';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import { vmApi, backupApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';
import type { VM, BackupPolicy } from '../types';

export default function BackupScheduler() {
  const [vmName, setVmName] = useState('');
  const [cron, setCron] = useState('0 2 * * *');
  const [retention, setRetention] = useState('7');
  const [format, setFormat] = useState('qcow2');
  const [compress, setCompress] = useState(true);
  const [policyName, setPolicyName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchVMs = useCallback(() => vmApi.list(), []);
  const fetchPolicies = useCallback(() => backupApi.listPolicies() as Promise<BackupPolicy[]>, []);

  const { data: vmData } = usePolling<{ items: unknown[]; total: number }>(fetchVMs, 15000);
  const { data: policies, loading, refresh } = usePolling<BackupPolicy[]>(fetchPolicies, 10000);

  const vms = (vmData?.items || []) as VM[];
  const policyList = (policies || []) as BackupPolicy[];

  const handleCreate = async () => {
    if (!policyName.trim() || !vmName) return;
    setCreating(true);
    try {
      await backupApi.createPolicy({ name: policyName, schedule: cron, retention: parseInt(retention), vms: [vmName], format, compress });
      setPolicyName(''); setVmName('');
      refresh();
    } catch (err) { console.error('Policy create failed:', err); }
    finally { setCreating(false); }
  };

  const handleToggle = async (p: BackupPolicy) => {
    try { p.enabled ? await backupApi.disablePolicy(p.id) : await backupApi.enablePolicy(p.id); refresh(); }
    catch (err) { console.error('Toggle failed:', err); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this policy?')) return;
    try { await backupApi.deletePolicy(id); refresh(); }
    catch (err) { console.error('Delete failed:', err); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Backup Scheduler</h1>
        <p className="text-sm text-slate-400 mt-1">Schedule automated backup policies for VMs</p>
      </div>

      {/* Create policy form */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 space-y-4">
        <h3 className="text-sm font-semibold text-white">New Schedule</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Policy Name</label>
            <input value={policyName} onChange={e => setPolicyName(e.target.value)} placeholder="daily-backup"
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">VM</label>
            <select value={vmName} onChange={e => setVmName(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500">
              <option value="">Select VM...</option>
              {vms.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Cron Expression</label>
            <input value={cron} onChange={e => setCron(e.target.value)} placeholder="0 2 * * *"
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Retention (days)</label>
            <input type="number" value={retention} onChange={e => setRetention(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Format</label>
            <select value={format} onChange={e => setFormat(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500">
              <option value="qcow2">qcow2</option><option value="raw">raw</option><option value="vmdk">vmdk</option>
            </select>
          </div>
          <div className="flex items-center gap-3 pt-5">
            <button onClick={() => setCompress(!compress)} className={`relative w-10 h-5 rounded-full transition-colors ${compress ? 'bg-blue-600' : 'bg-slate-600'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${compress ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-slate-300">Compression</span>
          </div>
        </div>
        <button onClick={handleCreate} disabled={creating || !policyName.trim() || !vmName}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
          <Plus className="w-4 h-4" />{creating ? 'Creating...' : 'Create Schedule'}
        </button>
      </div>

      {/* Policy table */}
      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : policyList.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>No backup schedules</p>
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-slate-700/50">
              {['Name', 'Schedule', 'Retention', 'VMs', 'Enabled', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-slate-700/30">
              {policyList.map(p => (
                <tr key={p.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-3 text-sm text-white font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-300 font-mono">{p.schedule}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{p.retention}d</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{p.vms?.join(', ') || '-'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleToggle(p)} className={`relative w-10 h-5 rounded-full transition-colors ${p.enabled ? 'bg-blue-600' : 'bg-slate-600'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${p.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
