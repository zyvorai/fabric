// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback } from 'react';
import { Clock, RefreshCw, FileText } from 'lucide-react';
import { auditApi } from '../utils/api';
import { formatRelativeTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';

interface Job {
  id?: string;
  name?: string;
  type?: string;
  status?: string;
  progress?: number;
  started_at?: string;
  completed_at?: string;
  message?: string;
  logs?: string[];
}

export default function JobMonitor() {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const fetchJobs = useCallback(() => auditApi.listLogs() as Promise<Job[]>, []);
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
        <h1 className="text-2xl font-bold text-gradient-cyan">Job Monitor</h1>
        <button onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Job table */}
        <div className={`${selectedJob ? 'col-span-12 lg:col-span-7' : 'col-span-12'}`}>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <Clock className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-white">Jobs</h2>
              <span className="ml-auto text-xs font-medium text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">{items.length}</span>
            </div>
            {items.length === 0 ? (
              <div className="p-10 text-center">
                <Clock className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No jobs recorded</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Job</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Progress</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Time</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Logs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {items.map((job, i) => (
                      <tr key={job.id || i}
                        className={`hover:bg-slate-700/20 transition-colors cursor-pointer ${selectedJob?.id === job.id ? 'bg-slate-700/30' : ''}`}
                        onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}>
                        <td className="px-5 py-3 font-medium text-white">{job.name || job.id || `Job ${i}`}</td>
                        <td className="px-4 py-3 text-slate-400">{job.type || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                            job.status === 'completed' || job.status === 'success' ? 'bg-green-500/20 text-green-400' :
                            job.status === 'running' || job.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
                            job.status === 'failed' || job.status === 'error' ? 'bg-red-500/20 text-red-400' :
                            job.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {(job.status === 'running' || job.status === 'in_progress') && (
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                            )}
                            {job.status || 'unknown'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${
                                job.status === 'completed' || job.status === 'success' ? 'bg-green-500' :
                                job.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'
                              }`} style={{ width: `${job.progress || (job.status === 'completed' ? 100 : 0)}%` }} />
                            </div>
                            <span className="text-xs text-slate-400 tabular-nums w-8">
                              {job.progress || (job.status === 'completed' ? 100 : 0)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {job.started_at ? formatRelativeTime(job.started_at) : '-'}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <FileText className="w-4 h-4 text-slate-500 inline-block" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Log viewer */}
        {selectedJob && (
          <div className="col-span-12 lg:col-span-5">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden sticky top-4">
              <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-semibold text-white">{selectedJob.name || selectedJob.id}</span>
                </div>
                <button onClick={() => setSelectedJob(null)} className="text-slate-400 hover:text-white transition-colors text-xs">Close</button>
              </div>
              <div className="p-3 text-xs space-y-1">
                <div className="flex justify-between text-slate-400 pb-2 border-b border-slate-700/30">
                  <span>Status: <span className="text-white">{selectedJob.status}</span></span>
                  <span>Progress: <span className="text-white">{selectedJob.progress || 0}%</span></span>
                </div>
                {selectedJob.message && (
                  <div className="text-slate-300 py-1">{selectedJob.message}</div>
                )}
              </div>
              <div className="bg-slate-900 p-3 max-h-72 overflow-y-auto font-mono text-xs">
                {(selectedJob.logs && selectedJob.logs.length > 0) ? (
                  selectedJob.logs.map((line, i) => (
                    <div key={i} className="text-slate-400 leading-5">{line}</div>
                  ))
                ) : (
                  <div className="text-slate-500 text-center py-4">No log output available</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
