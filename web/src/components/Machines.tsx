import { useState, useCallback } from 'react';
import { Server, Trash2, Copy, Edit3 } from 'lucide-react';
import { machineApi } from '../utils/api';
import { Machine, MachineImage } from '../types';
import { formatBytes, formatDateTime, getStatusBadgeClasses } from '../utils/format';
import { usePolling } from '../hooks/usePolling';

const btnDanger = 'bg-red-600 hover:bg-red-500 text-white rounded-lg px-2 py-1.5 text-xs font-medium transition-colors';
const btnPrimary = 'bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-2 py-1.5 text-xs font-medium transition-colors';
const thCls = 'text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider';

export default function Machines() {
  const { data: machines, refresh: refreshMachines } = usePolling<Machine[]>(
    useCallback(() => machineApi.list() as Promise<Machine[]>, []), 10000
  );
  const { data: images, refresh: refreshImages } = usePolling<MachineImage[]>(
    useCallback(() => machineApi.listImages() as Promise<MachineImage[]>, []), 15000
  );

  const [cloneTarget, setCloneTarget] = useState<string | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');

  const cloneImage = async (name: string) => {
    if (!cloneName) return;
    await machineApi.cloneImage(name, { target_name: cloneName });
    setCloneTarget(null);
    setCloneName('');
    refreshImages();
  };

  const renameImage = async (name: string) => {
    if (!renameName) return;
    await machineApi.renameImage(name, { target_name: renameName });
    setRenameTarget(null);
    setRenameName('');
    refreshImages();
  };

  const deleteImage = async (name: string) => {
    await machineApi.removeImage(name);
    refreshImages();
  };

  const terminateMachine = async (name: string) => {
    await machineApi.terminate(name);
    refreshMachines();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Server className="w-7 h-7 text-blue-400" />
          Machines
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          systemd-machined managed machines
          <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
            {(machines || []).length} machines
          </span>
        </p>
      </div>

      {/* Machines Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Registered Machines</h2>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-700/50">
            <th className={thCls}>Name</th>
            <th className={thCls}>Class</th>
            <th className={thCls}>Service</th>
            <th className={thCls}>OS</th>
            <th className={thCls}>Leader PID</th>
            <th className={thCls}>State</th>
            <th className={thCls}>Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-700/30">
            {(machines || []).length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No machines registered</td></tr>
            ) : (machines || []).map(m => (
              <tr key={m.name} className="hover:bg-slate-700/20 transition-colors">
                <td className="px-4 py-3 font-medium text-white">{m.name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    m.class === 'vm' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                  }`}>{m.class}</span>
                </td>
                <td className="px-4 py-3 text-slate-400">{m.service}</td>
                <td className="px-4 py-3 text-slate-400">{m.os || '-'}</td>
                <td className="px-4 py-3 text-slate-400 font-mono">{m.leader || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(m.state || 'unknown')}`}>
                    {m.state || 'unknown'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => terminateMachine(m.name)} className={btnDanger} title="Terminate">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Machine Images */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Machine Images</h2>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-700/50">
            <th className={thCls}>Name</th>
            <th className={thCls}>Type</th>
            <th className={thCls}>Size</th>
            <th className={thCls}>Created</th>
            <th className={thCls}>Read-Only</th>
            <th className={thCls}>Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-700/30">
            {(images || []).length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No machine images</td></tr>
            ) : (images || []).map(img => (
              <tr key={img.name} className="hover:bg-slate-700/20 transition-colors">
                <td className="px-4 py-3 font-medium text-white">{img.name}</td>
                <td className="px-4 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400">{img.type}</span></td>
                <td className="px-4 py-3 text-slate-400 tabular-nums">{formatBytes(img.size)}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{formatDateTime(img.created)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${img.read_only ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                    {img.read_only ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {cloneTarget === img.name ? (
                      <div className="flex items-center gap-1">
                        <input
                          className="bg-slate-900/50 border border-slate-600 rounded px-2 py-1 text-xs text-white w-24"
                          placeholder="Clone name"
                          value={cloneName}
                          onChange={e => setCloneName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && cloneImage(img.name)}
                        />
                        <button onClick={() => cloneImage(img.name)} className={btnPrimary}>Go</button>
                        <button onClick={() => setCloneTarget(null)} className="text-slate-400 hover:text-white text-xs px-1">X</button>
                      </div>
                    ) : renameTarget === img.name ? (
                      <div className="flex items-center gap-1">
                        <input
                          className="bg-slate-900/50 border border-slate-600 rounded px-2 py-1 text-xs text-white w-24"
                          placeholder="New name"
                          value={renameName}
                          onChange={e => setRenameName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && renameImage(img.name)}
                        />
                        <button onClick={() => renameImage(img.name)} className={btnPrimary}>Go</button>
                        <button onClick={() => setRenameTarget(null)} className="text-slate-400 hover:text-white text-xs px-1">X</button>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => { setCloneTarget(img.name); setCloneName(''); }} className={btnPrimary} title="Clone"><Copy className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { setRenameTarget(img.name); setRenameName(''); }} className={btnPrimary} title="Rename"><Edit3 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteImage(img.name)} className={btnDanger} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
