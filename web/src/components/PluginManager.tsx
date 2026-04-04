import { useCallback } from 'react';
import { Puzzle, RefreshCw } from 'lucide-react';
import { pluginApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';

interface Plugin {
  id?: string;
  name?: string;
  version?: string;
  enabled?: boolean;
  description?: string;
  author?: string;
}

export default function PluginManager() {
  const fetchPlugins = useCallback(() => pluginApi.list() as Promise<Plugin[]>, []);
  const { data: plugins, loading, refresh } = usePolling(fetchPlugins, 30000);

  const items = plugins || [];
  const enabledCount = items.filter(p => p.enabled).length;

  if (loading && !plugins) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Plugin Manager</h1>
        <button onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="flex gap-4">
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 flex-1">
          <div className="text-xs text-slate-400 mb-1">Total Plugins</div>
          <div className="text-2xl font-bold text-white">{items.length}</div>
        </div>
        <div className="stat-card-green rounded-xl border border-slate-700/50 p-5 flex-1">
          <div className="text-xs text-slate-400 mb-1">Enabled</div>
          <div className="text-2xl font-bold text-white">{enabledCount}</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 flex-1">
          <div className="text-xs text-slate-400 mb-1">Disabled</div>
          <div className="text-2xl font-bold text-white">{items.length - enabledCount}</div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-700 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Puzzle className="w-4 h-4 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-white">Installed Plugins</h2>
        </div>
        {items.length === 0 ? (
          <div className="p-10 text-center">
            <Puzzle className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No plugins installed</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Version</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Author</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {items.map((p, i) => (
                  <tr key={p.id || i} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-white">{p.name || `plugin-${i}`}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{p.version || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs ${p.enabled ? 'text-green-400' : 'text-slate-400'}`}>
                        <span className={`w-2 h-2 rounded-full ${p.enabled ? 'bg-green-500' : 'bg-slate-500'}`} />
                        {p.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{p.description || '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{p.author || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
