// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { migrationApi } from '../utils/api';

interface BatchEntry {
  id: string;
  vm_name: string;
  source: string;
  destination: string;
  target_format: string;
}

export default function BatchMigration() {
  const [entries, setEntries] = useState<BatchEntry[]>([]);
  const [vmName, setVmName] = useState('');
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [targetFormat, setTargetFormat] = useState('qcow2');
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<{ vm: string; ok: boolean; msg: string }[]>([]);

  const handleAdd = () => {
    if (!vmName.trim() || !destination.trim()) return;
    setEntries(prev => [...prev, { id: crypto.randomUUID(), vm_name: vmName.trim(), source, destination, target_format: targetFormat }]);
    setVmName(''); setSource(''); setDestination('');
  };

  const handleRemove = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'batch-migration.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleStartBatch = async () => {
    if (entries.length === 0) return;
    setSubmitting(true);
    setResults([]);
    const res: { vm: string; ok: boolean; msg: string }[] = [];
    for (const entry of entries) {
      try {
        await migrationApi.start({ vm_name: entry.vm_name, source: entry.source, destination: entry.destination, target_format: entry.target_format });
        res.push({ vm: entry.vm_name, ok: true, msg: 'Started' });
      } catch (err) {
        res.push({ vm: entry.vm_name, ok: false, msg: err instanceof Error ? err.message : String(err) });
      }
    }
    setResults(res);
    setSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Batch Migration Builder</h2>
        <p className="text-sm text-slate-400 mt-1">Configure and start multiple VM migrations at once</p>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Add VM</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input value={vmName} onChange={e => setVmName(e.target.value)} placeholder="VM name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={source} onChange={e => setSource(e.target.value)} placeholder="Source host" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="Destination host" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <select value={targetFormat} onChange={e => setTargetFormat(e.target.value)} className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500">
            <option value="qcow2">qcow2</option><option value="raw">raw</option><option value="vmdk">vmdk</option>
          </select>
        </div>
        <button onClick={handleAdd} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Add to Batch</button>
      </div>

      {entries.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Batch ({entries.length} VMs)</h3>
            <div className="flex gap-2">
              <button onClick={handleExportJson} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg">Export JSON</button>
              <button onClick={handleStartBatch} disabled={submitting} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg disabled:opacity-40">
                {submitting ? 'Starting...' : 'Start Batch'}
              </button>
            </div>
          </div>
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-900/50 text-slate-400">
              <tr><th className="px-5 py-3">VM</th><th className="px-5 py-3">Source</th><th className="px-5 py-3">Destination</th><th className="px-5 py-3">Format</th><th className="px-5 py-3">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {entries.map(e => (
                <tr key={e.id} className="text-slate-300 hover:bg-slate-700/30">
                  <td className="px-5 py-3 text-white font-medium">{e.vm_name}</td>
                  <td className="px-5 py-3">{e.source || '-'}</td>
                  <td className="px-5 py-3">{e.destination}</td>
                  <td className="px-5 py-3">{e.target_format}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => handleRemove(e.id)} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-lg font-semibold text-white mb-3">Results</h3>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-lg text-sm ${r.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                <span className="font-medium">{r.vm}</span>
                <span>{r.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
