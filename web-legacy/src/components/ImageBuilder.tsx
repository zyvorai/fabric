// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import { Hammer, Terminal } from 'lucide-react';
import { imageApi } from '../utils/api';
import { formatDateTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';

interface Build { id: string; status: string; distribution: string; created_at: string; log?: string }

export default function ImageBuilder() {
  const [distro, setDistro] = useState('ubuntu');
  const [version, setVersion] = useState('22.04');
  const [arch, setArch] = useState('x86_64');
  const [format, setFormat] = useState('qcow2');
  const [packages, setPackages] = useState('');
  const [building, setBuilding] = useState(false);
  const [selectedBuild, setSelectedBuild] = useState<string | null>(null);

  const fetchBuilds = useCallback(() => imageApi.listBuilds() as Promise<Build[]>, []);
  const { data: builds, loading, refresh } = usePolling<Build[]>(fetchBuilds, 10000);
  const buildList = (builds || []) as Build[];

  const handleBuild = async () => {
    setBuilding(true);
    try {
      await imageApi.build({
        distribution: distro, version, arch, format,
        packages: packages.split(',').map(p => p.trim()).filter(Boolean),
      });
      refresh();
    } catch (err) { console.error('Build failed:', err); }
    finally { setBuilding(false); }
  };

  const activeBuild = selectedBuild ? buildList.find(b => b.id === selectedBuild) : null;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Image Builder</h1><p className="text-sm text-slate-400 mt-1">Build custom VM images from distributions</p></div>

      {/* Build form */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 space-y-4">
        <h3 className="text-sm font-semibold text-white">New Build</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="block text-xs text-slate-400 mb-1">Distribution</label>
            <select value={distro} onChange={e => setDistro(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500">
              <option value="ubuntu">Ubuntu</option><option value="fedora">Fedora</option><option value="debian">Debian</option>
              <option value="centos">CentOS</option><option value="archlinux">Arch Linux</option><option value="alpine">Alpine</option>
            </select></div>
          <div><label className="block text-xs text-slate-400 mb-1">Version</label>
            <input value={version} onChange={e => setVersion(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Architecture</label>
            <select value={arch} onChange={e => setArch(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500">
              <option value="x86_64">x86_64</option><option value="aarch64">aarch64</option>
            </select></div>
          <div><label className="block text-xs text-slate-400 mb-1">Format</label>
            <select value={format} onChange={e => setFormat(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500">
              <option value="qcow2">qcow2</option><option value="raw">raw</option>
            </select></div>
        </div>
        <div><label className="block text-xs text-slate-400 mb-1">Additional Packages (comma-separated)</label>
          <input value={packages} onChange={e => setPackages(e.target.value)} placeholder="vim, curl, htop"
            className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" /></div>
        <button onClick={handleBuild} disabled={building}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
          <Hammer className="w-4 h-4" />{building ? 'Building...' : 'Build Image'}
        </button>
      </div>

      {/* Build log */}
      {activeBuild?.log && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Terminal className="w-4 h-4" />Build Log</h3>
          <pre className="bg-slate-900 rounded-lg p-4 text-xs text-slate-300 font-mono max-h-60 overflow-auto whitespace-pre-wrap">{activeBuild.log}</pre>
        </div>
      )}

      {/* Builds list */}
      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : buildList.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          <Hammer className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>No builds yet</p>
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full"><thead><tr className="border-b border-slate-700/50">
            {['Distribution', 'Status', 'Created', 'Actions'].map(h =>
              <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-700/30">
            {buildList.map(b => (
              <tr key={b.id} className="hover:bg-slate-700/20">
                <td className="px-4 py-3 text-sm text-white font-medium">{b.distribution}</td>
                <td className="px-4 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  b.status === 'completed' ? 'bg-green-500/20 text-green-400' : b.status === 'building' ? 'bg-blue-500/20 text-blue-400' : b.status === 'failed' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'
                }`}>{b.status}</span></td>
                <td className="px-4 py-3 text-sm text-slate-300">{b.created_at ? formatDateTime(b.created_at) : '-'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => setSelectedBuild(b.id === selectedBuild ? null : b.id)} className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400" title="View Log">
                    <Terminal className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}
