// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react';
import { Cpu, MemoryStick, HardDrive, Network } from 'lucide-react';
import { systemApi, analyticsApi } from '../utils/api';
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

interface SystemPerf {
  avg_cpu?: number;
  avg_memory?: number;
  net_rx?: number;
  net_tx?: number;
}

function MetricBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="mt-3">
      <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-right text-xs text-slate-400 mt-1">{pct.toFixed(1)}%</div>
    </div>
  );
}

export default function LiveMetrics() {
  const [autoRefresh] = useState(true);

  const { data: capacity, loading } = usePolling<CapacityData>(
    () => systemApi.getCapacity() as Promise<CapacityData>,
    3000,
    autoRefresh
  );

  const { data: sysPerf } = usePolling<SystemPerf>(
    () => analyticsApi.getSystemPerformance() as Promise<SystemPerf>,
    3000,
    autoRefresh
  );

  const cpuPct = capacity && capacity.total_cpus ? ((capacity.used_cpus || 0) / capacity.total_cpus) * 100 : 0;
  const memPct = capacity && capacity.total_memory ? ((capacity.used_memory || 0) / capacity.total_memory) * 100 : 0;
  const diskUsed = capacity?.used_storage || 0;
  const diskTotal = capacity?.total_storage || 1;
  const netRx = sysPerf?.net_rx || 0;
  const netTx = sysPerf?.net_tx || 0;

  if (loading && !capacity) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const metrics = [
    {
      label: 'CPU',
      value: `${cpuPct.toFixed(1)}%`,
      icon: Cpu,
      color: 'text-blue-400',
      barColor: 'bg-blue-500',
      current: capacity?.used_cpus || 0,
      max: capacity?.total_cpus || 1,
    },
    {
      label: 'Memory',
      value: `${memPct.toFixed(1)}%`,
      icon: MemoryStick,
      color: 'text-purple-400',
      barColor: 'bg-purple-500',
      current: capacity?.used_memory || 0,
      max: capacity?.total_memory || 1,
    },
    {
      label: 'Disk I/O',
      value: formatBytes(diskUsed * 1024 * 1024),
      icon: HardDrive,
      color: 'text-amber-400',
      barColor: 'bg-amber-500',
      current: diskUsed,
      max: diskTotal,
    },
    {
      label: 'Network I/O',
      value: `${formatBytes(netRx * 1024)}/s`,
      icon: Network,
      color: 'text-green-400',
      barColor: 'bg-green-500',
      current: netRx,
      max: 1000,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Live Metrics</h1>
        <p className="text-sm text-slate-400 mt-1">Real-time system metrics (auto-refresh every 3s)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <m.icon className={`w-5 h-5 ${m.color}`} />
              <span className="text-sm text-slate-400">{m.label}</span>
            </div>
            <div className="text-3xl font-bold text-white">{m.value}</div>
            <MetricBar value={m.current} max={m.max} color={m.barColor} />
          </div>
        ))}
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-white font-medium mb-4">Network Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-400">RX Rate</span>
            <div className="text-white font-medium mt-1">{formatBytes(netRx * 1024)}/s</div>
          </div>
          <div>
            <span className="text-slate-400">TX Rate</span>
            <div className="text-white font-medium mt-1">{formatBytes(netTx * 1024)}/s</div>
          </div>
        </div>
      </div>
    </div>
  );
}
