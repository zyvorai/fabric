// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useMemo } from 'react';
import { Search, Activity, Play, Moon } from 'lucide-react';
import { systemApi } from '../utils/api';
import { ProcessInfo } from '../types';
import { usePolling } from '../hooks/usePolling';
import { getStatusBadgeClasses } from '../utils/format';

type SortKey = 'pid' | 'name' | 'cpu' | 'memory' | 'state';

export default function Processes() {
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('cpu');
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<ProcessInfo | null>(null);

  const { data: rawProcesses, loading } = usePolling<ProcessInfo[]>(
    () => systemApi.getCpuTopology().then(() => [] as ProcessInfo[]).catch(() => [] as ProcessInfo[]),
    3000,
    autoRefresh
  );

  const processes: ProcessInfo[] = rawProcesses || [];

  const filtered = useMemo(() => {
    let list = processes.filter(
      (p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || String(p.pid).includes(search)
    );
    list.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (typeof va === 'number' && typeof vb === 'number') return sortAsc ? va - vb : vb - va;
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return list;
  }, [processes, search, sortKey, sortAsc]);

  const stats = {
    total: processes.length,
    running: processes.filter((p) => p.state === 'running').length,
    sleeping: processes.filter((p) => p.state === 'sleeping').length,
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase cursor-pointer hover:text-white"
      onClick={() => handleSort(k)}
    >
      {label} {sortKey === k ? (sortAsc ? '▲' : '▼') : ''}
    </th>
  );

  if (loading && processes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Processes</h1>
        <p className="text-sm text-slate-400 mt-1">System process monitoring</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: Activity, color: 'text-blue-400' },
          { label: 'Running', value: stats.running, icon: Play, color: 'text-green-400' },
          { label: 'Sleeping', value: stats.sleeping, icon: Moon, color: 'text-yellow-400' },
        ].map((s) => (
          <div key={s.label} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">{s.label}</p>
                <p className="text-2xl font-bold text-white mt-1">{s.value}</p>
              </div>
              <s.icon className={`w-8 h-8 ${s.color}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
            placeholder="Filter by name or PID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No processes found</div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-700/50">
              <tr>
                <SortHeader k="pid" label="PID" />
                <SortHeader k="name" label="Name" />
                <SortHeader k="cpu" label="CPU%" />
                <SortHeader k="memory" label="Memory%" />
                <SortHeader k="state" label="State" />
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Command</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filtered.map((p) => (
                <tr
                  key={p.pid}
                  className="hover:bg-slate-700/30 cursor-pointer transition-colors"
                  onClick={() => setSelected(p)}
                >
                  <td className="px-4 py-3 text-sm text-slate-300">{p.pid}</td>
                  <td className="px-4 py-3 text-sm text-white font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{p.cpu.toFixed(1)}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{p.memory.toFixed(1)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(p.state)}`}>
                      {p.state}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{p.user}</td>
                  <td className="px-4 py-3 text-sm text-slate-400 max-w-xs truncate">{p.command}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium">Process Detail: {selected.name}</h3>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-sm">Close</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {[
              ['PID', selected.pid], ['Name', selected.name],
              ['CPU', `${selected.cpu.toFixed(1)}%`], ['Memory', `${selected.memory.toFixed(1)}%`],
              ['State', selected.state], ['User', selected.user],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <span className="text-slate-400">{k}</span>
                <div className="text-white font-medium mt-1">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-sm">
            <span className="text-slate-400">Command</span>
            <div className="text-white font-mono mt-1 bg-slate-900/50 p-2 rounded">{selected.command}</div>
          </div>
        </div>
      )}
    </div>
  );
}
