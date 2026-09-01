// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import { Camera, Plus, Undo2, Trash2 } from 'lucide-react';
import { useViewContext } from '../App';
import { vmApi, snapshotApi } from '../utils/api';
import { formatBytes, formatDateTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { VM, VMSnapshot } from '../types';

export default function Snapshots() {
  const { selectedVM } = useViewContext();
  const [selectedVMName, setSelectedVMName] = useState(selectedVM || '');
  const [snapshotName, setSnapshotName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchVMs = useCallback(() => vmApi.list(), []);
  const fetchSnapshots = useCallback(
    () => (selectedVMName ? snapshotApi.list(selectedVMName) as Promise<VMSnapshot[]> : Promise.resolve([])),
    [selectedVMName]
  );

  const { data: vmData } = usePolling<{ items: unknown[]; total: number }>(fetchVMs, 10000);
  const { data: snapshots, loading, refresh } = usePolling<VMSnapshot[]>(fetchSnapshots, 10000, !!selectedVMName);

  const vms = (vmData?.items || []) as VM[];
  const snapshotList = (snapshots || []) as VMSnapshot[];

  const handleCreate = async () => {
    if (!snapshotName.trim() || !selectedVMName) return;
    setCreating(true);
    try {
      await snapshotApi.create(selectedVMName, { name: snapshotName.trim() });
      setSnapshotName('');
      refresh();
    } catch (err) {
      console.error('Failed to create snapshot:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleRevert = async (id: string) => {
    if (!selectedVMName || !confirm('Revert to this snapshot? This may restart the VM.')) return;
    try {
      await snapshotApi.revert(selectedVMName, id);
      refresh();
    } catch (err) {
      console.error('Failed to revert snapshot:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!selectedVMName || !confirm('Delete this snapshot?')) return;
    try {
      await snapshotApi.delete(selectedVMName, id);
      refresh();
    } catch (err) {
      console.error('Failed to delete snapshot:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Snapshots</h1>
        <p className="text-sm text-slate-400 mt-1">Manage VM snapshots for backup and recovery</p>
      </div>

      {/* VM Selector */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Select VM</label>
        <select
          value={selectedVMName}
          onChange={(e) => setSelectedVMName(e.target.value)}
          className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">Choose a virtual machine...</option>
          {vms.map((vm) => (
            <option key={vm.name} value={vm.name}>{vm.name}</option>
          ))}
        </select>
      </div>

      {/* Create Snapshot */}
      {selectedVMName && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-sm font-semibold text-white mb-3">Create Snapshot</h3>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Snapshot name..."
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              className="flex-1 bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !snapshotName.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Snapshot Table */}
      {!selectedVMName ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">Select a VM</p>
          <p className="text-sm mt-1">Choose a virtual machine to manage its snapshots</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-400">Loading...</span>
          </div>
        </div>
      ) : snapshotList.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">No snapshots</p>
          <p className="text-sm mt-1">Create your first snapshot for "{selectedVMName}"</p>
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50">
            <h2 className="text-sm font-semibold text-white">
              {snapshotList.length} Snapshot{snapshotList.length !== 1 ? 's' : ''} for {selectedVMName}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Created</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Size</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {snapshotList.map((snap) => (
                  <tr key={snap.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 text-sm text-white font-medium">{snap.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {snap.created_at ? formatDateTime(snap.created_at) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {snap.size ? formatBytes(snap.size) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleRevert(snap.id)}
                          className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-colors"
                          title="Revert"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(snap.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
