// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import { faultToleranceApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';
import type { FTConfig } from '../types';

export default function FaultTolerance() {
  const [enableVm, setEnableVm] = useState('');
  const [secondaryHost, setSecondaryHost] = useState('');
  const [checkVm, setCheckVm] = useState('');
  const [compatibility, setCompatibility] = useState<unknown>(null);
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [metricsVm, setMetricsVm] = useState('');

  const fetchFTVms = useCallback(() => faultToleranceApi.list() as Promise<FTConfig[]>, []);
  const { data, loading, refresh } = usePolling<FTConfig[]>(fetchFTVms, 10000);
  const ftVms = (data || []) as FTConfig[];

  const handleEnable = async () => {
    if (!enableVm.trim() || !secondaryHost.trim()) return;
    try {
      await faultToleranceApi.enable({ vm_name: enableVm, secondary_host: secondaryHost });
      setEnableVm(''); setSecondaryHost('');
      refresh();
    } catch (err) { console.error('Failed to enable FT:', err); }
  };

  const handleDisable = async (name: string) => {
    if (!confirm(`Disable fault tolerance for ${name}?`)) return;
    try { await faultToleranceApi.disable(name); refresh(); }
    catch (err) { console.error('Failed to disable FT:', err); }
  };

  const handleFailover = async (name: string) => {
    if (!confirm(`Trigger failover for ${name}?`)) return;
    try { await faultToleranceApi.triggerFailover(name); refresh(); }
    catch (err) { console.error('Failed to trigger failover:', err); }
  };

  const handleTestFailover = async (name: string) => {
    try { await faultToleranceApi.testFailover(name); refresh(); }
    catch (err) { console.error('Failed to test failover:', err); }
  };

  const handleCheckCompatibility = async () => {
    if (!checkVm.trim()) return;
    try {
      const result = await faultToleranceApi.checkCompatibility(checkVm);
      setCompatibility(result);
    } catch (err) { console.error('Failed to check compatibility:', err); }
  };

  const handleLoadMetrics = async () => {
    if (!metricsVm.trim()) return;
    try {
      const result = await faultToleranceApi.getMetrics(metricsVm);
      setMetrics(result as Record<string, unknown>);
    } catch (err) { console.error('Failed to load metrics:', err); }
  };

  const getStateBadge = (state: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-500/20 text-green-400',
      syncing: 'bg-blue-500/20 text-blue-400',
      error: 'bg-red-500/20 text-red-400',
      suspended: 'bg-yellow-500/20 text-yellow-400',
    };
    return colors[state] || 'bg-slate-500/20 text-slate-400';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Fault Tolerance</h2>
        <p className="text-sm text-slate-400 mt-1">Manage VM fault tolerance and failover</p>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Enable Fault Tolerance</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input value={enableVm} onChange={e => setEnableVm(e.target.value)} placeholder="VM name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={secondaryHost} onChange={e => setSecondaryHost(e.target.value)} placeholder="Secondary host" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={handleEnable} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Enable FT</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">FT-Protected VMs</h3></div>
        {loading && ftVms.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-500">Loading...</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-900/50 text-slate-400">
              <tr><th className="px-5 py-3">VM</th><th className="px-5 py-3">Secondary Host</th><th className="px-5 py-3">State</th><th className="px-5 py-3">Lag</th><th className="px-5 py-3">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {ftVms.map(ft => (
                <tr key={ft.vm_name} className="text-slate-300 hover:bg-slate-700/30">
                  <td className="px-5 py-3 text-white font-medium">{ft.vm_name}</td>
                  <td className="px-5 py-3">{ft.secondary_host}</td>
                  <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStateBadge(ft.state)}`}>{ft.state}</span></td>
                  <td className="px-5 py-3">{ft.lag_seconds}s</td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => handleFailover(ft.vm_name)} className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Failover</button>
                      <button onClick={() => handleTestFailover(ft.vm_name)} className="px-2 py-1 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded-lg">Test</button>
                      <button onClick={() => handleDisable(ft.vm_name)} className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Disable</button>
                    </div>
                  </td>
                </tr>
              ))}
              {ftVms.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No FT-protected VMs</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-lg font-semibold text-white mb-4">Compatibility Check</h3>
          <div className="flex gap-2">
            <input value={checkVm} onChange={e => setCheckVm(e.target.value)} placeholder="VM name" className="flex-1 bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
            <button onClick={handleCheckCompatibility} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg">Check</button>
          </div>
          {compatibility !== null && (
            <pre className="mt-3 text-xs text-slate-300 bg-slate-900/50 rounded-lg p-3 overflow-auto max-h-32">{JSON.stringify(compatibility, null, 2)}</pre>
          )}
        </div>

        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-lg font-semibold text-white mb-4">FT Metrics</h3>
          <div className="flex gap-2">
            <input value={metricsVm} onChange={e => setMetricsVm(e.target.value)} placeholder="VM name" className="flex-1 bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
            <button onClick={handleLoadMetrics} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg">Load</button>
          </div>
          {metrics && (
            <div className="mt-3 space-y-2">
              {Object.entries(metrics).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-slate-400 capitalize">{k.replace(/_/g, ' ')}</span>
                  <span className="text-white">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
