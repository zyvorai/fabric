// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback } from 'react';
import { Search, Server, Cpu, MemoryStick, RefreshCw } from 'lucide-react';
import { vmApi } from '../utils/api';
import { formatMemory, getStatusColor } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import { useViewContext } from '../App';

interface VM {
  name: string;
  state?: string;
  cpus?: number;
  memory?: number;
  ip?: string;
}

export default function VMBrowser() {
  const { navigateTo } = useViewContext();
  const [search, setSearch] = useState('');

  const fetchVMs = useCallback(async () => {
    const res = await vmApi.list() as { items: VM[]; total: number };
    return res.items || [];
  }, []);
  const { data: vms, loading, refresh } = usePolling(fetchVMs, 10000);

  const items = (vms || []).filter(vm =>
    vm.name.toLowerCase().includes(search.toLowerCase()) ||
    (vm.state || '').toLowerCase().includes(search.toLowerCase()) ||
    (vm.ip || '').includes(search)
  );

  if (loading && !vms) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">VM Browser</h1>
        <button onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search VMs by name, state, or IP..."
          className="w-full bg-slate-900/50 border border-slate-600 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" />
      </div>

      {items.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-12 border border-slate-700/50 text-center">
          <Server className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            {search ? 'No VMs match your search' : 'No virtual machines found'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(vm => (
            <button key={vm.name} onClick={() => navigateTo('vmDetails', vm.name)}
              className="w-full bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 hover:border-slate-600 transition-all flex items-center gap-4 text-left">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20 flex-shrink-0">
                <Server className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white">{vm.name}</div>
                <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${getStatusColor(vm.state || '')}`} />
                    <span className="capitalize">{vm.state || 'unknown'}</span>
                  </span>
                  <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> {vm.cpus || 0} vCPU</span>
                  <span className="flex items-center gap-1"><MemoryStick className="w-3 h-3" /> {formatMemory(vm.memory || 0)}</span>
                </div>
              </div>
              <div className="text-xs text-slate-500 font-mono flex-shrink-0">{vm.ip || '-'}</div>
            </button>
          ))}
        </div>
      )}

      <div className="text-xs text-slate-500 text-center">
        Showing {items.length} of {(vms || []).length} VMs
      </div>
    </div>
  );
}
