// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useMemo } from 'react';
import { Bell, AlertTriangle, AlertCircle } from 'lucide-react';
import { eventApi } from '../utils/api';
import { Alert } from '../types';
import { usePolling } from '../hooks/usePolling';
import { formatDateTime } from '../utils/format';

type FilterType = 'all' | 'critical' | 'warning' | 'info';

function getSeverityBadge(severity: string) {
  switch (severity) {
    case 'critical': return 'bg-red-500/20 text-red-400';
    case 'warning': return 'bg-yellow-500/20 text-yellow-400';
    case 'info': return 'bg-blue-500/20 text-blue-400';
    default: return 'bg-slate-500/20 text-slate-400';
  }
}

export default function Alerts() {
  const [filter, setFilter] = useState<FilterType>('all');

  const { data: rawAlerts, loading } = usePolling<Alert[]>(
    () => eventApi.list() as Promise<Alert[]>,
    10000
  );

  const alerts: Alert[] = (rawAlerts || []).map((a: any) => ({
    id: a.id || '',
    severity: a.severity || 'info',
    message: a.message || '',
    source: a.source || '',
    timestamp: a.timestamp || new Date().toISOString(),
    acknowledged: a.acknowledged || false,
  }));

  const filtered = useMemo(
    () => filter === 'all' ? alerts : alerts.filter((a) => a.severity === filter),
    [alerts, filter]
  );

  const stats = {
    active: alerts.filter((a) => !a.acknowledged).length,
    critical: alerts.filter((a) => a.severity === 'critical').length,
    warning: alerts.filter((a) => a.severity === 'warning').length,
  };

  if (loading && alerts.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Alerts</h1>
        <p className="text-sm text-slate-400 mt-1">System alerts and notifications</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Active', value: stats.active, icon: Bell, color: 'text-blue-400' },
          { label: 'Critical', value: stats.critical, icon: AlertCircle, color: 'text-red-400' },
          { label: 'Warning', value: stats.warning, icon: AlertTriangle, color: 'text-yellow-400' },
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

      <div className="flex gap-2">
        {(['all', 'critical', 'warning', 'info'] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-slate-800/50 text-slate-400 hover:text-white border border-slate-700/50'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No alerts found</div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Severity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Message</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Acknowledged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityBadge(a.severity)}`}>
                      {a.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-white">{a.message}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{a.source}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{formatDateTime(a.timestamp)}</td>
                  <td className="px-4 py-3">
                    <div className={`relative w-10 h-5 rounded-full transition-colors ${a.acknowledged ? 'bg-green-600' : 'bg-slate-600'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${a.acknowledged ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
