// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useMemo } from 'react';
import { Download, Filter } from 'lucide-react';
import { auditApi } from '../utils/api';
import { AuditLogEntry } from '../types';
import { usePolling } from '../hooks/usePolling';
import { formatDateTime, getStatusBadgeClasses } from '../utils/format';

export default function AuditLogs() {
  const [actionFilter, setActionFilter] = useState('all');

  const { data: rawLogs, loading } = usePolling<AuditLogEntry[]>(
    () => auditApi.listLogs() as Promise<AuditLogEntry[]>,
    15000
  );

  const logs: AuditLogEntry[] = rawLogs || [];

  const actionTypes = useMemo(() => {
    const types = new Set(logs.map((l) => l.action));
    return ['all', ...Array.from(types)];
  }, [logs]);

  const filtered = useMemo(
    () => actionFilter === 'all' ? logs : logs.filter((l) => l.action === actionFilter),
    [logs, actionFilter]
  );

  const handleExport = async () => {
    try {
      await auditApi.exportLogs();
    } catch {
      // silent
    }
  };

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
          <p className="text-sm text-slate-400 mt-1">Track all system actions and changes</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-slate-400" />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          {actionTypes.map((t) => (
            <option key={t} value={t}>
              {t === 'all' ? 'All Actions' : t}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-400">{filtered.length} entries</span>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No audit logs found</div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Resource</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-400">{formatDateTime(log.timestamp)}</td>
                  <td className="px-4 py-3 text-sm text-white">{log.user_id}</td>
                  <td className="px-4 py-3">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">{log.resource}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(log.status === 'success' ? 'active' : 'error')}`}>
                      {log.status}
                    </span>
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
