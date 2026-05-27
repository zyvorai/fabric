// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback } from 'react';
import { distributedStorageApi } from '../utils/api';
import { formatBytes } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { DistributedStoragePool, StoragePolicy } from '../types';

export default function DistributedStorage() {
  const [poolName, setPoolName] = useState('');
  const [poolType, setPoolType] = useState('distributed');
  const [polName, setPolName] = useState('');
  const [polRepFactor, setPolRepFactor] = useState(2);
  const [polTier, setPolTier] = useState('standard');
  const [polEncrypt, setPolEncrypt] = useState(false);
  const [clusterName, setClusterName] = useState('');
  const [migSource, setMigSource] = useState('');
  const [migDest, setMigDest] = useState('');

  const fetchPools = useCallback(() => distributedStorageApi.listPools() as Promise<DistributedStoragePool[]>, []);
  const fetchMigrations = useCallback(() => distributedStorageApi.listMigrations(), []);
  const fetchPolicies = useCallback(() => distributedStorageApi.listPolicies() as Promise<StoragePolicy[]>, []);
  const fetchClusters = useCallback(() => distributedStorageApi.listDatastoreClusters(), []);

  const { data: poolsData, refresh: refreshPools } = usePolling<DistributedStoragePool[]>(fetchPools, 10000);
  const { data: migsData, refresh: refreshMigs } = usePolling<unknown[]>(fetchMigrations, 10000);
  const { data: polsData, refresh: refreshPolicies } = usePolling<StoragePolicy[]>(fetchPolicies, 15000);
  const { data: clustersData, refresh: refreshClusters } = usePolling<unknown[]>(fetchClusters, 15000);

  const pools = (poolsData || []) as DistributedStoragePool[];
  const migrations = (migsData || []) as { id: string; source_pool: string; target_pool: string; status: string; progress: number }[];
  const policies = (polsData || []) as StoragePolicy[];
  const dsClusters = (clustersData || []) as { id: string; name: string; datastores: string[] }[];

  const handleCreatePool = async () => {
    if (!poolName.trim()) return;
    try { await distributedStorageApi.createPool({ name: poolName, type: poolType }); setPoolName(''); refreshPools(); }
    catch (err) { console.error('Failed to create pool:', err); }
  };

  const handleDeletePool = async (id: string) => {
    if (!confirm('Delete this pool?')) return;
    try { await distributedStorageApi.deletePool(id); refreshPools(); }
    catch (err) { console.error('Failed to delete pool:', err); }
  };

  const handleStartMigration = async () => {
    if (!migSource.trim() || !migDest.trim()) return;
    try { await distributedStorageApi.startMigration({ source_pool: migSource, target_pool: migDest }); setMigSource(''); setMigDest(''); refreshMigs(); }
    catch (err) { console.error('Failed to start migration:', err); }
  };

  const handleCancelMigration = async (id: string) => {
    try { await distributedStorageApi.cancelMigration(id); refreshMigs(); }
    catch (err) { console.error('Failed to cancel migration:', err); }
  };

  const handleCreatePolicy = async () => {
    if (!polName.trim()) return;
    try { await distributedStorageApi.createPolicy({ name: polName, replication_factor: polRepFactor, tier: polTier, encryption: polEncrypt }); setPolName(''); refreshPolicies(); }
    catch (err) { console.error('Failed to create policy:', err); }
  };

  const handleDeletePolicy = async (id: string) => {
    if (!confirm('Delete this policy?')) return;
    try { await distributedStorageApi.deletePolicy(id); refreshPolicies(); }
    catch (err) { console.error('Failed to delete policy:', err); }
  };

  const handleCreateCluster = async () => {
    if (!clusterName.trim()) return;
    try { await distributedStorageApi.createDatastoreCluster({ name: clusterName }); setClusterName(''); refreshClusters(); }
    catch (err) { console.error('Failed to create cluster:', err); }
  };

  const handleDeleteCluster = async (id: string) => {
    if (!confirm('Delete this datastore cluster?')) return;
    try { await distributedStorageApi.deleteDatastoreCluster(id); refreshClusters(); }
    catch (err) { console.error('Failed to delete cluster:', err); }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      healthy: 'bg-green-500/20 text-green-400', active: 'bg-green-500/20 text-green-400',
      completed: 'bg-green-500/20 text-green-400', running: 'bg-blue-500/20 text-blue-400',
      degraded: 'bg-yellow-500/20 text-yellow-400', failed: 'bg-red-500/20 text-red-400',
    };
    return colors[status] || 'bg-slate-500/20 text-slate-400';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Distributed Storage</h2>
        <p className="text-sm text-slate-400 mt-1">Storage pools, migrations, policies, and datastore clusters</p>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Create Pool</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input value={poolName} onChange={e => setPoolName(e.target.value)} placeholder="Pool name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <select value={poolType} onChange={e => setPoolType(e.target.value)} className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500">
            <option value="distributed">Distributed</option><option value="replicated">Replicated</option><option value="erasure">Erasure Coded</option>
          </select>
        </div>
        <button onClick={handleCreatePool} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Create</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Storage Pools</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400"><tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Capacity</th><th className="px-5 py-3">Used</th><th className="px-5 py-3">Hosts</th><th className="px-5 py-3">State</th><th className="px-5 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-700/50">
            {pools.map(p => (
              <tr key={p.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white font-medium">{p.name}</td>
                <td className="px-5 py-3">{p.type}</td>
                <td className="px-5 py-3">{formatBytes(p.total_capacity)}</td>
                <td className="px-5 py-3">{formatBytes(p.used_capacity)}</td>
                <td className="px-5 py-3">{p.hosts.length}</td>
                <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(p.state)}`}>{p.state}</span></td>
                <td className="px-5 py-3"><button onClick={() => handleDeletePool(p.id)} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Delete</button></td>
              </tr>
            ))}
            {pools.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">No pools</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Start Storage Migration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input value={migSource} onChange={e => setMigSource(e.target.value)} placeholder="Source pool ID" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={migDest} onChange={e => setMigDest(e.target.value)} placeholder="Target pool ID" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={handleStartMigration} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Start Migration</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Storage Migrations</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400"><tr><th className="px-5 py-3">Source</th><th className="px-5 py-3">Target</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Progress</th><th className="px-5 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-700/50">
            {migrations.map(m => (
              <tr key={m.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 font-mono text-xs">{m.source_pool}</td>
                <td className="px-5 py-3 font-mono text-xs">{m.target_pool}</td>
                <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(m.status)}`}>{m.status}</span></td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${m.progress}%` }} /></div>
                    <span className="text-xs">{m.progress}%</span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  {m.status === 'running' && <button onClick={() => handleCancelMigration(m.id)} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Cancel</button>}
                </td>
              </tr>
            ))}
            {migrations.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No migrations</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Create Policy</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input value={polName} onChange={e => setPolName(e.target.value)} placeholder="Policy name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input type="number" min={1} max={5} value={polRepFactor} onChange={e => setPolRepFactor(Number(e.target.value))} placeholder="Replication factor" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <select value={polTier} onChange={e => setPolTier(e.target.value)} className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500">
            <option value="standard">Standard</option><option value="performance">Performance</option><option value="archive">Archive</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input type="checkbox" checked={polEncrypt} onChange={e => setPolEncrypt(e.target.checked)} className="rounded border-slate-600" />
            Encryption
          </label>
        </div>
        <button onClick={handleCreatePolicy} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Create Policy</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Policies</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400"><tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Replication</th><th className="px-5 py-3">Tier</th><th className="px-5 py-3">Encrypted</th><th className="px-5 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-700/50">
            {policies.map(p => (
              <tr key={p.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white font-medium">{p.name}</td>
                <td className="px-5 py-3">{p.replication_factor}x</td>
                <td className="px-5 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">{p.tier}</span></td>
                <td className="px-5 py-3">{p.encryption ? 'Yes' : 'No'}</td>
                <td className="px-5 py-3"><button onClick={() => handleDeletePolicy(p.id)} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Delete</button></td>
              </tr>
            ))}
            {policies.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No policies</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Datastore Clusters</h3>
          <div className="flex gap-2">
            <input value={clusterName} onChange={e => setClusterName(e.target.value)} placeholder="Cluster name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
            <button onClick={handleCreateCluster} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg">Create</button>
          </div>
        </div>
        <div className="space-y-2">
          {dsClusters.map(c => (
            <div key={c.id} className="flex items-center justify-between p-3 bg-slate-900/30 rounded-lg">
              <div>
                <span className="text-white text-sm font-medium">{c.name}</span>
                <span className="text-slate-500 text-xs ml-3">{c.datastores?.length || 0} datastores</span>
              </div>
              <button onClick={() => handleDeleteCluster(c.id)} className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Delete</button>
            </div>
          ))}
          {dsClusters.length === 0 && <p className="text-center text-slate-500 text-sm py-4">No datastore clusters</p>}
        </div>
      </div>
    </div>
  );
}
