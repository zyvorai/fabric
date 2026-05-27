// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback } from 'react';
import { HardDrive, Plus, Trash2, ChevronRight, Database } from 'lucide-react';
import { storageApi } from '../utils/api';
import { StoragePool, Volume } from '../types';
import { formatBytes } from '../utils/format';
import { getStatusBadgeClasses } from '../utils/format';
import { usePolling } from '../hooks/usePolling';

const inputCls = 'bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none w-full';
const btnPrimary = 'bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors';
const btnDanger = 'bg-red-600 hover:bg-red-500 text-white rounded-lg px-2 py-1.5 text-xs font-medium transition-colors';
const thCls = 'text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider';

export default function Storage() {
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [createType, setCreateType] = useState<'local' | 'nfs'>('local');
  const [showCreatePool, setShowCreatePool] = useState(false);
  const [showCreateVolume, setShowCreateVolume] = useState(false);

  const { data: pools, refresh: refreshPools } = usePolling<StoragePool[]>(
    useCallback(() => storageApi.listPools() as Promise<StoragePool[]>, []), 15000
  );

  const { data: volumes, refresh: refreshVolumes } = usePolling<Volume[]>(
    useCallback(() => selectedPool ? storageApi.listVolumes(selectedPool) as Promise<Volume[]> : Promise.resolve([]), [selectedPool]),
    15000,
    !!selectedPool
  );

  // Pool forms
  const [localForm, setLocalForm] = useState({ name: '', path: '' });
  const [nfsForm, setNfsForm] = useState({ name: '', host: '', path: '' });

  const createPool = async () => {
    if (createType === 'local') {
      if (!localForm.name || !localForm.path) return;
      await storageApi.createLocalPool(localForm);
      setLocalForm({ name: '', path: '' });
    } else {
      if (!nfsForm.name || !nfsForm.host || !nfsForm.path) return;
      await storageApi.createNfsPool(nfsForm);
      setNfsForm({ name: '', host: '', path: '' });
    }
    setShowCreatePool(false);
    refreshPools();
  };

  const deletePool = async (name: string) => {
    await storageApi.deletePool(name);
    if (selectedPool === name) setSelectedPool(null);
    refreshPools();
  };

  // Volume form
  const [volForm, setVolForm] = useState({ name: '', capacity: '', format: 'qcow2' });

  const createVolume = async () => {
    if (!selectedPool || !volForm.name || !volForm.capacity) return;
    await storageApi.createVolume(selectedPool, {
      name: volForm.name,
      capacity: parseInt(volForm.capacity) * 1024 * 1024 * 1024, // GB to bytes
      format: volForm.format,
    });
    setVolForm({ name: '', capacity: '', format: 'qcow2' });
    setShowCreateVolume(false);
    refreshVolumes();
  };

  const deleteVolume = async (id: string) => {
    if (!selectedPool) return;
    await storageApi.deleteVolume(selectedPool, id);
    refreshVolumes();
  };

  const capacityPct = (pool: StoragePool) => pool.capacity > 0 ? Math.round((pool.allocation / pool.capacity) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <HardDrive className="w-7 h-7 text-blue-400" />
            Storage
          </h1>
          <p className="text-sm text-slate-400 mt-1">Manage storage pools and volumes</p>
        </div>
        <button onClick={() => setShowCreatePool(!showCreatePool)} className={btnPrimary}>
          <Plus className="w-4 h-4 inline mr-1" />Create Pool
        </button>
      </div>

      {/* Create Pool Form */}
      {showCreatePool && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-sm font-semibold text-white mb-3">Create Storage Pool</h3>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setCreateType('local')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${createType === 'local' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'}`}
            >Local</button>
            <button
              onClick={() => setCreateType('nfs')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${createType === 'nfs' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'}`}
            >NFS</button>
          </div>
          {createType === 'local' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input className={inputCls} placeholder="Pool name" value={localForm.name} onChange={e => setLocalForm({ ...localForm, name: e.target.value })} />
              <input className={inputCls} placeholder="Path (e.g. /var/lib/vmspawn/pools/my-pool)" value={localForm.path} onChange={e => setLocalForm({ ...localForm, path: e.target.value })} />
              <button onClick={createPool} className={btnPrimary}>Create</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input className={inputCls} placeholder="Pool name" value={nfsForm.name} onChange={e => setNfsForm({ ...nfsForm, name: e.target.value })} />
              <input className={inputCls} placeholder="NFS host" value={nfsForm.host} onChange={e => setNfsForm({ ...nfsForm, host: e.target.value })} />
              <input className={inputCls} placeholder="Export path" value={nfsForm.path} onChange={e => setNfsForm({ ...nfsForm, path: e.target.value })} />
              <button onClick={createPool} className={btnPrimary}>Create</button>
            </div>
          )}
        </div>
      )}

      {/* Pool Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(pools || []).length === 0 ? (
          <div className="col-span-full bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
            <Database className="w-10 h-10 mx-auto mb-3 text-slate-600" />
            No storage pools configured
          </div>
        ) : (pools || []).map(pool => (
          <div
            key={pool.name}
            onClick={() => setSelectedPool(pool.name)}
            className={`bg-slate-800/50 rounded-xl p-5 border transition-all cursor-pointer hover:border-blue-500/50 ${
              selectedPool === pool.name ? 'border-blue-500' : 'border-slate-700/50'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-blue-400" />
                <span className="font-medium text-white">{pool.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(pool.state)}`}>
                  {pool.state}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); deletePool(pool.name); }}
                  className={btnDanger}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="text-xs text-slate-400 mb-2">Type: <span className="text-slate-300">{pool.type}</span></div>
            <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
              <div
                className={`h-2 rounded-full transition-all ${capacityPct(pool) > 90 ? 'bg-red-500' : capacityPct(pool) > 70 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                style={{ width: `${capacityPct(pool)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>{formatBytes(pool.allocation)} used</span>
              <span>{formatBytes(pool.capacity)} total</span>
            </div>
          </div>
        ))}
      </div>

      {/* Volumes for selected pool */}
      {selectedPool && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <ChevronRight className="w-5 h-5 text-slate-400" />
              Volumes in <span className="text-blue-400">{selectedPool}</span>
            </h2>
            <button onClick={() => setShowCreateVolume(!showCreateVolume)} className={btnPrimary}>
              <Plus className="w-4 h-4 inline mr-1" />Create Volume
            </button>
          </div>

          {showCreateVolume && (
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <h3 className="text-sm font-semibold text-white mb-3">Create Volume</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input className={inputCls} placeholder="Volume name" value={volForm.name} onChange={e => setVolForm({ ...volForm, name: e.target.value })} />
                <input className={inputCls} placeholder="Capacity (GB)" type="number" value={volForm.capacity} onChange={e => setVolForm({ ...volForm, capacity: e.target.value })} />
                <select className={inputCls} value={volForm.format} onChange={e => setVolForm({ ...volForm, format: e.target.value })}>
                  <option value="qcow2">qcow2</option>
                  <option value="raw">raw</option>
                  <option value="vmdk">vmdk</option>
                </select>
                <button onClick={createVolume} className={btnPrimary}>Create</button>
              </div>
            </div>
          )}

          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700/50">
                <th className={thCls}>Name</th>
                <th className={thCls}>Format</th>
                <th className={thCls}>Capacity</th>
                <th className={thCls}>Allocation</th>
                <th className={thCls}>Path</th>
                <th className={thCls}>Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {(volumes || []).length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No volumes in this pool</td></tr>
                ) : (volumes || []).map(v => (
                  <tr key={v.name} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{v.name}</td>
                    <td className="px-4 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">{v.format}</span></td>
                    <td className="px-4 py-3 text-slate-400 tabular-nums">{formatBytes(v.capacity)}</td>
                    <td className="px-4 py-3 text-slate-400 tabular-nums">{formatBytes(v.allocation)}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs truncate max-w-xs">{v.path}</td>
                    <td className="px-4 py-3"><button onClick={() => deleteVolume(v.name)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
