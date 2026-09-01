// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import { Play, Square, RotateCcw, Camera, CheckSquare } from 'lucide-react';
import { vmApi, snapshotApi } from '../utils/api';
import { getStatusBadgeClasses } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { VM } from '../types';

export default function BulkOperations() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; action: string } | null>(null);

  const fetchVMs = useCallback(() => vmApi.list(), []);
  const { data: vmData, loading, refresh } = usePolling<{ items: unknown[]; total: number }>(fetchVMs, 10000);
  const vms = (vmData?.items || []) as VM[];

  const toggle = (name: string) => {
    const next = new Set(selected);
    next.has(name) ? next.delete(name) : next.add(name);
    setSelected(next);
  };

  const toggleAll = () => {
    setSelected(selected.size === vms.length ? new Set() : new Set(vms.map(v => v.name)));
  };

  const runBulk = async (action: string, fn: (name: string) => Promise<unknown>) => {
    if (selected.size === 0) return;
    setRunning(true);
    const names = Array.from(selected);
    setProgress({ done: 0, total: names.length, action });
    for (let i = 0; i < names.length; i++) {
      try { await fn(names[i]); } catch (err) { console.error(`${action} ${names[i]} failed:`, err); }
      setProgress({ done: i + 1, total: names.length, action });
    }
    setRunning(false);
    setProgress(null);
    setSelected(new Set());
    refresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Bulk Operations</h1>
        <p className="text-sm text-slate-400 mt-1">Perform actions on multiple VMs at once</p>
      </div>

      {/* Actions */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-slate-300">{selected.size} selected</span>
          <button onClick={() => runBulk('Start', n => vmApi.start(n))} disabled={running || !selected.size}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
            <Play className="w-4 h-4" />Start
          </button>
          <button onClick={() => runBulk('Stop', n => vmApi.stop(n))} disabled={running || !selected.size}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
            <Square className="w-4 h-4" />Stop
          </button>
          <button onClick={() => runBulk('Restart', n => vmApi.restart(n))} disabled={running || !selected.size}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />Restart
          </button>
          <button onClick={() => runBulk('Snapshot', n => snapshotApi.create(n, { name: `bulk-${Date.now()}` }))} disabled={running || !selected.size}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
            <Camera className="w-4 h-4" />Snapshot
          </button>
        </div>
      </div>

      {/* Progress */}
      {progress && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <p className="text-sm text-white mb-2">{progress.action}: {progress.done}/{progress.total}</p>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* VM Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : vms.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          <p>No VMs found</p>
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-slate-700/50">
              <th className="text-left px-4 py-3">
                <button onClick={toggleAll} className="text-slate-400 hover:text-white"><CheckSquare className="w-4 h-4" /></button>
              </th>
              {['Name', 'State', 'CPUs', 'Memory', 'IP'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-slate-700/30">
              {vms.map(vm => (
                <tr key={vm.name} className={`hover:bg-slate-700/20 ${selected.has(vm.name) ? 'bg-blue-500/10' : ''}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(vm.name)} onChange={() => toggle(vm.name)}
                      className="rounded border-slate-600 bg-slate-900/50 text-blue-600" />
                  </td>
                  <td className="px-4 py-3 text-sm text-white font-medium">{vm.name}</td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(vm.state)}`}>{vm.state}</span></td>
                  <td className="px-4 py-3 text-sm text-slate-300">{vm.cpus}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{vm.memory} MB</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{vm.ip || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
