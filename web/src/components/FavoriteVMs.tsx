// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback, useEffect } from 'react';
import { Heart, Server, Cpu, MemoryStick, RefreshCw } from 'lucide-react';
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

const FAVORITES_KEY = 'vmspawnd_favorites';

function getFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); } catch { return []; }
}

function setFavorites(favs: string[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

export default function FavoriteVMs() {
  const { navigateTo } = useViewContext();
  const [favorites, setFavoritesState] = useState<string[]>(getFavorites());

  const fetchVMs = useCallback(async () => {
    const res = await vmApi.list() as { items: VM[]; total: number };
    return res.items || [];
  }, []);
  const { data: allVMs, loading, refresh } = usePolling(fetchVMs, 10000);

  const vms = (allVMs || []).filter(vm => favorites.includes(vm.name));

  const toggleFavorite = (name: string) => {
    const next = favorites.includes(name) ? favorites.filter(f => f !== name) : [...favorites, name];
    setFavoritesState(next);
    setFavorites(next);
  };

  useEffect(() => {
    const stored = getFavorites();
    if (JSON.stringify(stored) !== JSON.stringify(favorites)) {
      setFavoritesState(stored);
    }
  }, []);

  if (loading && !allVMs) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const nonFavVMs = (allVMs || []).filter(vm => !favorites.includes(vm.name));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Favorite VMs</h1>
        <button onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {vms.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-12 border border-slate-700/50 text-center">
          <Heart className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-sm">No favorite VMs yet</p>
          <p className="text-slate-500 text-xs mt-1">Click the heart icon on a VM to add it to favorites.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vms.map(vm => (
            <div key={vm.name}
              className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 hover:border-slate-600 transition-all cursor-pointer"
              onClick={() => navigateTo('vmDetails', vm.name)}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <Server className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{vm.name}</div>
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className={`w-2 h-2 rounded-full ${getStatusColor(vm.state || '')}`} />
                      <span className="text-slate-300 capitalize">{vm.state || 'unknown'}</span>
                    </span>
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); toggleFavorite(vm.name); }}
                  className="p-1 hover:bg-slate-700 rounded transition-colors">
                  <Heart className="w-5 h-5 text-red-400 fill-red-400" />
                </button>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5" /> {vm.cpus || 0} vCPU</span>
                <span className="flex items-center gap-1"><MemoryStick className="w-3.5 h-3.5" /> {formatMemory(vm.memory || 0)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {nonFavVMs.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-base font-semibold text-white mb-3">Other VMs</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {nonFavVMs.map(vm => (
              <div key={vm.name} className="flex items-center justify-between p-3 bg-slate-900/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${getStatusColor(vm.state || '')}`} />
                  <span className="text-sm text-white">{vm.name}</span>
                </div>
                <button onClick={() => toggleFavorite(vm.name)}
                  className="p-1 hover:bg-slate-700 rounded transition-colors">
                  <Heart className="w-4 h-4 text-slate-500 hover:text-red-400" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
