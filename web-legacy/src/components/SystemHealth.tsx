// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { Activity, Cpu, HardDrive, MemoryStick } from 'lucide-react';
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

function UsageBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-400">{pct.toFixed(1)}%</span>
      </div>
      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function getScoreColor(score: number) {
  if (score >= 80) return 'border-green-500 text-green-400';
  if (score >= 60) return 'border-yellow-500 text-yellow-400';
  return 'border-red-500 text-red-400';
}

export default function SystemHealth() {
  const { data: capacity, loading } = usePolling<CapacityData>(
    () => systemApi.getCapacity() as Promise<CapacityData>,
    10000
  );

  const cpuPct = capacity && capacity.total_cpus ? ((capacity.used_cpus || 0) / capacity.total_cpus) * 100 : 0;
  const memPct = capacity && capacity.total_memory ? ((capacity.used_memory || 0) / capacity.total_memory) * 100 : 0;
  const diskPct = capacity && capacity.total_storage ? ((capacity.used_storage || 0) / capacity.total_storage) * 100 : 0;
  const healthScore = Math.round(100 - (cpuPct * 0.4 + memPct * 0.35 + diskPct * 0.25));

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
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
          System Health
        </h1>
        <p className="text-sm text-slate-400 mt-1">Overall system health and resource utilization</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Health Score */}
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 flex flex-col items-center justify-center">
          <div className={`w-28 h-28 rounded-full border-4 flex items-center justify-center ${getScoreColor(healthScore)}`}>
            <div className="text-center">
              <div className="text-3xl font-bold">{healthScore}</div>
              <div className="text-xs text-slate-400">Score</div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-slate-300">
            <Activity className="w-4 h-4" />
            <span className="text-sm font-medium">Health Score</span>
          </div>
        </div>

        {/* CPU */}
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-5 h-5 text-blue-400" />
            <h3 className="text-white font-medium">CPU</h3>
          </div>
          <UsageBar label="Usage" value={capacity?.used_cpus || 0} max={capacity?.total_cpus || 1} color="bg-blue-500" />
          <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
            <div>
              <span className="text-slate-400">Total Cores</span>
              <div className="text-white font-medium">{capacity?.total_cpus || 0}</div>
            </div>
            <div>
              <span className="text-slate-400">Used</span>
              <div className="text-white font-medium">{capacity?.used_cpus || 0}</div>
            </div>
          </div>
        </div>

        {/* Memory */}
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4">
            <MemoryStick className="w-5 h-5 text-purple-400" />
            <h3 className="text-white font-medium">Memory</h3>
          </div>
          <UsageBar label="Usage" value={capacity?.used_memory || 0} max={capacity?.total_memory || 1} color="bg-purple-500" />
          <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
            <div>
              <span className="text-slate-400">Total</span>
              <div className="text-white font-medium">{formatBytes((capacity?.total_memory || 0) * 1024 * 1024)}</div>
            </div>
            <div>
              <span className="text-slate-400">Used</span>
              <div className="text-white font-medium">{formatBytes((capacity?.used_memory || 0) * 1024 * 1024)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Disk Section */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="w-5 h-5 text-amber-400" />
          <h3 className="text-white font-medium">Disk</h3>
        </div>
        <UsageBar label="Storage" value={capacity?.used_storage || 0} max={capacity?.total_storage || 1} color="bg-amber-500" />
        <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
          <div>
            <span className="text-slate-400">Total</span>
            <div className="text-white font-medium">{formatBytes((capacity?.total_storage || 0) * 1024 * 1024)}</div>
          </div>
          <div>
            <span className="text-slate-400">Used</span>
            <div className="text-white font-medium">{formatBytes((capacity?.used_storage || 0) * 1024 * 1024)}</div>
          </div>
          <div>
            <span className="text-slate-400">Available</span>
            <div className="text-white font-medium">
              {formatBytes(((capacity?.total_storage || 0) - (capacity?.used_storage || 0)) * 1024 * 1024)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
