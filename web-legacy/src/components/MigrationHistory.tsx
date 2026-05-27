// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback } from 'react';
import { migrationApi } from '../utils/api';
import { formatDateTime, formatDuration } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { Migration } from '../types';

export default function MigrationHistory() {
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchMigrations = useCallback(() => migrationApi.list() as Promise<Migration[]>, []);
  const { data, loading } = usePolling<Migration[]>(fetchMigrations, 10000);
  const allMigrations = (data || []) as Migration[];

  const migrations = statusFilter === 'all' ? allMigrations : allMigrations.filter(m => m.status === statusFilter);

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      completed: 'bg-green-500/20 text-green-400',
      failed: 'bg-red-500/20 text-red-400',
      running: 'bg-blue-500/20 text-blue-400',
      cancelled: 'bg-yellow-500/20 text-yellow-400',
    };
    return colors[status] || 'bg-slate-500/20 text-slate-400';
  };

  const getDuration = (m: Migration): string => {
    if (!m.completed_at) return 'In progress';
    const start = new Date(m.started_at).getTime();
    const end = new Date(m.completed_at).getTime();
    return formatDuration(Math.floor((end - start) / 1000));
  };

  const statuses = ['all', ...new Set(allMigrations.map(m => m.status))];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Migration History</h2>
        <p className="text-sm text-slate-400 mt-1">View past and ongoing VM migrations</p>
      </div>

      <div className="flex items-center gap-2">
        {statuses.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-slate-800/50 text-slate-400 hover:text-white'}`}>
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        {loading && migrations.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-500">Loading...</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-900/50 text-slate-400">
              <tr>
                <th className="px-5 py-3">VM</th><th className="px-5 py-3">Source</th><th className="px-5 py-3">Destination</th>
                <th className="px-5 py-3">Status</th><th className="px-5 py-3">Started</th><th className="px-5 py-3">Completed</th><th className="px-5 py-3">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {migrations.map(m => (
                <tr key={m.id} className="text-slate-300 hover:bg-slate-700/30">
                  <td className="px-5 py-3 text-white font-medium">{m.vm_name}</td>
                  <td className="px-5 py-3">{m.source}</td>
                  <td className="px-5 py-3">{m.destination}</td>
                  <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(m.status)}`}>{m.status}</span></td>
                  <td className="px-5 py-3 text-xs">{formatDateTime(m.started_at)}</td>
                  <td className="px-5 py-3 text-xs">{m.completed_at ? formatDateTime(m.completed_at) : '-'}</td>
                  <td className="px-5 py-3 text-xs">{getDuration(m)}</td>
                </tr>
              ))}
              {migrations.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">No migrations found</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
