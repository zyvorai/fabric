// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useCallback } from 'react';
import { Box, Cpu, MemoryStick, Activity, Trash2, Play, Square } from 'lucide-react';
import { machineApi } from '../utils/api';
import { Machine } from '../types';
import { getStatusBadgeClasses } from '../utils/format';
import { usePolling } from '../hooks/usePolling';

const btnDanger = 'bg-red-600 hover:bg-red-500 text-white rounded-lg px-2 py-1.5 text-xs font-medium transition-colors';
const btnPrimary = 'bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-2 py-1.5 text-xs font-medium transition-colors';
const thCls = 'text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider';

export default function Containers() {
  const { data: allMachines, refresh } = usePolling<Machine[]>(
    useCallback(() => machineApi.list() as Promise<Machine[]>, []), 10000
  );

  const containers = (allMachines || []).filter(m => m.class === 'container');
  const running = containers.filter(c => c.state === 'running');

  const poweroff = async (name: string) => { await machineApi.poweroff(name); refresh(); };
  const reboot = async (name: string) => { await machineApi.reboot(name); refresh(); };
  const terminate = async (name: string) => { await machineApi.terminate(name); refresh(); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Box className="w-7 h-7 text-cyan-400" />
          Containers
        </h1>
        <p className="text-sm text-slate-400 mt-1">Container overview and management</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total */}
        <div className="stat-card-cyan rounded-xl border border-slate-700/50 p-5 transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-700 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Box className="h-5 w-5 text-white" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400">total</span>
          </div>
          <div className="text-2xl font-bold text-white">{containers.length}</div>
          <div className="text-xs text-slate-400 mt-1">Total Containers</div>
        </div>

        {/* Running */}
        <div className="stat-card-green rounded-xl border border-slate-700/50 p-5 transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-green-500/20">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
              {containers.length > 0 ? `${Math.round((running.length / containers.length) * 100)}%` : '0%'}
            </span>
          </div>
          <div className="text-2xl font-bold text-white">{running.length}</div>
          <div className="text-xs text-slate-400 mt-1">Running</div>
        </div>

        {/* Stopped */}
        <div className="stat-card-blue rounded-xl border border-slate-700/50 p-5 transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Cpu className="h-5 w-5 text-white" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">stopped</span>
          </div>
          <div className="text-2xl font-bold text-white">{containers.length - running.length}</div>
          <div className="text-xs text-slate-400 mt-1">Stopped</div>
        </div>

        {/* Services */}
        <div className="stat-card-purple rounded-xl border border-slate-700/50 p-5 transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <MemoryStick className="h-5 w-5 text-white" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">svc</span>
          </div>
          <div className="text-2xl font-bold text-white">{new Set(containers.map(c => c.service).filter(Boolean)).size}</div>
          <div className="text-xs text-slate-400 mt-1">Unique Services</div>
        </div>
      </div>

      {/* Container Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Containers</h2>
          <span className="text-xs font-medium text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">{containers.length} containers</span>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-700/50">
            <th className={thCls}>Name</th>
            <th className={thCls}>Service</th>
            <th className={thCls}>OS</th>
            <th className={thCls}>State</th>
            <th className={thCls}>Leader PID</th>
            <th className={thCls}>Addresses</th>
            <th className={thCls}>Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-700/30">
            {containers.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                <Box className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                No containers found
              </td></tr>
            ) : containers.map(c => (
              <tr key={c.name} className="hover:bg-slate-700/20 transition-colors">
                <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                <td className="px-4 py-3 text-slate-400">{c.service}</td>
                <td className="px-4 py-3 text-slate-400">{c.os || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(c.state || 'unknown')}`}>
                    {c.state || 'unknown'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400 font-mono">{c.leader || '-'}</td>
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{(c.addresses || []).join(', ') || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {c.state !== 'running' ? (
                      <button onClick={() => reboot(c.name)} className={btnPrimary} title="Start"><Play className="w-3.5 h-3.5" /></button>
                    ) : (
                      <button onClick={() => poweroff(c.name)} className={btnPrimary} title="Stop"><Square className="w-3.5 h-3.5" /></button>
                    )}
                    <button onClick={() => terminate(c.name)} className={btnDanger} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
