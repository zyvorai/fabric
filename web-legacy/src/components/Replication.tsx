// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import { replicationApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';
import type { ReplicationSite, ReplicationConfig } from '../types';

export default function Replication() {
  const [siteName, setSiteName] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [configVm, setConfigVm] = useState('');
  const [configSite, setConfigSite] = useState('');
  const [configRpo, setConfigRpo] = useState(15);

  const fetchSites = useCallback(() => replicationApi.listSites() as Promise<ReplicationSite[]>, []);
  const fetchConfigs = useCallback(() => replicationApi.listConfigs() as Promise<ReplicationConfig[]>, []);

  const { data: sitesData, refresh: refreshSites } = usePolling<ReplicationSite[]>(fetchSites, 15000);
  const { data: configsData, refresh: refreshConfigs } = usePolling<ReplicationConfig[]>(fetchConfigs, 10000);

  const sites = (sitesData || []) as ReplicationSite[];
  const configs = (configsData || []) as ReplicationConfig[];

  const handleRegisterSite = async () => {
    if (!siteName.trim() || !siteAddress.trim()) return;
    try {
      await replicationApi.registerSite({ name: siteName, address: siteAddress });
      setSiteName(''); setSiteAddress('');
      refreshSites();
    } catch (err) { console.error('Failed to register site:', err); }
  };

  const handleRemoveSite = async (id: string) => {
    if (!confirm('Remove this site?')) return;
    try { await replicationApi.removeSite(id); refreshSites(); }
    catch (err) { console.error('Failed to remove site:', err); }
  };

  const handleCreateConfig = async () => {
    if (!configVm.trim() || !configSite.trim()) return;
    try {
      await replicationApi.createConfig({ vm_name: configVm, target_site: configSite, rpo_minutes: configRpo });
      setConfigVm(''); setConfigSite('');
      refreshConfigs();
    } catch (err) { console.error('Failed to create config:', err); }
  };

  const handlePause = async (id: string) => {
    try { await replicationApi.pauseConfig(id); refreshConfigs(); }
    catch (err) { console.error('Failed to pause:', err); }
  };

  const handleResume = async (id: string) => {
    try { await replicationApi.resumeConfig(id); refreshConfigs(); }
    catch (err) { console.error('Failed to resume:', err); }
  };

  const getStateBadge = (state: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-500/20 text-green-400',
      paused: 'bg-yellow-500/20 text-yellow-400',
      error: 'bg-red-500/20 text-red-400',
    };
    return colors[state] || 'bg-slate-500/20 text-slate-400';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Replication</h2>
        <p className="text-sm text-slate-400 mt-1">Manage sites and replication configurations</p>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Register Site</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input value={siteName} onChange={e => setSiteName(e.target.value)} placeholder="Site name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={siteAddress} onChange={e => setSiteAddress(e.target.value)} placeholder="Address (e.g., https://site-b:8080)" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={handleRegisterSite} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Register Site</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Sites</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400">
            <tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Address</th><th className="px-5 py-3">State</th><th className="px-5 py-3">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {sites.map(s => (
              <tr key={s.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white font-medium">{s.name}</td>
                <td className="px-5 py-3">{s.address}</td>
                <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStateBadge(s.state)}`}>{s.state}</span></td>
                <td className="px-5 py-3">
                  <button onClick={() => handleRemoveSite(s.id)} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Remove</button>
                </td>
              </tr>
            ))}
            {sites.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">No sites registered</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Configure Replication</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input value={configVm} onChange={e => setConfigVm(e.target.value)} placeholder="VM name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={configSite} onChange={e => setConfigSite(e.target.value)} placeholder="Target site ID" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input type="number" value={configRpo} onChange={e => setConfigRpo(Number(e.target.value))} placeholder="RPO (minutes)" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={handleCreateConfig} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Create Config</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Replication Configs</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400">
            <tr><th className="px-5 py-3">VM</th><th className="px-5 py-3">Target Site</th><th className="px-5 py-3">RPO</th><th className="px-5 py-3">State</th><th className="px-5 py-3">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {configs.map(c => (
              <tr key={c.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white font-medium">{c.vm_name}</td>
                <td className="px-5 py-3">{c.target_site}</td>
                <td className="px-5 py-3">{c.rpo_minutes} min</td>
                <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStateBadge(c.state)}`}>{c.state}</span></td>
                <td className="px-5 py-3 space-x-2">
                  {c.state === 'active' ? (
                    <button onClick={() => handlePause(c.id)} className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-white text-xs rounded-lg">Pause</button>
                  ) : (
                    <button onClick={() => handleResume(c.id)} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg">Resume</button>
                  )}
                </td>
              </tr>
            ))}
            {configs.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No replication configs</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
