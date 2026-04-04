import { useState, useCallback } from 'react';
import { Search, Plus, Play, Square, Trash2, Monitor } from 'lucide-react';
import { useViewContext } from '../App';
import { vmApi } from '../utils/api';
import { formatMemory, getStatusBadgeClasses, formatRelativeTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { VM } from '../types';

export default function VMList() {
  const { navigateTo } = useViewContext();
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchVMs = useCallback(() => vmApi.list(), []);
  const { data, loading, refresh } = usePolling<{ items: unknown[]; total: number }>(fetchVMs, 5000);

  const vms = ((data?.items || []) as VM[]).filter(
    (vm) => vm.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleAction = async (action: 'start' | 'stop' | 'delete', name: string) => {
    setActionLoading(name);
    try {
      if (action === 'start') await vmApi.start(name);
      else if (action === 'stop') await vmApi.stop(name);
      else if (action === 'delete') {
        if (!confirm(`Delete VM "${name}"?`)) return;
        await vmApi.delete(name);
      }
      refresh();
    } catch (err) {
      console.error(`Failed to ${action} VM:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-400">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Virtual Machines</h1>
          <p className="text-sm text-slate-400 mt-1">Manage and monitor your virtual machines</p>
        </div>
        <button
          onClick={() => navigateTo('createVM')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create VM
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search virtual machines..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-900/50 border border-slate-600 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Table */}
      {vms.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          <Monitor className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">No virtual machines found</p>
          <p className="text-sm mt-1">Create your first VM to get started</p>
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50">
            <h2 className="text-sm font-semibold text-white">{vms.length} Virtual Machine{vms.length !== 1 ? 's' : ''}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">CPU</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Memory</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Disk</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Image</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">IP</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Created</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {vms.map((vm) => (
                  <tr key={vm.name} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigateTo('vmDetails', vm.name)}
                        className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        {vm.name}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(vm.state)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${vm.state === 'running' ? 'bg-green-400' : vm.state === 'stopped' ? 'bg-red-400' : 'bg-slate-400'}`} />
                        {vm.state}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{vm.cpus} vCPU</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{formatMemory(vm.memory)}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{vm.disk ? `${vm.disk} GB` : '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 truncate max-w-[200px]" title={vm.image || ''}>{vm.image || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{vm.ip || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{vm.created ? formatRelativeTime(vm.created) : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {vm.state !== 'running' && (
                          <button
                            onClick={() => handleAction('start', vm.name)}
                            disabled={actionLoading === vm.name}
                            className="p-1.5 rounded-lg hover:bg-green-500/20 text-green-400 transition-colors disabled:opacity-50"
                            title="Start"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {vm.state === 'running' && (
                          <button
                            onClick={() => handleAction('stop', vm.name)}
                            disabled={actionLoading === vm.name}
                            className="p-1.5 rounded-lg hover:bg-yellow-500/20 text-yellow-400 transition-colors disabled:opacity-50"
                            title="Stop"
                          >
                            <Square className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleAction('delete', vm.name)}
                          disabled={actionLoading === vm.name}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-50"
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
