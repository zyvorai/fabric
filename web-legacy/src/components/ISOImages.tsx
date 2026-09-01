// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import { Disc, Download, Trash2, Search } from 'lucide-react';
import { imageApi } from '../utils/api';
import { formatBytes } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { ISOImage } from '../types';

export default function ISOImages() {
  const [search, setSearch] = useState('');
  const [url, setUrl] = useState('');
  const [downloading, setDownloading] = useState(false);

  const fetchISOs = useCallback(() => imageApi.listIso() as Promise<ISOImage[]>, []);
  const { data: isos, loading, refresh } = usePolling<ISOImage[]>(fetchISOs, 15000);
  const isoList = (isos || []) as ISOImage[];

  const filtered = isoList.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleDownload = async () => {
    if (!url.trim()) return;
    setDownloading(true);
    try { await imageApi.downloadIso({ url }); setUrl(''); refresh(); }
    catch (err) { console.error('Download failed:', err); }
    finally { setDownloading(false); }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete ISO "${name}"?`)) return;
    try { await imageApi.deleteIso(name); refresh(); }
    catch (err) { console.error('Delete failed:', err); }
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white">ISO Images</h1><p className="text-sm text-slate-400 mt-1">Browse and manage ISO installation media</p></div>

      {/* Download form */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-semibold text-white mb-3">Download ISO</h3>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs text-slate-400 mb-1">URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/distro.iso"
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={handleDownload} disabled={downloading || !url.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
            <Download className="w-4 h-4" />{downloading ? 'Downloading...' : 'Download'}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter ISOs..."
          className="w-full bg-slate-900/50 border border-slate-600 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          <Disc className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{search ? 'No matching ISOs' : 'No ISO images'}</p>
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full"><thead><tr className="border-b border-slate-700/50">
            {['Name', 'Path', 'Size', 'Actions'].map(h =>
              <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-700/30">
            {filtered.map(iso => (
              <tr key={iso.name} className="hover:bg-slate-700/20">
                <td className="px-4 py-3 text-sm text-white font-medium">{iso.name}</td>
                <td className="px-4 py-3 text-sm text-slate-300 font-mono truncate max-w-xs">{iso.path}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{formatBytes(iso.size)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(iso.name)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
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
