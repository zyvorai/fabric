// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import { Bell, AlertTriangle, Info, AlertCircle, X } from 'lucide-react';
import { notificationApi } from '../utils/api';
import { formatRelativeTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';

interface Notification {
  id: string;
  title: string;
  message: string;
  severity: string;
  type: string;
  timestamp: string;
  read?: boolean;
}

export default function NotificationCenter() {
  const [filter, setFilter] = useState('all');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const fetchHistory = useCallback(() => notificationApi.getHistory() as Promise<Notification[]>, []);
  const { data: history, loading } = usePolling<Notification[]>(fetchHistory, 10000);

  const notifications = (history || []) as Notification[];
  const filtered = notifications.filter(n => {
    if (dismissed.has(n.id)) return false;
    if (filter === 'all') return true;
    return n.severity === filter || n.type === filter;
  });

  const dismiss = (id: string) => setDismissed(prev => new Set(prev).add(id));
  const dismissAll = () => setDismissed(new Set(notifications.map(n => n.id)));

  const severityIcon = (sev: string) => {
    switch (sev) {
      case 'critical': case 'error': return <AlertCircle className="w-5 h-5 text-red-400" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'info': return <Info className="w-5 h-5 text-blue-400" />;
      default: return <Bell className="w-5 h-5 text-slate-400" />;
    }
  };

  const severityBorder = (sev: string) => {
    switch (sev) {
      case 'critical': case 'error': return 'border-l-red-500';
      case 'warning': return 'border-l-yellow-500';
      case 'info': return 'border-l-blue-500';
      default: return 'border-l-slate-500';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Notification Center</h1>
          <p className="text-sm text-slate-400 mt-1">View and manage notification history</p>
        </div>
        {filtered.length > 0 && (
          <button onClick={dismissAll} className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white text-sm font-medium rounded-lg">
            Dismiss All
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'critical', 'warning', 'info'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-slate-800/50 text-slate-400 hover:text-white border border-slate-700/50'}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>No notifications</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => (
            <div key={n.id} className={`bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 border-l-4 ${severityBorder(n.severity)} flex items-start gap-3`}>
              <div className="mt-0.5 shrink-0">{severityIcon(n.severity)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">{n.title}</p>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    n.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                    n.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>{n.severity}</span>
                </div>
                <p className="text-sm text-slate-400 mt-0.5">{n.message}</p>
                <p className="text-xs text-slate-500 mt-1">{n.timestamp ? formatRelativeTime(n.timestamp) : ''}</p>
              </div>
              <button onClick={() => dismiss(n.id)} className="p-1 rounded-lg hover:bg-slate-700/50 text-slate-500 hover:text-white shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
