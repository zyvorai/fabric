// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useMemo } from 'react';
import { Filter } from 'lucide-react';
import { eventApi } from '../utils/api';
import { SystemEvent } from '../types';
import { usePolling } from '../hooks/usePolling';
import { formatRelativeTime } from '../utils/format';

type LevelFilter = 'all' | 'info' | 'warning' | 'error';

function getSeverityDot(severity: string) {
  switch (severity.toLowerCase()) {
    case 'error': case 'critical': return 'bg-red-500';
    case 'warning': case 'warn': return 'bg-yellow-500';
    case 'info': return 'bg-blue-500';
    default: return 'bg-slate-500';
  }
}

function getSeverityBg(severity: string) {
  switch (severity.toLowerCase()) {
    case 'error': case 'critical': return 'border-l-red-500/50';
    case 'warning': case 'warn': return 'border-l-yellow-500/50';
    case 'info': return 'border-l-blue-500/50';
    default: return 'border-l-slate-500/50';
  }
}

export default function EventStream() {
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');

  const { data: rawEvents, loading } = usePolling<SystemEvent[]>(
    () => eventApi.list() as Promise<SystemEvent[]>,
    3000
  );

  const events: SystemEvent[] = rawEvents || [];

  const filtered = useMemo(() => {
    if (levelFilter === 'all') return events;
    return events.filter((e) => {
      const s = e.severity.toLowerCase();
      if (levelFilter === 'error') return s === 'error' || s === 'critical';
      if (levelFilter === 'warning') return s === 'warning' || s === 'warn';
      return s === levelFilter;
    });
  }, [events, levelFilter]);

  if (loading && events.length === 0) {
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
          <h1 className="text-2xl font-bold text-white">Event Stream</h1>
          <p className="text-sm text-slate-400 mt-1">Live system events (auto-refresh every 3s)</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-green-400">Live</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-slate-400" />
        {(['all', 'info', 'warning', 'error'] as LevelFilter[]).map((level) => (
          <button
            key={level}
            onClick={() => setLevelFilter(level)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              levelFilter === level
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800/50 text-slate-400 hover:text-white border border-slate-700/50'
            }`}
          >
            {level.charAt(0).toUpperCase() + level.slice(1)}
          </button>
        ))}
        <span className="ml-auto text-sm text-slate-400">{filtered.length} events</span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          No events found
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((event, idx) => (
            <div
              key={event.id || idx}
              className={`bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 border-l-4 ${getSeverityBg(event.severity)} hover:bg-slate-700/30 transition-colors`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${getSeverityDot(event.severity)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{event.type}</span>
                      <span className="text-xs text-slate-500">{event.source}</span>
                    </div>
                    <span className="text-xs text-slate-500 flex-shrink-0">{formatRelativeTime(event.timestamp)}</span>
                  </div>
                  <p className="text-sm text-slate-300 mt-1">{event.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
