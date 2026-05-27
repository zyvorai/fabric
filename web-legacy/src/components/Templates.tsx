// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback } from 'react';
import { FileStack, Plus, Trash2, Rocket, Cpu, MemoryStick, HardDrive } from 'lucide-react';
import { templateApi } from '../utils/api';
import { Template } from '../types';
import { formatMemory, formatBytes, formatDateTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';

const inputCls = 'bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none w-full';
const btnPrimary = 'bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors';
const btnDanger = 'bg-red-600 hover:bg-red-500 text-white rounded-lg px-2 py-1.5 text-xs font-medium transition-colors';

export default function Templates() {
  const { data: templates, refresh } = usePolling<Template[]>(
    useCallback(() => templateApi.list() as Promise<Template[]>, []), 15000
  );

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', cpus: '2', memory: '2048', disk_size: '20', image: '',
  });

  const [deployTarget, setDeployTarget] = useState<string | null>(null);
  const [deployName, setDeployName] = useState('');

  const createTemplate = async () => {
    if (!form.name) return;
    await templateApi.create({
      name: form.name,
      description: form.description || undefined,
      cpus: parseInt(form.cpus) || 2,
      memory: parseInt(form.memory) || 2048,
      disk_size: form.disk_size ? parseInt(form.disk_size) * 1024 * 1024 * 1024 : undefined,
      image: form.image || undefined,
    });
    setForm({ name: '', description: '', cpus: '2', memory: '2048', disk_size: '20', image: '' });
    setShowCreate(false);
    refresh();
  };

  const deleteTemplate = async (id: string) => {
    await templateApi.delete(id);
    refresh();
  };

  const deployTemplate = async (id: string) => {
    if (!deployName) return;
    await templateApi.deploy(id, { name: deployName });
    setDeployTarget(null);
    setDeployName('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileStack className="w-7 h-7 text-blue-400" />
            Templates
          </h1>
          <p className="text-sm text-slate-400 mt-1">VM templates for quick deployment</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className={btnPrimary}>
          <Plus className="w-4 h-4 inline mr-1" />Create Template
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-sm font-semibold text-white mb-3">Create Template</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <input className={inputCls} placeholder="Template name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className={inputCls} placeholder="Description (optional)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input className={inputCls} placeholder="CPUs" type="number" min="1" value={form.cpus} onChange={e => setForm({ ...form, cpus: e.target.value })} />
            <input className={inputCls} placeholder="Memory (MB)" type="number" min="256" step="256" value={form.memory} onChange={e => setForm({ ...form, memory: e.target.value })} />
            <input className={inputCls} placeholder="Disk size (GB)" type="number" value={form.disk_size} onChange={e => setForm({ ...form, disk_size: e.target.value })} />
            <input className={inputCls} placeholder="Image name (optional)" value={form.image} onChange={e => setForm({ ...form, image: e.target.value })} />
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={createTemplate} className={btnPrimary}>Create Template</button>
          </div>
        </div>
      )}

      {/* Deploy modal */}
      {deployTarget && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-blue-500/50">
          <h3 className="text-sm font-semibold text-white mb-3">Deploy VM from Template</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              className={inputCls}
              placeholder="VM name"
              value={deployName}
              onChange={e => setDeployName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && deployTemplate(deployTarget)}
            />
            <button onClick={() => deployTemplate(deployTarget)} className={btnPrimary}>
              <Rocket className="w-4 h-4 inline mr-1" />Deploy
            </button>
            <button onClick={() => setDeployTarget(null)} className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Template Cards Grid */}
      {(templates || []).length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          <FileStack className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          No templates defined yet
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(templates || []).map(t => (
            <div key={t.id} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 hover:border-blue-500/50 transition-all">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-white text-lg">{t.name}</h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setDeployTarget(t.id); setDeployName(''); }} className={btnPrimary} title="Deploy">
                    <Rocket className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteTemplate(t.id)} className={btnDanger} title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {t.description && <p className="text-sm text-slate-400 mb-4">{t.description}</p>}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Cpu className="w-4 h-4 text-blue-400" />
                  <span className="text-slate-400">CPUs:</span>
                  <span className="text-white font-medium">{t.cpus} vCPU</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MemoryStick className="w-4 h-4 text-purple-400" />
                  <span className="text-slate-400">Memory:</span>
                  <span className="text-white font-medium">{formatMemory(t.memory)}</span>
                </div>
                {t.disk_size && (
                  <div className="flex items-center gap-2 text-sm">
                    <HardDrive className="w-4 h-4 text-cyan-400" />
                    <span className="text-slate-400">Disk:</span>
                    <span className="text-white font-medium">{formatBytes(t.disk_size)}</span>
                  </div>
                )}
                {t.image && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileStack className="w-4 h-4 text-green-400" />
                    <span className="text-slate-400">Image:</span>
                    <span className="text-white font-medium truncate">{t.image}</span>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-700/50 text-xs text-slate-500">
                Created {formatDateTime(t.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
