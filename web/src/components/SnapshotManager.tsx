import { useState, useCallback } from 'react';
import { Camera, Plus, Undo2, Trash2, GitBranch } from 'lucide-react';
import { vmApi, snapshotApi } from '../utils/api';
import { formatBytes, formatDateTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { VM, VMSnapshot } from '../types';

export default function SnapshotManager() {
  const [vmName, setVmName] = useState('');
  const [snapName, setSnapName] = useState('');
  const [snapDesc, setSnapDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchVMs = useCallback(() => vmApi.list(), []);
  const fetchSnapshots = useCallback(
    () => (vmName ? snapshotApi.list(vmName) as Promise<VMSnapshot[]> : Promise.resolve([])), [vmName]);
  const fetchTree = useCallback(
    () => (vmName ? snapshotApi.tree(vmName) : Promise.resolve(null)), [vmName]);

  const { data: vmData } = usePolling<{ items: unknown[]; total: number }>(fetchVMs, 15000);
  const { data: snapshots, loading, refresh } = usePolling<VMSnapshot[]>(fetchSnapshots, 10000, !!vmName);
  const { data: tree } = usePolling<unknown>(fetchTree, 15000, !!vmName);

  const vms = (vmData?.items || []) as VM[];
  const snapList = (snapshots || []) as VMSnapshot[];

  const handleCreate = async () => {
    if (!vmName || !snapName.trim()) return;
    setCreating(true);
    try { await snapshotApi.create(vmName, { name: snapName, description: snapDesc }); setSnapName(''); setSnapDesc(''); refresh(); }
    catch (err) { console.error('Create failed:', err); }
    finally { setCreating(false); }
  };

  const handleRevert = async (id: string) => {
    if (!confirm('Revert to this snapshot?')) return;
    try { await snapshotApi.revert(vmName, id); refresh(); }
    catch (err) { console.error('Revert failed:', err); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this snapshot?')) return;
    try { await snapshotApi.delete(vmName, id); refresh(); }
    catch (err) { console.error('Delete failed:', err); }
  };

  const renderTree = (node: any, depth = 0): React.ReactNode => {
    if (!node) return null;
    return (
      <div key={node.id || depth} className="ml-4">
        <div className="flex items-center gap-2 py-1">
          <GitBranch className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-sm text-white">{node.name}</span>
          {node.created_at && <span className="text-xs text-slate-500">{formatDateTime(node.created_at)}</span>}
        </div>
        {node.children?.map((c: any, i: number) => renderTree(c, i))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Snapshot Manager</h1><p className="text-sm text-slate-400 mt-1">Advanced snapshot management with tree view</p></div>

      {/* VM Selector */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Select VM</label>
        <select value={vmName} onChange={e => setVmName(e.target.value)}
          className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500">
          <option value="">Choose VM...</option>
          {vms.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
        </select>
      </div>

      {vmName && (
        <>
          {/* Create */}
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 space-y-3">
            <h3 className="text-sm font-semibold text-white">Create Snapshot</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={snapName} onChange={e => setSnapName(e.target.value)} placeholder="Snapshot name"
                className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
              <input value={snapDesc} onChange={e => setSnapDesc(e.target.value)} placeholder="Description (optional)"
                className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={handleCreate} disabled={creating || !snapName.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
              <Plus className="w-4 h-4" />{creating ? 'Creating...' : 'Create'}
            </button>
          </div>

          {/* Tree view */}
          {tree && (
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><GitBranch className="w-4 h-4" />Snapshot Tree</h3>
              {renderTree(tree)}
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : snapList.length === 0 ? (
            <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
              <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>No snapshots for {vmName}</p>
            </div>
          ) : (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <table className="w-full"><thead><tr className="border-b border-slate-700/50">
                {['Name', 'Description', 'Created', 'Size', 'Actions'].map(h =>
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {snapList.map(s => (
                  <tr key={s.id} className="hover:bg-slate-700/20">
                    <td className="px-4 py-3 text-sm text-white font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{s.description || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{s.created_at ? formatDateTime(s.created_at) : '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{s.size ? formatBytes(s.size) : '-'}</td>
                    <td className="px-4 py-3"><div className="flex gap-1">
                      <button onClick={() => handleRevert(s.id)} className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400" title="Revert"><Undo2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
