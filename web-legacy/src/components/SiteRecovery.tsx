// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import { siteRecoveryApi } from '../utils/api';
import { formatDateTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { RecoveryPlan } from '../types';

export default function SiteRecovery() {
  const [planName, setPlanName] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [sourceSite, setSourceSite] = useState('');
  const [targetSite, setTargetSite] = useState('');
  const [planVms, setPlanVms] = useState('');

  const fetchPlans = useCallback(() => siteRecoveryApi.listPlans() as Promise<RecoveryPlan[]>, []);
  const fetchExecutions = useCallback(() => siteRecoveryApi.listExecutions(), []);
  const fetchDashboard = useCallback(() => siteRecoveryApi.getDashboard() as Promise<Record<string, unknown>>, []);

  const { data: plans, refresh: refreshPlans } = usePolling<RecoveryPlan[]>(fetchPlans, 15000);
  const { data: executions, refresh: refreshExecs } = usePolling<unknown[]>(fetchExecutions, 10000);
  const { data: dashboard } = usePolling<Record<string, unknown>>(fetchDashboard, 30000);

  const planList = (plans || []) as RecoveryPlan[];
  const execList = (executions || []) as { id: string; plan_id: string; type: string; status: string; started_at: string }[];

  const handleCreatePlan = async () => {
    if (!planName.trim() || !sourceSite.trim() || !targetSite.trim()) return;
    try {
      await siteRecoveryApi.createPlan({
        name: planName, description: planDescription, source_site: sourceSite, target_site: targetSite,
        vms: planVms.split(',').map(v => v.trim()).filter(Boolean),
      });
      setPlanName(''); setPlanDescription(''); setSourceSite(''); setTargetSite(''); setPlanVms('');
      refreshPlans();
    } catch (err) { console.error('Failed to create plan:', err); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this recovery plan?')) return;
    try { await siteRecoveryApi.deletePlan(id); refreshPlans(); }
    catch (err) { console.error('Failed to delete plan:', err); }
  };

  const handleExecute = async (id: string, type: 'planned' | 'disaster' | 'test') => {
    const fn = type === 'planned' ? siteRecoveryApi.executePlannedMigration
      : type === 'disaster' ? siteRecoveryApi.executeDisasterRecovery
      : siteRecoveryApi.executeTestFailover;
    try { await fn(id); refreshExecs(); }
    catch (err) { console.error(`Failed to execute ${type}:`, err); }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      ready: 'bg-green-500/20 text-green-400', running: 'bg-blue-500/20 text-blue-400',
      completed: 'bg-green-500/20 text-green-400', failed: 'bg-red-500/20 text-red-400',
    };
    return colors[status] || 'bg-slate-500/20 text-slate-400';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Site Recovery</h2>
        <p className="text-sm text-slate-400 mt-1">Disaster recovery plans and failover management</p>
      </div>

      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(dashboard as Record<string, unknown>).slice(0, 4).map(([key, val]) => (
            <div key={key} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <div className="text-sm text-slate-400 capitalize">{key.replace(/_/g, ' ')}</div>
              <div className="text-2xl font-bold text-white mt-1">{String(val)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Create Recovery Plan</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="Plan name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={planDescription} onChange={e => setPlanDescription(e.target.value)} placeholder="Description" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={sourceSite} onChange={e => setSourceSite(e.target.value)} placeholder="Source site" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={targetSite} onChange={e => setTargetSite(e.target.value)} placeholder="Target site" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={planVms} onChange={e => setPlanVms(e.target.value)} placeholder="VMs (comma-separated)" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 md:col-span-2" />
        </div>
        <button onClick={handleCreatePlan} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Create Plan</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Recovery Plans</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400">
            <tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Source</th><th className="px-5 py-3">Target</th><th className="px-5 py-3">VMs</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {planList.map(p => (
              <tr key={p.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white font-medium">{p.name}</td>
                <td className="px-5 py-3">{p.source_site}</td>
                <td className="px-5 py-3">{p.target_site}</td>
                <td className="px-5 py-3">{p.vms.length}</td>
                <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(p.status)}`}>{p.status}</span></td>
                <td className="px-5 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => handleExecute(p.id, 'planned')} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg">Planned</button>
                    <button onClick={() => handleExecute(p.id, 'disaster')} className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">DR</button>
                    <button onClick={() => handleExecute(p.id, 'test')} className="px-2 py-1 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded-lg">Test</button>
                    <button onClick={() => handleDelete(p.id)} className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {planList.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No recovery plans</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Execution History</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400">
            <tr><th className="px-5 py-3">Plan ID</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Started</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {execList.map(e => (
              <tr key={e.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white font-mono text-xs">{e.plan_id}</td>
                <td className="px-5 py-3">{e.type}</td>
                <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(e.status)}`}>{e.status}</span></td>
                <td className="px-5 py-3 text-xs">{formatDateTime(e.started_at)}</td>
              </tr>
            ))}
            {execList.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">No executions</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
