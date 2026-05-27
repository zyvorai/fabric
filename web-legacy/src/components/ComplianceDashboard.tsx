// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useCallback } from 'react';
import { ClipboardCheck, CheckCircle, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { lifecycleApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';

interface Baseline {
  id?: string;
  name?: string;
  description?: string;
  status?: string;
  compliance_pct?: number;
  last_scan?: string;
  non_compliant_items?: { name: string; reason: string }[];
}

export default function ComplianceDashboard() {
  const fetchBaselines = useCallback(() => lifecycleApi.listBaselines() as Promise<Baseline[]>, []);
  const { data: baselines, loading, refresh } = usePolling(fetchBaselines, 30000);

  const items = baselines || [];
  const compliant = items.filter(b => b.status === 'compliant').length;
  const nonCompliant = items.filter(b => b.status === 'non_compliant').length;
  const unknown = items.filter(b => !b.status || b.status === 'unknown').length;

  const handleScan = async (id: string) => {
    try {
      await lifecycleApi.scanCompliance({ baseline_id: id });
      refresh();
    } catch { /* ignore */ }
  };

  if (loading && !baselines) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Compliance Dashboard</h1>
        <button onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card-green rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-sm font-medium text-green-400">Compliant</span>
          </div>
          <div className="text-2xl font-bold text-white">{compliant}</div>
        </div>
        <div className="stat-card-red rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center gap-3 mb-2">
            <XCircle className="w-5 h-5 text-red-400" />
            <span className="text-sm font-medium text-red-400">Non-Compliant</span>
          </div>
          <div className="text-2xl font-bold text-white">{nonCompliant}</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="w-5 h-5 text-slate-400" />
            <span className="text-sm font-medium text-slate-400">Unknown</span>
          </div>
          <div className="text-2xl font-bold text-white">{unknown}</div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <ClipboardCheck className="w-4 h-4 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-white">Policy Compliance</h2>
        </div>
        {items.length === 0 ? (
          <div className="p-10 text-center">
            <ClipboardCheck className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No compliance baselines configured</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Policy</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Compliance</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Description</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {items.map((b, i) => (
                  <tr key={b.id || i} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-white">{b.name || `Baseline ${i + 1}`}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                        b.status === 'compliant' ? 'bg-green-500/20 text-green-400' :
                        b.status === 'non_compliant' ? 'bg-red-500/20 text-red-400' :
                        'bg-slate-500/20 text-slate-400'
                      }`}>
                        {b.status === 'compliant' ? <CheckCircle className="w-3 h-3" /> :
                         b.status === 'non_compliant' ? <XCircle className="w-3 h-3" /> :
                         <AlertTriangle className="w-3 h-3" />}
                        {b.status || 'unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${
                            (b.compliance_pct || 0) >= 90 ? 'bg-green-500' :
                            (b.compliance_pct || 0) >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                          }`} style={{ width: `${b.compliance_pct || 0}%` }} />
                        </div>
                        <span className="text-xs text-slate-400 tabular-nums">{b.compliance_pct || 0}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{b.description || '-'}</td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => b.id && handleScan(b.id)}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Scan</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {items.some(b => b.non_compliant_items && b.non_compliant_items.length > 0) && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-base font-semibold text-white mb-3">Non-Compliant Items</h3>
          <div className="space-y-2">
            {items.flatMap(b => (b.non_compliant_items || []).map((item, j) => (
              <div key={`${b.id}-${j}`} className="flex items-center gap-3 text-sm p-2 bg-red-500/5 rounded-lg border border-red-500/10">
                <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="text-white font-medium">{item.name}</span>
                <span className="text-slate-400">{item.reason}</span>
              </div>
            )))}
          </div>
        </div>
      )}
    </div>
  );
}
