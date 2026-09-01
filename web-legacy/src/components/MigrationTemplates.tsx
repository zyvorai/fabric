// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { migrationApi } from '../utils/api';
import { formatDateTime } from '../utils/format';

interface MigrationTemplate {
  id: string;
  name: string;
  source: string;
  destination: string;
  target_format: string;
  bandwidth_limit?: number;
  created_at: string;
}

const TEMPLATES_KEY = 'vmspawnd_migration_templates';

function loadTemplates(): MigrationTemplate[] {
  try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]'); } catch { return []; }
}

function saveTemplates(templates: MigrationTemplate[]) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

export default function MigrationTemplates() {
  const [templates, setTemplates] = useState<MigrationTemplate[]>(loadTemplates);
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [targetFormat, setTargetFormat] = useState('qcow2');
  const [bandwidth, setBandwidth] = useState('');
  const [applyVm, setApplyVm] = useState('');

  const handleCreate = () => {
    if (!name.trim()) return;
    const tpl: MigrationTemplate = {
      id: crypto.randomUUID(),
      name: name.trim(), source, destination, target_format: targetFormat,
      bandwidth_limit: bandwidth ? Number(bandwidth) : undefined,
      created_at: new Date().toISOString(),
    };
    const next = [...templates, tpl];
    setTemplates(next);
    saveTemplates(next);
    setName(''); setSource(''); setDestination(''); setBandwidth('');
  };

  const handleDelete = (id: string) => {
    const next = templates.filter(t => t.id !== id);
    setTemplates(next);
    saveTemplates(next);
  };

  const handleApply = async (tpl: MigrationTemplate) => {
    if (!applyVm.trim()) { alert('Enter a VM name first'); return; }
    try {
      await migrationApi.start({
        vm_name: applyVm.trim(), source: tpl.source, destination: tpl.destination,
        target_format: tpl.target_format, bandwidth_limit: tpl.bandwidth_limit,
      });
      alert(`Migration started for ${applyVm}`);
      setApplyVm('');
    } catch (err) { console.error('Failed to apply template:', err); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Migration Templates</h2>
        <p className="text-sm text-slate-400 mt-1">Reusable migration configurations</p>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Create Template</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Template name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={source} onChange={e => setSource(e.target.value)} placeholder="Source host" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="Destination host" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <select value={targetFormat} onChange={e => setTargetFormat(e.target.value)} className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500">
            <option value="qcow2">qcow2</option><option value="raw">raw</option><option value="vmdk">vmdk</option>
          </select>
          <input type="number" value={bandwidth} onChange={e => setBandwidth(e.target.value)} placeholder="Bandwidth limit (MB/s)" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={handleCreate} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Create Template</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <label className="block text-sm text-slate-400 mb-1">VM name to apply template to</label>
        <input value={applyVm} onChange={e => setApplyVm(e.target.value)} placeholder="vm-name" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map(tpl => (
          <div key={tpl.id} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <div className="flex items-start justify-between mb-3">
              <h4 className="text-white font-semibold">{tpl.name}</h4>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">{tpl.target_format}</span>
            </div>
            <div className="text-sm text-slate-400 space-y-1">
              <div>Source: <span className="text-slate-300">{tpl.source || 'Any'}</span></div>
              <div>Destination: <span className="text-slate-300">{tpl.destination}</span></div>
              {tpl.bandwidth_limit && <div>Bandwidth: <span className="text-slate-300">{tpl.bandwidth_limit} MB/s</span></div>}
              <div className="text-xs text-slate-500">Created {formatDateTime(tpl.created_at)}</div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => handleApply(tpl)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg">Apply</button>
              <button onClick={() => handleDelete(tpl.id)} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Delete</button>
            </div>
          </div>
        ))}
        {templates.length === 0 && <div className="col-span-2 text-center text-slate-500 py-8">No templates created yet</div>}
      </div>
    </div>
  );
}
