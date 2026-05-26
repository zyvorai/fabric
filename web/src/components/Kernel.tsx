// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback, useMemo } from 'react';
import { Search, Cpu, Server, Layers, HardDrive } from 'lucide-react';
import { systemApi } from '../utils/api';
import { CpuTopology, NumaTopology } from '../types';
import { usePolling } from '../hooks/usePolling';
import { formatBytes, getStatusBadgeClasses } from '../utils/format';

interface KernelInfo {
  version: string;
  hostname: string;
  architecture: string;
}

export default function Kernel() {
  const [search, setSearch] = useState('');
  const [kernelInfo, setKernelInfo] = useState<KernelInfo | null>(null);

  const fetchCpu = useCallback(async () => {
    const data = await systemApi.getCpuTopology() as CpuTopology;
    // Read kernel info from /proc via uname-style data exposed by the host
    // We do this once alongside CPU topology
    if (!kernelInfo) {
      try {
        const token = sessionStorage.getItem('vmspawnd_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/system/info', { headers });
        if (res.ok) {
          const info = await res.json();
          setKernelInfo({
            version: info.kernel_version || info.version || 'N/A',
            hostname: info.hostname || 'N/A',
            architecture: info.architecture || info.arch || 'N/A',
          });
        }
      } catch {
        // system/info may not exist; leave as N/A
      }
    }
    return data;
  }, [kernelInfo]);

  const { data: cpuData, loading: cpuLoading } = usePolling<CpuTopology>(fetchCpu, 15000);

  const fetchNuma = useCallback(
    () => systemApi.getNumaTopology() as Promise<NumaTopology>,
    []
  );
  const { data: numaData } = usePolling<NumaTopology>(fetchNuma, 15000);

  if (cpuLoading && !cpuData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const numaNodes = numaData?.nodes || [];

  const statCards = [
    { label: 'Kernel Version', value: kernelInfo?.version || 'N/A', icon: Layers, color: 'text-purple-400' },
    { label: 'Hostname', value: kernelInfo?.hostname || 'N/A', icon: Server, color: 'text-blue-400' },
    { label: 'Architecture', value: kernelInfo?.architecture || 'N/A', icon: Cpu, color: 'text-green-400' },
    { label: 'Total CPUs', value: cpuData?.total_cpus ?? 'N/A', icon: Cpu, color: 'text-amber-400' },
  ];

  // Build CPU core list from real topology
  const cpuCores = useMemo(() => {
    if (!cpuData) return [];
    // If cpuData has a cpus array (CpuCore[]), use it
    const cores = (cpuData as unknown as { cpus?: Array<{ id: number; socket_id: number; core_id: number; thread_id: number }> }).cpus;
    return cores || [];
  }, [cpuData]);

  const filteredCores = useMemo(
    () => cpuCores.filter(c => !search || `cpu${c.id}`.includes(search.toLowerCase())),
    [cpuCores, search]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
          Kernel
        </h1>
        <p className="text-sm text-slate-400 mt-1">Kernel information, CPU topology, and NUMA layout</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="stat-card bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">{s.label}</p>
                <p className="text-xl font-bold text-white mt-1">{s.value}</p>
              </div>
              <s.icon className={`w-8 h-8 ${s.color}`} />
            </div>
          </div>
        ))}
      </div>

      {/* CPU Topology Summary */}
      {cpuData && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-400" /> CPU Topology
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-slate-400">Sockets</span>
              <p className="text-white font-semibold">{cpuData.sockets}</p>
            </div>
            <div>
              <span className="text-slate-400">Cores/Socket</span>
              <p className="text-white font-semibold">{cpuData.cores_per_socket}</p>
            </div>
            <div>
              <span className="text-slate-400">Threads/Core</span>
              <p className="text-white font-semibold">{cpuData.threads_per_core}</p>
            </div>
            <div>
              <span className="text-slate-400">Total CPUs</span>
              <p className="text-white font-semibold">{cpuData.total_cpus}</p>
            </div>
          </div>
        </div>
      )}

      {/* NUMA Topology */}
      {numaNodes.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-green-400" /> NUMA Topology
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {numaNodes.map(node => (
              <div key={node.id} className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-white">Node {node.id}</span>
                  <span className="text-xs text-slate-400">{node.cpus.length} CPUs</span>
                </div>
                <div className="text-xs text-slate-400 space-y-1">
                  <div>Memory Total: <span className="text-slate-300">{formatBytes(node.memory_total)}</span></div>
                  <div>Memory Free: <span className="text-slate-300">{formatBytes(node.memory_free)}</span></div>
                  <div>CPUs: <span className="text-slate-300 font-mono">{node.cpus.join(', ')}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CPU Cores Table */}
      {cpuCores.length > 0 && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
              placeholder="Search CPU cores..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            {filteredCores.length === 0 ? (
              <div className="p-10 text-center text-slate-500">No CPU cores found</div>
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">CPU ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Socket</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Core</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Thread</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {filteredCores.map((core) => {
                    const online = (cpuData as unknown as { online_cpus?: number[] }).online_cpus;
                    const isOnline = online ? online.includes(core.id) : true;
                    return (
                      <tr key={core.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-white font-medium font-mono">cpu{core.id}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{core.socket_id}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{core.core_id}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{core.thread_id}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(isOnline ? 'active' : 'offline')}`}>
                            {isOnline ? 'online' : 'offline'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
