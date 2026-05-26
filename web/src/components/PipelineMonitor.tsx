// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useCallback, Fragment } from 'react';
import { Workflow, RefreshCw } from 'lucide-react';
import { scheduleApi } from '../utils/api';
import { formatRelativeTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';

interface Job {
  id?: string;
  name?: string;
  status?: string;
  stage?: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  progress?: number;
}

const STAGES = ['inspect', 'prepare', 'convert', 'validate', 'deploy'];

function stageIndex(stage: string): number {
  const idx = STAGES.indexOf(stage);
  return idx >= 0 ? idx : -1;
}

export default function PipelineMonitor() {
  const fetchJobs = useCallback(() => scheduleApi.getAllHistory() as Promise<Job[]>, []);
  const { data: jobs, loading, refresh } = usePolling(fetchJobs, 8000);

  const items = jobs || [];

  if (loading && !jobs) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Pipeline Monitor</h1>
        <button onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stage progress for active jobs */}
      {items.filter(j => j.status === 'running').map((job, i) => {
        const currentStage = stageIndex(job.stage || '');
        return (
          <div key={job.id || i} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <Workflow className="w-5 h-5 text-blue-400" />
              <span className="text-sm font-semibold text-white">{job.name || `Job ${job.id || i}`}</span>
              <span className="ml-auto text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">Running</span>
            </div>
            <div className="flex items-center gap-1">
              {STAGES.map((stage, si) => {
                const done = si < currentStage;
                const active = si === currentStage;
                return (
                  <Fragment key={stage}>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                      done ? 'bg-green-500/20 text-green-400' :
                      active ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50' :
                      'bg-slate-700/50 text-slate-500'
                    }`}>
                      {done ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : active ? (
                        <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                      ) : null}
                      {stage}
                    </div>
                    {si < STAGES.length - 1 && (
                      <div className={`w-6 h-0.5 ${done ? 'bg-green-500/50' : 'bg-slate-700'}`} />
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Job table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Workflow className="w-4 h-4 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-white">Pipeline Jobs</h2>
          <span className="ml-auto text-xs font-medium text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">{items.length}</span>
        </div>
        {items.length === 0 ? (
          <div className="p-10 text-center">
            <Workflow className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No pipeline jobs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Job</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Stage</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Progress</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {items.map((job, i) => (
                  <tr key={job.id || i} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-white">{job.name || job.id || `Job ${i}`}</td>
                    <td className="px-4 py-3 text-slate-400 capitalize">{job.stage || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        job.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        job.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
                        job.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                        'bg-slate-500/20 text-slate-400'
                      }`}>{job.status || 'unknown'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${job.progress || 0}%` }} />
                        </div>
                        <span className="text-xs text-slate-400 tabular-nums">{job.progress || 0}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {job.started_at ? formatRelativeTime(job.started_at) : '-'}
                    </td>
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
