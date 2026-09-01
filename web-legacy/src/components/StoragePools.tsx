// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import { Database, Plus, Trash2, Activity } from 'lucide-react';
import { storageApi } from '../utils/api';
import { formatBytes, getStatusBadgeClasses } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { StoragePool } from '../types';

export default function StoragePools() {
  const [showCreate, setShowCreate] = useState(false);
  const [poolType, setPoolType] = useState('local');
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [nfsHost, setNfsHost] = useState('');
  const [nfsPath, setNfsPath] = useState('');
  const [vgName, setVgName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchPools = useCallback(() => storageApi.listPools() as Promise<StoragePool[]>, []);
  const { data: pools, loading, refresh } = usePolling<StoragePool[]>(fetchPools, 15000);
  const poolList = (pools || []) as StoragePool[];

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      switch (poolType) {
        case 'local': await storageApi.createLocalPool({ name, path }); break;
        case 'nfs': await storageApi.createNfsPool({ name, host: nfsHost, path: nfsPath }); break;
        case 'lvm': await storageApi.createLvmPool({ name, vg_name: vgName }); break;
        case 'lvm-thin': await storageApi.createLvmThinPool({ name, vg_name: vgName }); break;
        case 'zfs': await storageApi.createZfsPool({ name, pool: path }); break;
        case 'ceph': await storageApi.createCephPool({ name, pool: path }); break;
      }
      setName(''); setPath(''); setShowCreate(false); refresh();
    } catch (err) { console.error('Create pool failed:', err); }
    finally { setCreating(false); }
  };

  const handleDelete = async (poolName: string) => {
    if (!confirm(`Delete pool "${poolName}"?`)) return;
    try { await storageApi.deletePool(poolName); refresh(); }
    catch (err) { console.error('Delete failed:', err); }
  };

  const handleToggle = async (pool: StoragePool) => {
    try {
      pool.state === 'active' ? await storageApi.stopPool(pool.name) : await storageApi.startPool(pool.name);
      refresh();
    } catch (err) { console.error('Toggle failed:', err); }
  };

  const pct = (p: StoragePool) => p.capacity > 0 ? Math.round((p.allocation / p.capacity) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white">Storage Pools</h1><p className="text-sm text-slate-400 mt-1">Dedicated storage pool management</p></div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <Plus className="w-4 h-4" />New Pool
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 space-y-4">
          <h3 className="text-sm font-semibold text-white">Create Pool</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-xs text-slate-400 mb-1">Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="my-pool"
                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Type</label>
              <select value={poolType} onChange={e => setPoolType(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500">
                <option value="local">Local Directory</option><option value="nfs">NFS</option><option value="lvm">LVM</option>
                <option value="lvm-thin">LVM Thin</option><option value="zfs">ZFS</option><option value="ceph">Ceph</option>
              </select></div>
            {(poolType === 'local' || poolType === 'zfs' || poolType === 'ceph') && (
              <div><label className="block text-xs text-slate-400 mb-1">{poolType === 'local' ? 'Path' : 'Pool Name'}</label>
                <input value={path} onChange={e => setPath(e.target.value)} placeholder={poolType === 'local' ? '/var/lib/vmspawn/pools/...' : 'pool-name'}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" /></div>
            )}
            {poolType === 'nfs' && (<>
              <div><label className="block text-xs text-slate-400 mb-1">NFS Host</label>
                <input value={nfsHost} onChange={e => setNfsHost(e.target.value)} placeholder="192.168.1.100"
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-xs text-slate-400 mb-1">NFS Path</label>
                <input value={nfsPath} onChange={e => setNfsPath(e.target.value)} placeholder="/exports/vms"
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" /></div>
            </>)}
            {(poolType === 'lvm' || poolType === 'lvm-thin') && (
              <div><label className="block text-xs text-slate-400 mb-1">Volume Group</label>
                <input value={vgName} onChange={e => setVgName(e.target.value)} placeholder="vg0"
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" /></div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={handleCreate} disabled={creating || !name.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
              <Plus className="w-4 h-4" />{creating ? 'Creating...' : 'Create'}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white text-sm font-medium rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Pool list */}
      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : poolList.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          <Database className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>No storage pools</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {poolList.map(pool => {
            const p = pct(pool);
            return (
              <div key={pool.name} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">{pool.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(pool.state)}`}>{pool.state}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400">{pool.type}</span>
                  </div>
                </div>
                {pool.path && <p className="text-xs text-slate-500 font-mono mb-3">{pool.path}</p>}
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-xs text-slate-400"><span>Usage</span><span>{p}%</span></div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div className={`h-2 rounded-full ${p > 90 ? 'bg-red-500' : p > 70 ? 'bg-yellow-500' : 'bg-blue-500'}`} style={{ width: `${p}%` }} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div><span className="text-slate-500">Used</span><p className="text-white">{formatBytes(pool.allocation)}</p></div>
                    <div><span className="text-slate-500">Available</span><p className="text-white">{formatBytes(pool.available)}</p></div>
                    <div><span className="text-slate-500">Total</span><p className="text-white">{formatBytes(pool.capacity)}</p></div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleToggle(pool)}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg flex items-center gap-1">
                    <Activity className="w-3 h-3" />{pool.state === 'active' ? 'Stop' : 'Start'}
                  </button>
                  <button onClick={() => handleDelete(pool.name)}
                    className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs rounded-lg flex items-center gap-1">
                    <Trash2 className="w-3 h-3" />Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
