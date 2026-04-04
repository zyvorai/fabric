import { useState, useCallback } from 'react';
import { migrationApi } from '../utils/api';
import { formatDateTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { Migration } from '../types';

export default function Migrations() {
  const [vmName, setVmName] = useState('');
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');

  const fetchMigrations = useCallback(() => migrationApi.list() as Promise<Migration[]>, []);
  const { data, loading, refresh } = usePolling<Migration[]>(fetchMigrations, 5000);
  const migrations = (data || []) as Migration[];

  const handleStart = async () => {
    if (!vmName.trim() || !destination.trim()) return;
    try {
      await migrationApi.start({ vm_name: vmName, source, destination });
      setVmName(''); setSource(''); setDestination('');
      refresh();
    } catch (err) { console.error('Failed to start migration:', err); }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this migration?')) return;
    try { await migrationApi.cancel(id); refresh(); }
    catch (err) { console.error('Failed to cancel migration:', err); }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      running: 'bg-blue-500/20 text-blue-400',
      completed: 'bg-green-500/20 text-green-400',
      failed: 'bg-red-500/20 text-red-400',
      cancelled: 'bg-yellow-500/20 text-yellow-400',
    };
    return colors[status] || 'bg-slate-500/20 text-slate-400';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Migrations</h2>
        <p className="text-sm text-slate-400 mt-1">Manage VM migrations between hosts</p>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Start Migration</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input value={vmName} onChange={e => setVmName(e.target.value)} placeholder="VM name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={source} onChange={e => setSource(e.target.value)} placeholder="Source host" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="Destination host" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={handleStart} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Start Migration</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50">
          <h3 className="text-lg font-semibold text-white">Active Migrations</h3>
        </div>
        {loading && migrations.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-500">Loading...</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-900/50 text-slate-400">
              <tr>
                <th className="px-5 py-3">VM</th><th className="px-5 py-3">Source</th><th className="px-5 py-3">Destination</th>
                <th className="px-5 py-3">Status</th><th className="px-5 py-3">Progress</th><th className="px-5 py-3">Started</th><th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {migrations.map(m => (
                <tr key={m.id} className="text-slate-300 hover:bg-slate-700/30">
                  <td className="px-5 py-3 text-white font-medium">{m.vm_name}</td>
                  <td className="px-5 py-3">{m.source}</td>
                  <td className="px-5 py-3">{m.destination}</td>
                  <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(m.status)}`}>{m.status}</span></td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${m.progress}%` }} />
                      </div>
                      <span className="text-xs text-slate-400">{m.progress}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs">{formatDateTime(m.started_at)}</td>
                  <td className="px-5 py-3">
                    {m.status === 'running' && (
                      <button onClick={() => handleCancel(m.id)} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
              {migrations.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">No migrations</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
