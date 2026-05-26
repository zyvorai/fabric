// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { Cpu, MemoryStick, HardDrive, TrendingUp } from 'lucide-react';
import { systemApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';

interface CapacityData {
  total_cpus?: number;
  used_cpus?: number;
  total_memory?: number;
  used_memory?: number;
  total_storage?: number;
  used_storage?: number;
}

function CapacityBar({ label, used, total, unit, color }: {
  label: string; used: number; total: number; unit: string; color: string;
}) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const projected = Math.min(pct * 1.15, 100); // 15% growth projection

  return (
    <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-white font-medium">{label}</span>
        <span className="text-sm text-slate-400">{pct.toFixed(1)}% used</span>
      </div>
      <div className="relative w-full h-4 bg-slate-700 rounded-full overflow-hidden mb-3">
        <div className={`absolute h-full rounded-full ${color} opacity-30`} style={{ width: `${projected}%` }} />
        <div className={`absolute h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <span className="text-slate-400">Used</span>
          <div className="text-white font-medium">{used} {unit}</div>
        </div>
        <div>
          <span className="text-slate-400">Total</span>
          <div className="text-white font-medium">{total} {unit}</div>
        </div>
        <div>
          <span className="text-slate-400">Available</span>
          <div className="text-white font-medium">{total - used} {unit}</div>
        </div>
      </div>
    </div>
  );
}

export default function CapacityPlanning() {
  const { data: capacity, loading } = usePolling<CapacityData>(
    () => systemApi.getCapacity() as Promise<CapacityData>,
    15000
  );

  const cpuUsed = capacity?.used_cpus || 0;
  const cpuTotal = capacity?.total_cpus || 0;
  const memUsed = capacity?.used_memory || 0;
  const memTotal = capacity?.total_memory || 0;
  const storUsed = capacity?.used_storage || 0;
  const storTotal = capacity?.total_storage || 0;

  // Growth projections
  const growthRate = 15; // percent
  const daysToFull = (resource: number, total: number) => {
    if (resource >= total || total === 0) return 0;
    const dailyGrowth = (resource * (growthRate / 100)) / 30;
    return dailyGrowth > 0 ? Math.ceil((total - resource) / dailyGrowth) : 999;
  };

  if (loading && !capacity) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Capacity Planning</h1>
        <p className="text-sm text-slate-400 mt-1">Current utilization and growth projections</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'CPU', used: cpuUsed, total: cpuTotal, icon: Cpu, color: 'text-blue-400', days: daysToFull(cpuUsed, cpuTotal) },
          { label: 'Memory', used: memUsed, total: memTotal, icon: MemoryStick, color: 'text-purple-400', days: daysToFull(memUsed, memTotal) },
          { label: 'Storage', used: storUsed, total: storTotal, icon: HardDrive, color: 'text-amber-400', days: daysToFull(storUsed, storTotal) },
        ].map((r) => (
          <div key={r.label} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <r.icon className={`w-5 h-5 ${r.color}`} />
              <span className="text-sm text-slate-400">{r.label}</span>
            </div>
            <div className="text-2xl font-bold text-white">
              {r.total > 0 ? ((r.used / r.total) * 100).toFixed(1) : 0}%
            </div>
            <div className="text-xs text-slate-500 mt-1">
              ~{r.days} days until full at {growthRate}% growth
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <CapacityBar label="CPU Cores" used={cpuUsed} total={cpuTotal} unit="cores" color="bg-blue-500" />
        <CapacityBar label="Memory" used={memUsed} total={memTotal} unit="MB" color="bg-purple-500" />
        <CapacityBar label="Storage" used={storUsed} total={storTotal} unit="MB" color="bg-amber-500" />
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-green-400" />
          <h3 className="text-white font-medium">Growth Projections</h3>
        </div>
        <div className="space-y-3 text-sm">
          {[
            { label: 'CPU at current growth rate', pct30: Math.min(((cpuUsed / (cpuTotal || 1)) * 100) * 1.15, 100), pct90: Math.min(((cpuUsed / (cpuTotal || 1)) * 100) * 1.45, 100) },
            { label: 'Memory at current growth rate', pct30: Math.min(((memUsed / (memTotal || 1)) * 100) * 1.15, 100), pct90: Math.min(((memUsed / (memTotal || 1)) * 100) * 1.45, 100) },
            { label: 'Storage at current growth rate', pct30: Math.min(((storUsed / (storTotal || 1)) * 100) * 1.15, 100), pct90: Math.min(((storUsed / (storTotal || 1)) * 100) * 1.45, 100) },
          ].map((proj) => (
            <div key={proj.label} className="flex items-center justify-between p-3 bg-slate-900/30 rounded-lg">
              <span className="text-slate-300">{proj.label}</span>
              <div className="flex gap-4">
                <span className="text-slate-400">30d: <span className="text-white">{proj.pct30.toFixed(1)}%</span></span>
                <span className="text-slate-400">90d: <span className="text-white">{proj.pct90.toFixed(1)}%</span></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
