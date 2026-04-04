import { useState, useCallback } from 'react';
import { Database, HardDrive, Trash2, Plus } from 'lucide-react';
import { storageApi } from '../utils/api';
import { formatBytes } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { StoragePool, Volume } from '../types';

export default function StorageManager() {
  const [selectedPool, setSelectedPool] = useState('');
  const [volName, setVolName] = useState('');
  const [volCapacity, setVolCapacity] = useState('10');
  const [volFormat, setVolFormat] = useState('qcow2');
  const [creating, setCreating] = useState(false);

  const fetchPools = useCallback(() => storageApi.listPools() as Promise<StoragePool[]>, []);
  const fetchVolumes = useCallback(
    () => (selectedPool ? storageApi.listVolumes(selectedPool) as Promise<Volume[]> : Promise.resolve([])), [selectedPool]);

  const { data: pools, loading: pLoad } = usePolling<StoragePool[]>(fetchPools, 15000);
  const { data: volumes, loading: vLoad, refresh: vRefresh } = usePolling<Volume[]>(fetchVolumes, 10000, !!selectedPool);

  const poolList = (pools || []) as StoragePool[];
  const volumeList = (volumes || []) as Volume[];

  const capacityPct = (pool: StoragePool) => pool.capacity > 0 ? Math.round((pool.allocation / pool.capacity) * 100) : 0;

  const handleCreateVol = async () => {
    if (!selectedPool || !volName.trim()) return;
    setCreating(true);
    try {
      await storageApi.createVolume(selectedPool, { name: volName, capacity: +volCapacity * 1073741824, format: volFormat });
      setVolName(''); vRefresh();
    } catch (err) { console.error('Create volume failed:', err); }
    finally { setCreating(false); }
  };

  const handleDeleteVol = async (id: string) => {
    if (!confirm('Delete this volume?')) return;
    try { await storageApi.deleteVolume(selectedPool, id); vRefresh(); }
    catch (err) { console.error('Delete failed:', err); }
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Storage Manager</h1><p className="text-sm text-slate-400 mt-1">Manage storage pools and volumes</p></div>

      {/* Pool cards */}
      {pLoad ? (
        <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : poolList.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          <Database className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>No storage pools</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {poolList.map(pool => {
            const pct = capacityPct(pool);
            const active = selectedPool === pool.name;
            return (
              <button key={pool.name} onClick={() => setSelectedPool(pool.name)}
                className={`bg-slate-800/50 rounded-xl p-5 border text-left transition-colors ${active ? 'border-blue-500' : 'border-slate-700/50 hover:border-slate-600'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">{pool.name}</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${pool.state === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}`}>{pool.state}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{pool.type}</span><span>{pct}% used</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{formatBytes(pool.allocation)} used</span><span>{formatBytes(pool.capacity)} total</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Volumes for selected pool */}
      {selectedPool && (
        <>
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-sm font-semibold text-white mb-3">Create Volume in "{selectedPool}"</h3>
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[150px]"><label className="block text-xs text-slate-400 mb-1">Name</label>
                <input value={volName} onChange={e => setVolName(e.target.value)} placeholder="volume-name"
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" /></div>
              <div className="w-24"><label className="block text-xs text-slate-400 mb-1">Size (GB)</label>
                <input type="number" value={volCapacity} onChange={e => setVolCapacity(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" /></div>
              <div className="w-28"><label className="block text-xs text-slate-400 mb-1">Format</label>
                <select value={volFormat} onChange={e => setVolFormat(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500">
                  <option value="qcow2">qcow2</option><option value="raw">raw</option>
                </select></div>
              <button onClick={handleCreateVol} disabled={creating || !volName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
                <Plus className="w-4 h-4" />{creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>

          {vLoad ? (
            <div className="flex items-center justify-center h-20"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : volumeList.length === 0 ? (
            <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500"><HardDrive className="w-10 h-10 mx-auto mb-2 opacity-50" /><p>No volumes</p></div>
          ) : (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <table className="w-full"><thead><tr className="border-b border-slate-700/50">
                {['Name', 'Path', 'Capacity', 'Allocated', 'Format', 'Actions'].map(h =>
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {volumeList.map(v => (
                  <tr key={v.name} className="hover:bg-slate-700/20">
                    <td className="px-4 py-3 text-sm text-white font-medium">{v.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 font-mono truncate max-w-xs">{v.path}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{formatBytes(v.capacity)}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{formatBytes(v.allocation)}</td>
                    <td className="px-4 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">{v.format}</span></td>
                    <td className="px-4 py-3"><button onClick={() => handleDeleteVol(v.name)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
