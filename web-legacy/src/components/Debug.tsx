// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react';
import { Cpu, MemoryStick, Network, HardDrive } from 'lucide-react';
import { systemApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';
import { formatBytes } from '../utils/format';

interface CapacityData {
  total_cpus?: number;
  used_cpus?: number;
  total_memory?: number;
  used_memory?: number;
  total_storage?: number;
  used_storage?: number;
}

interface CpuData {
  total_cpus?: number;
  sockets?: number;
  cores_per_socket?: number;
  threads_per_core?: number;
  model?: string;
}

function KVRow({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-slate-700/30 last:border-0">
      <span className="text-sm text-slate-400">{k}</span>
      <span className="text-sm text-white font-mono">{v}</span>
    </div>
  );
}

export default function Debug() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data: capacity } = usePolling<CapacityData>(
    () => systemApi.getCapacity() as Promise<CapacityData>,
    5000,
    autoRefresh
  );

  const { data: cpuData, loading } = usePolling<CpuData>(
    () => systemApi.getCpuTopology() as Promise<CpuData>,
    10000,
    autoRefresh
  );

  if (loading && !cpuData && !capacity) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const panels = [
    {
      title: 'CPU Info',
      icon: Cpu,
      color: 'text-blue-400',
      entries: [
        ['Model', cpuData?.model || 'Unknown'],
        ['Total CPUs', cpuData?.total_cpus || 0],
        ['Sockets', cpuData?.sockets || 0],
        ['Cores/Socket', cpuData?.cores_per_socket || 0],
        ['Threads/Core', cpuData?.threads_per_core || 0],
        ['Used CPUs', capacity?.used_cpus || 0],
      ] as [string, string | number][],
    },
    {
      title: 'Memory Info',
      icon: MemoryStick,
      color: 'text-purple-400',
      entries: [
        ['Total', formatBytes((capacity?.total_memory || 0) * 1024 * 1024)],
        ['Used', formatBytes((capacity?.used_memory || 0) * 1024 * 1024)],
        ['Free', formatBytes(((capacity?.total_memory || 0) - (capacity?.used_memory || 0)) * 1024 * 1024)],
        ['Usage', `${capacity?.total_memory ? (((capacity?.used_memory || 0) / capacity.total_memory) * 100).toFixed(1) : 0}%`],
      ] as [string, string | number][],
    },
    {
      title: 'Network Info',
      icon: Network,
      color: 'text-green-400',
      entries: [
        ['Primary Interface', 'eth0'],
        ['IP Address', '192.168.1.100'],
        ['Gateway', '192.168.1.1'],
        ['DNS', '1.1.1.1'],
        ['MTU', 1500],
      ] as [string, string | number][],
    },
    {
      title: 'Disk Info',
      icon: HardDrive,
      color: 'text-amber-400',
      entries: [
        ['Total Storage', formatBytes((capacity?.total_storage || 0) * 1024 * 1024)],
        ['Used', formatBytes((capacity?.used_storage || 0) * 1024 * 1024)],
        ['Available', formatBytes(((capacity?.total_storage || 0) - (capacity?.used_storage || 0)) * 1024 * 1024)],
        ['Usage', `${capacity?.total_storage ? (((capacity?.used_storage || 0) / capacity.total_storage) * 100).toFixed(1) : 0}%`],
      ] as [string, string | number][],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Debug</h1>
          <p className="text-sm text-slate-400 mt-1">System debug information</p>
        </div>
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className="flex items-center gap-2 text-sm text-slate-300"
        >
          <div className={`relative w-10 h-5 rounded-full transition-colors ${autoRefresh ? 'bg-blue-600' : 'bg-slate-600'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${autoRefresh ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          Auto-refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {panels.map((panel) => (
          <div key={panel.title} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-4">
              <panel.icon className={`w-5 h-5 ${panel.color}`} />
              <h3 className="text-white font-medium">{panel.title}</h3>
            </div>
            <div>
              {panel.entries.map(([k, v]) => (
                <KVRow key={k} k={k} v={v} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
