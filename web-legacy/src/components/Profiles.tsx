// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import { Settings2, Plus, Trash2 } from 'lucide-react';
import { profileApi } from '../utils/api';
import { Profile } from '../types';
import { formatMemory } from '../utils/format';
import { usePolling } from '../hooks/usePolling';

const inputCls = 'bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none w-full';
const btnPrimary = 'bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors';
const btnDanger = 'bg-red-600 hover:bg-red-500 text-white rounded-lg px-2 py-1.5 text-xs font-medium transition-colors';
const thCls = 'text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider';

export default function Profiles() {
  const { data: profiles, refresh } = usePolling<Profile[]>(
    useCallback(() => profileApi.list() as Promise<Profile[]>, []), 15000
  );

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', cpus: '2', memory: '2048', description: '' });

  const createProfile = async () => {
    if (!form.name) return;
    await profileApi.create({
      name: form.name,
      cpus: parseInt(form.cpus) || 2,
      memory: parseInt(form.memory) || 2048,
      description: form.description || undefined,
    });
    setForm({ name: '', cpus: '2', memory: '2048', description: '' });
    setShowCreate(false);
    refresh();
  };

  const deleteProfile = async (name: string) => {
    await profileApi.delete(name);
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Settings2 className="w-7 h-7 text-blue-400" />
            Profiles
          </h1>
          <p className="text-sm text-slate-400 mt-1">Instance type profiles for VM creation</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className={btnPrimary}>
          <Plus className="w-4 h-4 inline mr-1" />Create Profile
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-sm font-semibold text-white mb-3">Create Profile</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <input
              className={inputCls}
              placeholder="Profile name"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="CPUs"
              type="number"
              min="1"
              value={form.cpus}
              onChange={e => setForm({ ...form, cpus: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="Memory (MB)"
              type="number"
              min="256"
              step="256"
              value={form.memory}
              onChange={e => setForm({ ...form, memory: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="Description (optional)"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
            <button onClick={createProfile} className={btnPrimary}>Create</button>
          </div>
        </div>
      )}

      {/* Profiles Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-700/50">
            <th className={thCls}>Name</th>
            <th className={thCls}>CPUs</th>
            <th className={thCls}>Memory</th>
            <th className={thCls}>Description</th>
            <th className={thCls}>Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-700/30">
            {(profiles || []).length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                <Settings2 className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                No profiles defined yet
              </td></tr>
            ) : (profiles || []).map(p => (
              <tr key={p.name} className="hover:bg-slate-700/20 transition-colors">
                <td className="px-4 py-3 font-medium text-white">{p.name}</td>
                <td className="px-4 py-3">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                    {p.cpus} vCPU
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
                    {formatMemory(p.memory)}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400">{p.description || '-'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => deleteProfile(p.name)} className={btnDanger}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
