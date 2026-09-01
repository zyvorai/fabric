// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { Clock, Activity, AlertTriangle, AlertCircle, Settings, Server } from 'lucide-react';
import { auditApi } from '../utils/api';
import { AuditLogEntry } from '../types';
import { usePolling } from '../hooks/usePolling';
import { formatRelativeTime } from '../utils/format';

function getEventColor(action: string) {
  const lower = action.toLowerCase();
  if (lower.includes('error') || lower.includes('fail') || lower.includes('delete')) return 'bg-red-500';
  if (lower.includes('warn') || lower.includes('stop') || lower.includes('pause')) return 'bg-amber-500';
  return 'bg-blue-500';
}

function getEventLineColor(action: string) {
  const lower = action.toLowerCase();
  if (lower.includes('error') || lower.includes('fail') || lower.includes('delete')) return 'border-red-500/30';
  if (lower.includes('warn') || lower.includes('stop') || lower.includes('pause')) return 'border-amber-500/30';
  return 'border-blue-500/30';
}

function getEventIcon(action: string) {
  const lower = action.toLowerCase();
  if (lower.includes('error') || lower.includes('fail')) return AlertCircle;
  if (lower.includes('warn') || lower.includes('alert')) return AlertTriangle;
  if (lower.includes('config') || lower.includes('update') || lower.includes('setting')) return Settings;
  if (lower.includes('vm') || lower.includes('start') || lower.includes('create')) return Server;
  return Activity;
}

export default function Timeline() {
  const { data: rawLogs, loading } = usePolling<AuditLogEntry[]>(
    () => auditApi.listLogs() as Promise<AuditLogEntry[]>,
    10000
  );

  const logs: AuditLogEntry[] = (rawLogs || []).slice(0, 50);

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Activity Timeline</h1>
        <p className="text-sm text-slate-400 mt-1">Recent system activity and events</p>
      </div>

      {logs.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          No activity recorded yet
        </div>
      ) : (
        <div className="relative">
          {logs.map((entry, idx) => {
            const Icon = getEventIcon(entry.action);
            const dotColor = getEventColor(entry.action);
            const lineColor = getEventLineColor(entry.action);
            const isLast = idx === logs.length - 1;

            return (
              <div key={entry.id || idx} className="flex gap-4 mb-0">
                {/* Timeline column */}
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full ${dotColor} ring-4 ring-slate-900 z-10`} />
                  {!isLast && (
                    <div className={`w-px flex-1 border-l-2 ${lineColor}`} />
                  )}
                </div>

                {/* Content */}
                <div className="pb-6 flex-1">
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-medium text-white">{entry.action}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(entry.timestamp)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-slate-400">Resource:</span>
                      <span className="text-slate-300">{entry.resource}</span>
                    </div>
                    {entry.user_id && (
                      <div className="flex items-center gap-3 text-sm mt-1">
                        <span className="text-slate-400">User:</span>
                        <span className="text-slate-300">{entry.user_id}</span>
                      </div>
                    )}
                    {entry.details && (
                      <p className="text-xs text-slate-500 mt-2">{entry.details}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
