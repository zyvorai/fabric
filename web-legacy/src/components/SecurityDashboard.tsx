// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useCallback } from 'react';
import { Shield, ShieldAlert, AlertTriangle, Info } from 'lucide-react';
import { auditApi } from '../utils/api';
import { formatRelativeTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';

interface SecurityEvent {
  id?: string;
  type?: string;
  severity?: string;
  message?: string;
  timestamp?: string;
  user?: string;
  action?: string;
}

export default function SecurityDashboard() {
  const fetchLogs = useCallback(() => auditApi.listLogs() as Promise<SecurityEvent[]>, []);
  const { data: events, loading, refresh } = usePolling(fetchLogs, 15000);

  const items = events || [];
  const critical = items.filter(e => e.severity === 'critical').length;
  const warning = items.filter(e => e.severity === 'warning').length;
  const info = items.filter(e => e.severity === 'info' || !e.severity).length;
  const failedLogins = items.filter(e => e.action === 'login_failed' || e.type === 'auth_failure').length;
  const recent = items.slice(0, 10);

  if (loading && !events) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Security Dashboard</h1>
        <button onClick={refresh}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card-red rounded-xl border border-slate-700/50 p-5 transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/20">
              <ShieldAlert className="h-5 w-5 text-white" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">critical</span>
          </div>
          <div className="text-2xl font-bold text-white">{critical}</div>
          <div className="text-xs text-slate-400 mt-1">Critical Alerts</div>
        </div>

        <div className="stat-card-yellow rounded-xl border border-slate-700/50 p-5 transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center shadow-lg shadow-yellow-500/20">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400">warning</span>
          </div>
          <div className="text-2xl font-bold text-white">{warning}</div>
          <div className="text-xs text-slate-400 mt-1">Warnings</div>
        </div>

        <div className="stat-card-blue rounded-xl border border-slate-700/50 p-5 transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Info className="h-5 w-5 text-white" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">info</span>
          </div>
          <div className="text-2xl font-bold text-white">{info}</div>
          <div className="text-xs text-slate-400 mt-1">Info Events</div>
        </div>

        <div className="stat-card-red rounded-xl border border-slate-700/50 p-5 transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-700 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">auth</span>
          </div>
          <div className="text-2xl font-bold text-white">{failedLogins}</div>
          <div className="text-xs text-slate-400 mt-1">Failed Logins</div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/20">
            <ShieldAlert className="w-4 h-4 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-white">Recent Security Events</h2>
          <span className="ml-auto text-xs font-medium text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">{items.length} total</span>
        </div>
        {recent.length === 0 ? (
          <div className="p-10 text-center">
            <Shield className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No security events recorded</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Severity</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Message</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {recent.map((evt, i) => (
                  <tr key={evt.id || i} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        evt.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                        evt.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>{evt.severity || 'info'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{evt.type || evt.action || '-'}</td>
                    <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{evt.message || '-'}</td>
                    <td className="px-4 py-3 text-slate-400">{evt.user || '-'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{evt.timestamp ? formatRelativeTime(evt.timestamp) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
