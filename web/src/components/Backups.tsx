// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback } from 'react';
import { Archive, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { vmApi, backupApi } from '../utils/api';
import { formatBytes, formatDateTime, getStatusBadgeClasses } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { VM, Backup } from '../types';

export default function Backups() {
  const [vmName, setVmName] = useState('');
  const [backupType, setBackupType] = useState('full');
  const [creating, setCreating] = useState(false);

  const fetchVMs = useCallback(() => vmApi.list(), []);
  const fetchBackups = useCallback(() => backupApi.list() as Promise<Backup[]>, []);
  const fetchStats = useCallback(() => backupApi.getStats() as Promise<Record<string, unknown>>, []);

  const { data: vmData } = usePolling<{ items: unknown[]; total: number }>(fetchVMs, 15000);
  const { data: backups, loading, refresh } = usePolling<Backup[]>(fetchBackups, 10000);
  const { data: stats } = usePolling<Record<string, unknown>>(fetchStats, 30000);

  const vms = (vmData?.items || []) as VM[];
  const backupList = (backups || []) as Backup[];

  const handleCreate = async () => {
    if (!vmName) return;
    setCreating(true);
    try {
      await backupApi.create({ vm_name: vmName, type: backupType });
      setVmName('');
      refresh();
    } catch (err) { console.error('Backup create failed:', err); }
    finally { setCreating(false); }
  };

  const handleRestore = async (id: string) => {
    if (!confirm('Restore this backup? The VM will be stopped.')) return;
    try { await backupApi.restore({ backup_id: id }); refresh(); }
    catch (err) { console.error('Restore failed:', err); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this backup?')) return;
    try { await backupApi.delete(id); refresh(); }
    catch (err) { console.error('Delete failed:', err); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Backups</h1>
        <p className="text-sm text-slate-400 mt-1">Create, restore, and manage VM backups</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[['Total', (stats as any).total ?? backupList.length], ['Completed', (stats as any).completed ?? 0],
            ['Total Size', formatBytes((stats as any).total_size ?? 0)], ['Failed', (stats as any).failed ?? 0]].map(([l, v]) => (
            <div key={String(l)} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <p className="text-xs text-slate-500 uppercase">{String(l)}</p>
              <p className="text-xl font-bold text-white mt-1">{String(v)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Create */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-semibold text-white mb-3">Create Backup</h3>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-slate-400 mb-1">VM</label>
            <select value={vmName} onChange={e => setVmName(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500">
              <option value="">Select VM...</option>
              {vms.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
          </div>
          <div className="min-w-[120px]">
            <label className="block text-xs text-slate-400 mb-1">Type</label>
            <select value={backupType} onChange={e => setBackupType(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500">
              <option value="full">Full</option><option value="incremental">Incremental</option>
            </select>
          </div>
          <button onClick={handleCreate} disabled={creating || !vmName}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
            <Plus className="w-4 h-4" />{creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : backupList.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          <Archive className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>No backups yet</p>
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-slate-700/50">
              {['VM', 'Status', 'Size', 'Created', 'Type', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-slate-700/30">
              {backupList.map(b => (
                <tr key={b.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-3 text-sm text-white font-medium">{b.vm_name}</td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(b.status)}`}>{b.status}</span></td>
                  <td className="px-4 py-3 text-sm text-slate-300">{formatBytes(b.size)}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{formatDateTime(b.created_at)}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{b.type}</td>
                  <td className="px-4 py-3"><div className="flex gap-1">
                    <button onClick={() => handleRestore(b.id)} className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400" title="Restore"><RotateCcw className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(b.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
