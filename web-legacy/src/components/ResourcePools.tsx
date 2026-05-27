// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback } from 'react';
import { resourcePoolApi } from '../utils/api';
import { formatMemory } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { ResourcePool } from '../types';

export default function ResourcePools() {
  const [poolName, setPoolName] = useState('');
  const [cpuLimit, setCpuLimit] = useState('');
  const [memLimit, setMemLimit] = useState('');
  const [cpuReserve, setCpuReserve] = useState('');
  const [memReserve, setMemReserve] = useState('');
  const [assignPoolId, setAssignPoolId] = useState('');
  const [assignVmName, setAssignVmName] = useState('');
  const [admPoolId, setAdmPoolId] = useState('');
  const [admCpus, setAdmCpus] = useState('');
  const [admMemory, setAdmMemory] = useState('');
  const [admResult, setAdmResult] = useState<unknown>(null);

  const fetchPools = useCallback(() => resourcePoolApi.list() as Promise<ResourcePool[]>, []);
  const { data, loading, refresh } = usePolling<ResourcePool[]>(fetchPools, 10000);
  const pools = (data || []) as ResourcePool[];

  const handleCreatePool = async () => {
    if (!poolName.trim()) return;
    try {
      await resourcePoolApi.create({
        name: poolName, cpu_limit: Number(cpuLimit) || 0, memory_limit: Number(memLimit) || 0,
        cpu_reservation: Number(cpuReserve) || 0, memory_reservation: Number(memReserve) || 0,
      });
      setPoolName(''); setCpuLimit(''); setMemLimit(''); setCpuReserve(''); setMemReserve('');
      refresh();
    } catch (err) { console.error('Failed to create pool:', err); }
  };

  const handleDeletePool = async (id: string) => {
    if (!confirm('Delete this resource pool?')) return;
    try { await resourcePoolApi.delete(id); refresh(); }
    catch (err) { console.error('Failed to delete pool:', err); }
  };

  const handleAssignVm = async () => {
    if (!assignPoolId.trim() || !assignVmName.trim()) return;
    try { await resourcePoolApi.assignVm(assignPoolId, { vm_name: assignVmName }); setAssignVmName(''); refresh(); }
    catch (err) { console.error('Failed to assign VM:', err); }
  };

  const handleAdmissionCheck = async () => {
    if (!admPoolId.trim()) return;
    try {
      const result = await resourcePoolApi.checkAdmission(admPoolId, { cpus: Number(admCpus) || 1, memory: Number(admMemory) || 512 });
      setAdmResult(result);
    } catch (err) { console.error('Admission check failed:', err); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Resource Pools</h2>
        <p className="text-sm text-slate-400 mt-1">Manage resource pools, VM assignment, and admission control</p>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Create Pool</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input value={poolName} onChange={e => setPoolName(e.target.value)} placeholder="Pool name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input type="number" value={cpuLimit} onChange={e => setCpuLimit(e.target.value)} placeholder="CPU limit (cores)" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input type="number" value={memLimit} onChange={e => setMemLimit(e.target.value)} placeholder="Memory limit (MB)" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input type="number" value={cpuReserve} onChange={e => setCpuReserve(e.target.value)} placeholder="CPU reservation" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input type="number" value={memReserve} onChange={e => setMemReserve(e.target.value)} placeholder="Memory reservation (MB)" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={handleCreatePool} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Create Pool</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Resource Pools</h3></div>
        {loading && pools.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-500">Loading...</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-900/50 text-slate-400">
              <tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">CPU Limit</th><th className="px-5 py-3">Memory Limit</th><th className="px-5 py-3">CPU Reserve</th><th className="px-5 py-3">Mem Reserve</th><th className="px-5 py-3">VMs</th><th className="px-5 py-3">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {pools.map(p => (
                <tr key={p.id} className="text-slate-300 hover:bg-slate-700/30">
                  <td className="px-5 py-3 text-white font-medium">{p.name}</td>
                  <td className="px-5 py-3">{p.cpu_limit} cores</td>
                  <td className="px-5 py-3">{formatMemory(p.memory_limit)}</td>
                  <td className="px-5 py-3">{p.cpu_reservation} cores</td>
                  <td className="px-5 py-3">{formatMemory(p.memory_reservation)}</td>
                  <td className="px-5 py-3">{p.vms.length}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => handleDeletePool(p.id)} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Delete</button>
                  </td>
                </tr>
              ))}
              {pools.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">No resource pools</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-lg font-semibold text-white mb-4">Assign VM to Pool</h3>
          <div className="space-y-3">
            <input value={assignPoolId} onChange={e => setAssignPoolId(e.target.value)} placeholder="Pool ID" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
            <input value={assignVmName} onChange={e => setAssignVmName(e.target.value)} placeholder="VM name" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
            <button onClick={handleAssignVm} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Assign</button>
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-lg font-semibold text-white mb-4">Admission Control Test</h3>
          <div className="space-y-3">
            <input value={admPoolId} onChange={e => setAdmPoolId(e.target.value)} placeholder="Pool ID" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
            <div className="grid grid-cols-2 gap-3">
              <input type="number" value={admCpus} onChange={e => setAdmCpus(e.target.value)} placeholder="CPUs" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
              <input type="number" value={admMemory} onChange={e => setAdmMemory(e.target.value)} placeholder="Memory (MB)" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={handleAdmissionCheck} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Check</button>
            {admResult !== null && (
              <pre className="text-xs text-slate-300 bg-slate-900/50 rounded-lg p-3 overflow-auto max-h-24">{JSON.stringify(admResult, null, 2)}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
