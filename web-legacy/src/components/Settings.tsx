// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback, useEffect } from 'react';
import { Settings as SettingsIcon, Save, RotateCcw } from 'lucide-react';
import { settingsApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';
import type { AppSettings } from '../types';

export default function Settings() {
  const fetchSettings = useCallback(() => settingsApi.get() as Promise<AppSettings>, []);
  const { data: settings, loading, refresh } = usePolling<AppSettings>(fetchSettings, 30000);

  const [form, setForm] = useState({ listen: '', cors: '', storagePath: '', imagePath: '', bridge: '', authEnabled: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      const s = settings as AppSettings;
      setForm({
        listen: s.daemon?.listen || '',
        cors: s.daemon?.cors_origins?.join(', ') || '',
        storagePath: s.storage?.path || '',
        imagePath: s.storage?.image_path || '',
        bridge: s.network?.bridge || '',
        authEnabled: s.auth?.enabled ?? false,
      });
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsApi.update({
        daemon: { listen: form.listen, cors_origins: form.cors.split(',').map(s => s.trim()).filter(Boolean) },
        storage: { path: form.storagePath, image_path: form.imagePath },
        network: { bridge: form.bridge },
        auth: { enabled: form.authEnabled },
      });
      refresh();
    } catch (err) { console.error('Save failed:', err); }
    finally { setSaving(false); }
  };

  const handleReset = () => {
    if (settings) {
      const s = settings as AppSettings;
      setForm({
        listen: s.daemon?.listen || '', cors: s.daemon?.cors_origins?.join(', ') || '',
        storagePath: s.storage?.path || '', imagePath: s.storage?.image_path || '',
        bridge: s.network?.bridge || '', authEnabled: s.auth?.enabled ?? false,
      });
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Configure Zyvor Fabric (vmspawnd daemon) and application</p>
      </div>

      {/* Server info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[['Listen Address', form.listen || '-'], ['Storage Path', form.storagePath || '-'],
          ['Image Path', form.imagePath || '-'], ['Network Bridge', form.bridge || '-']].map(([l, v]) => (
          <div key={String(l)} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <p className="text-xs text-slate-500 uppercase">{String(l)}</p>
            <p className="text-sm font-medium text-white mt-1 truncate">{String(v)}</p>
          </div>
        ))}
      </div>

      {/* Daemon config */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2"><SettingsIcon className="w-4 h-4" />Daemon Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Listen Address</label>
            <input value={form.listen} onChange={e => setForm({ ...form, listen: e.target.value })}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">CORS Origins</label>
            <input value={form.cors} onChange={e => setForm({ ...form, cors: e.target.value })} placeholder="http://localhost:3000"
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Storage Path</label>
            <input value={form.storagePath} onChange={e => setForm({ ...form, storagePath: e.target.value })}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Image Path</label>
            <input value={form.imagePath} onChange={e => setForm({ ...form, imagePath: e.target.value })}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Network Bridge</label>
            <input value={form.bridge} onChange={e => setForm({ ...form, bridge: e.target.value })}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-center gap-3 pt-5">
            <button onClick={() => setForm({ ...form, authEnabled: !form.authEnabled })}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.authEnabled ? 'bg-blue-600' : 'bg-slate-600'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.authEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-slate-300">Authentication Enabled</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
          <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Settings'}
        </button>
        <button onClick={handleReset}
          className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <RotateCcw className="w-4 h-4" />Reset
        </button>
      </div>
    </div>
  );
}
