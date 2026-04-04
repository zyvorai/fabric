import { useCallback } from 'react';
import { migrationApi } from '../utils/api';
import { formatDateTime, formatDuration } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { Migration } from '../types';

export default function MigrationReport() {
  const fetchMigrations = useCallback(() => migrationApi.list() as Promise<Migration[]>, []);
  const { data, loading } = usePolling<Migration[]>(fetchMigrations, 15000);
  const migrations = (data || []) as Migration[];

  const total = migrations.length;
  const successful = migrations.filter(m => m.status === 'completed').length;
  const failed = migrations.filter(m => m.status === 'failed').length;
  const running = migrations.filter(m => m.status === 'running').length;

  const completedMigrations = migrations.filter(m => m.completed_at && m.started_at);
  const avgDuration = completedMigrations.length > 0
    ? Math.floor(completedMigrations.reduce((acc, m) => acc + (new Date(m.completed_at!).getTime() - new Date(m.started_at).getTime()) / 1000, 0) / completedMigrations.length)
    : 0;

  const handleExport = () => {
    const csv = [
      'VM,Source,Destination,Status,Progress,Started,Completed',
      ...migrations.map(m => `${m.vm_name},${m.source},${m.destination},${m.status},${m.progress}%,${m.started_at},${m.completed_at || ''}`),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'migration-report.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const stats = [
    { label: 'Total', value: total, border: 'border-l-blue-500' },
    { label: 'Successful', value: successful, border: 'border-l-green-500' },
    { label: 'Failed', value: failed, border: 'border-l-red-500' },
    { label: 'Running', value: running, border: 'border-l-yellow-500' },
    { label: 'Avg Duration', value: formatDuration(avgDuration), border: 'border-l-purple-500' },
  ];

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      completed: 'bg-green-500/20 text-green-400',
      failed: 'bg-red-500/20 text-red-400',
      running: 'bg-blue-500/20 text-blue-400',
      cancelled: 'bg-yellow-500/20 text-yellow-400',
    };
    return colors[status] || 'bg-slate-500/20 text-slate-400';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Migration Report</h2>
          <p className="text-sm text-slate-400 mt-1">Summary and detailed migration statistics</p>
        </div>
        <button onClick={handleExport} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Export CSV</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {stats.map(s => (
          <div key={s.label} className={`bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 border-l-4 ${s.border}`}>
            <div className="text-sm text-slate-400">{s.label}</div>
            <div className="text-2xl font-bold text-white mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Detailed Report</h3></div>
        {loading && migrations.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-500">Loading...</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-900/50 text-slate-400">
              <tr>
                <th className="px-5 py-3">VM</th><th className="px-5 py-3">Source</th><th className="px-5 py-3">Destination</th>
                <th className="px-5 py-3">Status</th><th className="px-5 py-3">Progress</th><th className="px-5 py-3">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {migrations.map(m => (
                <tr key={m.id} className="text-slate-300 hover:bg-slate-700/30">
                  <td className="px-5 py-3 text-white font-medium">{m.vm_name}</td>
                  <td className="px-5 py-3">{m.source}</td>
                  <td className="px-5 py-3">{m.destination}</td>
                  <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(m.status)}`}>{m.status}</span></td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${m.progress}%` }} />
                      </div>
                      <span className="text-xs">{m.progress}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs">{formatDateTime(m.started_at)}</td>
                </tr>
              ))}
              {migrations.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No migrations</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
