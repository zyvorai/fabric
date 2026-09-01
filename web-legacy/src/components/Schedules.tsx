// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import { Clock, Plus, Trash2, Play } from 'lucide-react';
import { scheduleApi } from '../utils/api';
import { formatDateTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { Schedule } from '../types';

export default function Schedules() {
  const [name, setName] = useState('');
  const [action, setAction] = useState('start');
  const [cron, setCron] = useState('0 * * * *');
  const [target, setTarget] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchSchedules = useCallback(() => scheduleApi.list() as Promise<Schedule[]>, []);
  const fetchHistory = useCallback(() => scheduleApi.getAllHistory(), []);

  const { data: schedules, loading, refresh } = usePolling<Schedule[]>(fetchSchedules, 10000);
  const { data: history } = usePolling<unknown[]>(fetchHistory, 15000);

  const scheduleList = (schedules || []) as Schedule[];
  const historyList = (history || []) as Array<Record<string, unknown>>;

  const handleCreate = async () => {
    if (!name.trim() || !target.trim()) return;
    setCreating(true);
    try { await scheduleApi.create({ name, action, cron, target }); setName(''); setTarget(''); refresh(); }
    catch (err) { console.error('Create failed:', err); }
    finally { setCreating(false); }
  };

  const handleToggle = async (s: Schedule) => {
    try { s.enabled ? await scheduleApi.disable(s.id) : await scheduleApi.enable(s.id); refresh(); }
    catch (err) { console.error('Toggle failed:', err); }
  };

  const handleRun = async (id: string) => {
    try { await scheduleApi.run(id); refresh(); } catch (err) { console.error('Run failed:', err); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete schedule?')) return;
    try { await scheduleApi.delete(id); refresh(); } catch (err) { console.error(err); }
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Schedules</h1><p className="text-sm text-slate-400 mt-1">Manage scheduled VM operations</p></div>

      {/* Create */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-semibold text-white mb-3">New Schedule</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className="block text-xs text-slate-400 mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="nightly-stop"
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Action</label>
            <select value={action} onChange={e => setAction(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500">
              <option value="start">Start</option><option value="stop">Stop</option><option value="restart">Restart</option><option value="snapshot">Snapshot</option><option value="backup">Backup</option>
            </select></div>
          <div><label className="block text-xs text-slate-400 mb-1">Cron</label>
            <input value={cron} onChange={e => setCron(e.target.value)} placeholder="0 * * * *"
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white font-mono focus:ring-2 focus:ring-blue-500" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Target VM</label>
            <input value={target} onChange={e => setTarget(e.target.value)} placeholder="my-vm"
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" /></div>
        </div>
        <button onClick={handleCreate} disabled={creating || !name.trim() || !target.trim()}
          className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
          <Plus className="w-4 h-4" />{creating ? 'Creating...' : 'Create'}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : scheduleList.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500"><Clock className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>No schedules</p></div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full"><thead><tr className="border-b border-slate-700/50">
            {['Name', 'Action', 'Cron', 'Target', 'Last Run', 'Next Run', 'Enabled', 'Actions'].map(h =>
              <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-700/30">
            {scheduleList.map(s => (
              <tr key={s.id} className="hover:bg-slate-700/20">
                <td className="px-4 py-3 text-sm text-white font-medium">{s.name}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{s.action}</td>
                <td className="px-4 py-3 text-sm text-slate-300 font-mono">{s.cron}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{s.target}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{s.last_run ? formatDateTime(s.last_run) : '-'}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{s.next_run ? formatDateTime(s.next_run) : '-'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleToggle(s)} className={`relative w-10 h-5 rounded-full transition-colors ${s.enabled ? 'bg-blue-600' : 'bg-slate-600'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${s.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => handleRun(s.id)} className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400" title="Run Now"><Play className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                </div></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {/* History */}
      {historyList.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700/50"><h3 className="text-sm font-semibold text-white">Recent History</h3></div>
          <div className="divide-y divide-slate-700/30 max-h-60 overflow-y-auto">
            {historyList.slice(0, 20).map((h, i) => (
              <div key={i} className="px-4 py-2 flex items-center justify-between hover:bg-slate-700/20">
                <span className="text-sm text-slate-300">{String((h as any).schedule_name || (h as any).action || 'unknown')}</span>
                <span className="text-xs text-slate-500">{(h as any).executed_at ? formatDateTime((h as any).executed_at) : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
