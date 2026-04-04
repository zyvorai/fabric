import { useState, useCallback } from 'react';
import { drsApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';
import type { DRSConfig, DRSRecommendation, AffinityRule } from '../types';

export default function DRS() {
  const [clusterId, setClusterId] = useState('');
  const [automationLevel, setAutomationLevel] = useState('manual');
  const [threshold, setThreshold] = useState(3);
  const [ruleName, setRuleName] = useState('');
  const [ruleType, setRuleType] = useState('affinity');
  const [ruleVms, setRuleVms] = useState('');

  const fetchConfig = useCallback(
    () => (clusterId ? drsApi.getConfig(clusterId) as Promise<DRSConfig> : Promise.resolve(null)),
    [clusterId]
  );
  const fetchRecs = useCallback(
    () => (clusterId ? drsApi.listRecommendations(clusterId) as Promise<DRSRecommendation[]> : Promise.resolve([])),
    [clusterId]
  );
  const fetchRules = useCallback(() => drsApi.listAffinityRules() as Promise<AffinityRule[]>, []);

  const { data: config, refresh: refreshConfig } = usePolling<DRSConfig | null>(fetchConfig, 15000, !!clusterId);
  const { data: recs, refresh: refreshRecs } = usePolling<DRSRecommendation[]>(fetchRecs, 10000, !!clusterId);
  const { data: rules, refresh: refreshRules } = usePolling<AffinityRule[]>(fetchRules, 15000);

  const recommendations = (recs || []) as DRSRecommendation[];
  const affinityRules = (rules || []) as AffinityRule[];

  const handleSaveConfig = async () => {
    if (!clusterId) return;
    try {
      await drsApi.configure({ cluster_id: clusterId, enabled: true, automation_level: automationLevel, migration_threshold: threshold });
      refreshConfig();
    } catch (err) { console.error('Failed to save DRS config:', err); }
  };

  const handleApprove = async (id: string) => {
    try { await drsApi.approveRecommendation(id); refreshRecs(); }
    catch (err) { console.error('Failed to approve:', err); }
  };

  const handleReject = async (id: string) => {
    try { await drsApi.rejectRecommendation(id); refreshRecs(); }
    catch (err) { console.error('Failed to reject:', err); }
  };

  const handleCreateRule = async () => {
    if (!ruleName.trim()) return;
    try {
      await drsApi.createAffinityRule({ name: ruleName, type: ruleType, vms: ruleVms.split(',').map(v => v.trim()).filter(Boolean), enabled: true });
      setRuleName(''); setRuleVms('');
      refreshRules();
    } catch (err) { console.error('Failed to create rule:', err); }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Delete this affinity rule?')) return;
    try { await drsApi.deleteAffinityRule(id); refreshRules(); }
    catch (err) { console.error('Failed to delete rule:', err); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Distributed Resource Scheduler</h2>
        <p className="text-sm text-slate-400 mt-1">Configure DRS and manage placement recommendations</p>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">DRS Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Cluster ID</label>
            <input value={clusterId} onChange={e => setClusterId(e.target.value)} placeholder="cluster-1" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Automation Level</label>
            <select value={automationLevel} onChange={e => setAutomationLevel(e.target.value)} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500">
              <option value="manual">Manual</option>
              <option value="partially_automated">Partially Automated</option>
              <option value="fully_automated">Fully Automated</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Migration Threshold</label>
            <input type="number" min={1} max={5} value={threshold} onChange={e => setThreshold(Number(e.target.value))} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        {config && <p className="text-xs text-slate-500 mt-2">Current: {(config as DRSConfig).automation_level}, threshold {(config as DRSConfig).migration_threshold}</p>}
        <button onClick={handleSaveConfig} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Save Configuration</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50">
          <h3 className="text-lg font-semibold text-white">Recommendations</h3>
        </div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400">
            <tr>
              <th className="px-5 py-3">VM</th><th className="px-5 py-3">Source</th><th className="px-5 py-3">Target</th>
              <th className="px-5 py-3">Reason</th><th className="px-5 py-3">Priority</th><th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {recommendations.map(r => (
              <tr key={r.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white font-medium">{r.vm_name}</td>
                <td className="px-5 py-3">{r.source_host}</td>
                <td className="px-5 py-3">{r.target_host}</td>
                <td className="px-5 py-3">{r.reason}</td>
                <td className="px-5 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">{r.priority}</span></td>
                <td className="px-5 py-3 space-x-2">
                  <button onClick={() => handleApprove(r.id)} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg">Approve</button>
                  <button onClick={() => handleReject(r.id)} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Reject</button>
                </td>
              </tr>
            ))}
            {recommendations.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No recommendations</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Create Affinity Rule</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="Rule name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <select value={ruleType} onChange={e => setRuleType(e.target.value)} className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500">
            <option value="affinity">Affinity</option>
            <option value="anti-affinity">Anti-Affinity</option>
          </select>
          <input value={ruleVms} onChange={e => setRuleVms(e.target.value)} placeholder="vm1, vm2, vm3" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={handleCreateRule} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Create Rule</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Affinity Rules</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400">
            <tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">VMs</th><th className="px-5 py-3">Enabled</th><th className="px-5 py-3">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {affinityRules.map(r => (
              <tr key={r.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white font-medium">{r.name}</td>
                <td className="px-5 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">{r.type}</span></td>
                <td className="px-5 py-3">{r.vms.join(', ')}</td>
                <td className="px-5 py-3">{r.enabled ? 'Yes' : 'No'}</td>
                <td className="px-5 py-3">
                  <button onClick={() => handleDeleteRule(r.id)} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Delete</button>
                </td>
              </tr>
            ))}
            {affinityRules.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No affinity rules</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
