// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback } from 'react';
import { lifecycleApi } from '../utils/api';
import { formatDateTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { LifecycleBaseline } from '../types';

export default function LifecycleManager() {
  const [blName, setBlName] = useState('');
  const [blType, setBlType] = useState('patch');
  const [blDesc, setBlDesc] = useState('');
  const [blPackages, setBlPackages] = useState('');
  const [scanHostId, setScanHostId] = useState('');
  const [scanBaselineId, setScanBaselineId] = useState('');
  const [complianceResult, setComplianceResult] = useState<unknown>(null);

  const fetchBaselines = useCallback(() => lifecycleApi.listBaselines() as Promise<LifecycleBaseline[]>, []);
  const fetchRemediations = useCallback(() => lifecycleApi.listRemediations(), []);
  const fetchRollingUpdates = useCallback(() => lifecycleApi.listRollingUpdates(), []);

  const { data: blData, refresh: refreshBaselines } = usePolling<LifecycleBaseline[]>(fetchBaselines, 15000);
  const { data: remData, refresh: refreshRem } = usePolling<unknown[]>(fetchRemediations, 10000);
  const { data: ruData, refresh: refreshRU } = usePolling<unknown[]>(fetchRollingUpdates, 10000);

  const baselines = (blData || []) as LifecycleBaseline[];
  const remediations = (remData || []) as { id: string; host_id: string; baseline_id: string; status: string; started_at: string }[];
  const rollingUpdates = (ruData || []) as { id: string; name: string; status: string; progress: number }[];

  const handleCreateBaseline = async () => {
    if (!blName.trim()) return;
    try {
      await lifecycleApi.createBaseline({ name: blName, type: blType, description: blDesc, packages: blPackages.split(',').map(p => p.trim()).filter(Boolean) });
      setBlName(''); setBlDesc(''); setBlPackages('');
      refreshBaselines();
    } catch (err) { console.error('Failed to create baseline:', err); }
  };

  const handleDeleteBaseline = async (id: string) => {
    if (!confirm('Delete this baseline?')) return;
    try { await lifecycleApi.deleteBaseline(id); refreshBaselines(); }
    catch (err) { console.error('Failed to delete baseline:', err); }
  };

  const handleScanCompliance = async () => {
    if (!scanHostId.trim() || !scanBaselineId.trim()) return;
    try {
      const result = await lifecycleApi.scanCompliance({ host_id: scanHostId, baseline_id: scanBaselineId });
      setComplianceResult(result);
      refreshRem();
    } catch (err) { console.error('Failed to scan:', err); }
  };

  const handleStartRollingUpdate = async (id: string) => {
    try { await lifecycleApi.startRollingUpdate(id); refreshRU(); }
    catch (err) { console.error('Failed to start rolling update:', err); }
  };

  const handlePauseRollingUpdate = async (id: string) => {
    try { await lifecycleApi.pauseRollingUpdate(id); refreshRU(); }
    catch (err) { console.error('Failed to pause:', err); }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      compliant: 'bg-green-500/20 text-green-400', completed: 'bg-green-500/20 text-green-400',
      'non-compliant': 'bg-red-500/20 text-red-400', failed: 'bg-red-500/20 text-red-400',
      running: 'bg-blue-500/20 text-blue-400', pending: 'bg-yellow-500/20 text-yellow-400',
      paused: 'bg-yellow-500/20 text-yellow-400',
    };
    return colors[status] || 'bg-slate-500/20 text-slate-400';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Lifecycle Manager</h2>
        <p className="text-sm text-slate-400 mt-1">Baselines, compliance scanning, and rolling updates</p>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Create Baseline</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input value={blName} onChange={e => setBlName(e.target.value)} placeholder="Baseline name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <select value={blType} onChange={e => setBlType(e.target.value)} className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500">
            <option value="patch">Patch</option><option value="upgrade">Upgrade</option><option value="extension">Extension</option>
          </select>
          <input value={blDesc} onChange={e => setBlDesc(e.target.value)} placeholder="Description" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={blPackages} onChange={e => setBlPackages(e.target.value)} placeholder="Packages (comma-separated)" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={handleCreateBaseline} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Create Baseline</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Baselines</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400"><tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Description</th><th className="px-5 py-3">Packages</th><th className="px-5 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-700/50">
            {baselines.map(b => (
              <tr key={b.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white font-medium">{b.name}</td>
                <td className="px-5 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">{b.type}</span></td>
                <td className="px-5 py-3">{b.description || '-'}</td>
                <td className="px-5 py-3 text-xs">{b.packages.join(', ') || '-'}</td>
                <td className="px-5 py-3"><button onClick={() => handleDeleteBaseline(b.id)} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Delete</button></td>
              </tr>
            ))}
            {baselines.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No baselines</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Compliance Scan</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input value={scanHostId} onChange={e => setScanHostId(e.target.value)} placeholder="Host ID" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={scanBaselineId} onChange={e => setScanBaselineId(e.target.value)} placeholder="Baseline ID" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={handleScanCompliance} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Scan</button>
        {complianceResult !== null && (
          <pre className="mt-3 text-xs text-slate-300 bg-slate-900/50 rounded-lg p-3 overflow-auto max-h-32">{JSON.stringify(complianceResult, null, 2)}</pre>
        )}
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Remediations</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400"><tr><th className="px-5 py-3">Host</th><th className="px-5 py-3">Baseline</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Started</th></tr></thead>
          <tbody className="divide-y divide-slate-700/50">
            {remediations.map(r => (
              <tr key={r.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white">{r.host_id}</td>
                <td className="px-5 py-3 font-mono text-xs">{r.baseline_id}</td>
                <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(r.status)}`}>{r.status}</span></td>
                <td className="px-5 py-3 text-xs">{formatDateTime(r.started_at)}</td>
              </tr>
            ))}
            {remediations.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">No remediations</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Rolling Updates</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400"><tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Progress</th><th className="px-5 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-700/50">
            {rollingUpdates.map(ru => (
              <tr key={ru.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white font-medium">{ru.name}</td>
                <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(ru.status)}`}>{ru.status}</span></td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${ru.progress}%` }} /></div>
                    <span className="text-xs">{ru.progress}%</span>
                  </div>
                </td>
                <td className="px-5 py-3 space-x-1">
                  <button onClick={() => handleStartRollingUpdate(ru.id)} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg">Start</button>
                  <button onClick={() => handlePauseRollingUpdate(ru.id)} className="px-2 py-1 bg-yellow-600 hover:bg-yellow-500 text-white text-xs rounded-lg">Pause</button>
                </td>
              </tr>
            ))}
            {rollingUpdates.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">No rolling updates</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
