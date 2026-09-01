// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback, useRef, useEffect } from 'react';
import { ScrollText, RefreshCw } from 'lucide-react';
import { auditApi } from '../utils/api';
import { formatDateTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';

interface LogEntry {
  id: string;
  timestamp: string;
  level?: string;
  action?: string;
  message?: string;
  details?: string;
  resource?: string;
  user_id?: string;
  status?: string;
}

type LogLevel = 'all' | 'info' | 'warning' | 'error' | 'debug';

const LEVEL_COLORS: Record<string, { border: string; badge: string; bg: string }> = {
  info:    { border: 'border-blue-500',   badge: 'bg-blue-500/20 text-blue-400',   bg: 'bg-blue-500' },
  warning: { border: 'border-yellow-500', badge: 'bg-yellow-500/20 text-yellow-400', bg: 'bg-yellow-500' },
  error:   { border: 'border-red-500',    badge: 'bg-red-500/20 text-red-400',     bg: 'bg-red-500' },
  debug:   { border: 'border-slate-500',  badge: 'bg-slate-500/20 text-slate-400', bg: 'bg-slate-500' },
};

function getLogLevel(entry: LogEntry): string {
  if (entry.level) return entry.level.toLowerCase();
  if (entry.status === 'error' || entry.status === 'failed') return 'error';
  if (entry.status === 'warning') return 'warning';
  if (entry.status === 'debug') return 'debug';
  return 'info';
}

function getLogMessage(entry: LogEntry): string {
  if (entry.message) return entry.message;
  const parts: string[] = [];
  if (entry.action) parts.push(entry.action);
  if (entry.resource) parts.push(`on ${entry.resource}`);
  if (entry.details) parts.push(`- ${entry.details}`);
  if (entry.user_id) parts.push(`(by ${entry.user_id})`);
  return parts.join(' ') || 'Unknown event';
}

export default function Logs() {
  const [levelFilter, setLevelFilter] = useState<LogLevel>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(() => auditApi.listLogs() as Promise<LogEntry[]>, []);
  const { data, loading, refresh } = usePolling<LogEntry[]>(fetchLogs, 5000, autoRefresh);

  const logs = (data || []) as LogEntry[];

  const filteredLogs = levelFilter === 'all'
    ? logs
    : logs.filter((entry) => getLogLevel(entry) === levelFilter);

  useEffect(() => {
    if (scrollRef.current && autoRefresh) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs, autoRefresh]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Logs</h1>
          <p className="text-sm text-slate-400 mt-1">System and audit log viewer</p>
        </div>
        <button
          onClick={refresh}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Level</label>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as LogLevel)}
            className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Auto-refresh</label>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border ${
              autoRefresh
                ? 'bg-green-500/20 text-green-400 border-green-500/30'
                : 'bg-slate-800/50 text-slate-400 border-slate-600'
            }`}
          >
            {autoRefresh ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {/* Log entries */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-400">Loading...</span>
          </div>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">No log entries</p>
          <p className="text-sm mt-1">
            {levelFilter !== 'all' ? `No ${levelFilter} level entries found` : 'Logs will appear here when events occur'}
          </p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-auto max-h-[600px]"
        >
          <div className="px-5 py-4 border-b border-slate-700/50 sticky top-0 bg-slate-800/90 backdrop-blur-sm z-10">
            <h2 className="text-sm font-semibold text-white">{filteredLogs.length} Log Entries</h2>
          </div>
          <div className="divide-y divide-slate-700/20">
            {filteredLogs.map((entry, idx) => {
              const level = getLogLevel(entry);
              const colors = LEVEL_COLORS[level] || LEVEL_COLORS.info;
              return (
                <div
                  key={entry.id || idx}
                  className={`px-5 py-3 border-l-2 ${colors.border} hover:bg-slate-700/20 transition-colors`}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs text-slate-500 font-mono">
                      {entry.timestamp ? formatDateTime(entry.timestamp) : '—'}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors.badge}`}>
                      {level.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-200">{getLogMessage(entry)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
