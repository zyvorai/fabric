// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import { Plus, Trash2, Send } from 'lucide-react';
import { notificationApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';
import type { NotificationChannel, NotificationRule } from '../types';

export default function Notifications() {
  const [chName, setChName] = useState('');
  const [chType, setChType] = useState('email');
  const [ruleName, setRuleName] = useState('');
  const [ruleEvent, setRuleEvent] = useState('vm.state_change');
  const [ruleChannel, setRuleChannel] = useState('');

  const fetchChannels = useCallback(() => notificationApi.listChannels() as Promise<NotificationChannel[]>, []);
  const fetchRules = useCallback(() => notificationApi.listRules() as Promise<NotificationRule[]>, []);

  const { data: channels, loading: chLoad, refresh: chRefresh } = usePolling<NotificationChannel[]>(fetchChannels, 15000);
  const { data: rules, loading: rLoad, refresh: rRefresh } = usePolling<NotificationRule[]>(fetchRules, 15000);

  const channelList = (channels || []) as NotificationChannel[];
  const ruleList = (rules || []) as NotificationRule[];

  const createChannel = async () => {
    if (!chName.trim()) return;
    try { await notificationApi.createChannel({ name: chName, type: chType, config: {}, enabled: true }); setChName(''); chRefresh(); }
    catch (err) { console.error('Create channel failed:', err); }
  };

  const testChannel = async (id: string) => {
    try { await notificationApi.testChannel(id); } catch (err) { console.error('Test failed:', err); }
  };

  const deleteChannel = async (id: string) => {
    if (!confirm('Delete channel?')) return;
    try { await notificationApi.deleteChannel(id); chRefresh(); } catch (err) { console.error(err); }
  };

  const createRule = async () => {
    if (!ruleName.trim() || !ruleChannel) return;
    try { await notificationApi.createRule({ name: ruleName, event: ruleEvent, channel_id: ruleChannel, enabled: true }); setRuleName(''); rRefresh(); }
    catch (err) { console.error('Create rule failed:', err); }
  };

  const toggleRule = async (r: NotificationRule) => {
    try { r.enabled ? await notificationApi.disableRule(r.id) : await notificationApi.enableRule(r.id); rRefresh(); }
    catch (err) { console.error(err); }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Delete rule?')) return;
    try { await notificationApi.deleteRule(id); rRefresh(); } catch (err) { console.error(err); }
  };

  const loading = chLoad || rLoad;
  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Notifications</h1><p className="text-sm text-slate-400 mt-1">Manage notification channels and routing rules</p></div>

      {/* Create channel */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-semibold text-white mb-3">Add Channel</h3>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs text-slate-400 mb-1">Name</label>
            <input value={chName} onChange={e => setChName(e.target.value)} placeholder="ops-email"
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="min-w-[120px]">
            <label className="block text-xs text-slate-400 mb-1">Type</label>
            <select value={chType} onChange={e => setChType(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500">
              <option value="email">Email</option><option value="slack">Slack</option><option value="webhook">Webhook</option><option value="pagerduty">PagerDuty</option>
            </select>
          </div>
          <button onClick={createChannel} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg flex items-center gap-2">
            <Plus className="w-4 h-4" />Add
          </button>
        </div>
      </div>

      {/* Channels table */}
      {channelList.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700/50"><h3 className="text-sm font-semibold text-white">Channels ({channelList.length})</h3></div>
          <table className="w-full"><thead><tr className="border-b border-slate-700/50">
            {['Name', 'Type', 'Enabled', 'Actions'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-700/30">
            {channelList.map(c => (
              <tr key={c.id} className="hover:bg-slate-700/20">
                <td className="px-4 py-3 text-sm text-white font-medium">{c.name}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{c.type}</td>
                <td className="px-4 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${c.enabled ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}`}>{c.enabled ? 'Yes' : 'No'}</span></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => testChannel(c.id)} className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400" title="Test"><Send className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteChannel(c.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                </div></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {/* Create rule */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-semibold text-white mb-3">Add Rule</h3>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-slate-400 mb-1">Name</label>
            <input value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="vm-alerts"
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs text-slate-400 mb-1">Event</label>
            <select value={ruleEvent} onChange={e => setRuleEvent(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500">
              <option value="vm.state_change">VM State Change</option><option value="backup.completed">Backup Completed</option><option value="alert.fired">Alert Fired</option><option value="migration.completed">Migration Completed</option>
            </select>
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs text-slate-400 mb-1">Channel</label>
            <select value={ruleChannel} onChange={e => setRuleChannel(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500">
              <option value="">Select...</option>
              {channelList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button onClick={createRule} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg flex items-center gap-2">
            <Plus className="w-4 h-4" />Add
          </button>
        </div>
      </div>

      {/* Rules table */}
      {ruleList.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700/50"><h3 className="text-sm font-semibold text-white">Rules ({ruleList.length})</h3></div>
          <table className="w-full"><thead><tr className="border-b border-slate-700/50">
            {['Name', 'Event', 'Channel', 'Enabled', 'Actions'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-700/30">
            {ruleList.map(r => (
              <tr key={r.id} className="hover:bg-slate-700/20">
                <td className="px-4 py-3 text-sm text-white font-medium">{r.name}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{r.event}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{channelList.find(c => c.id === r.channel_id)?.name || r.channel_id}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleRule(r)} className={`relative w-10 h-5 rounded-full transition-colors ${r.enabled ? 'bg-blue-600' : 'bg-slate-600'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${r.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => deleteRule(r.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}
