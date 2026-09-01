// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import { Download, HardDrive, Search } from 'lucide-react';
import { imageApi } from '../utils/api';
import { formatBytes, formatDateTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { DiskImage } from '../types';

export default function DownloadDisk() {
  const [search, setSearch] = useState('');
  const [customPath, setCustomPath] = useState('');

  const fetchImages = useCallback(() => imageApi.list() as Promise<DiskImage[]>, []);
  const { data: images, loading } = usePolling<DiskImage[]>(fetchImages, 15000);
  const imageList = (images || []) as DiskImage[];

  const filtered = imageList.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleDownload = (img: DiskImage) => {
    const path = customPath.trim() || img.path;
    const link = document.createElement('a');
    link.href = `/api/images/download?path=${encodeURIComponent(path)}`;
    link.download = img.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Download Disk</h1>
        <p className="text-sm text-slate-400 mt-1">Download disk images from the server</p>
      </div>

      {/* Custom path */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-semibold text-white mb-3">Custom Path</h3>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs text-slate-400 mb-1">Image Path</label>
            <input value={customPath} onChange={e => setCustomPath(e.target.value)} placeholder="/var/lib/vmspawn/images/custom.qcow2"
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          </div>
          {customPath.trim() && (
            <a href={`/api/images/download?path=${encodeURIComponent(customPath)}`} download
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg flex items-center gap-2">
              <Download className="w-4 h-4" />Download
            </a>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter images..."
          className="w-full bg-slate-900/50 border border-slate-600 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{search ? 'No matching images' : 'No disk images'}</p>
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full"><thead><tr className="border-b border-slate-700/50">
            {['Name', 'Size', 'Format', 'Modified', 'Actions'].map(h =>
              <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-700/30">
            {filtered.map(img => (
              <tr key={img.name} className="hover:bg-slate-700/20">
                <td className="px-4 py-3 text-sm text-white font-medium">{img.name}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{formatBytes(img.size)}</td>
                <td className="px-4 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">{img.format}</span></td>
                <td className="px-4 py-3 text-sm text-slate-300">{img.mod_time ? formatDateTime(img.mod_time) : '-'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDownload(img)} className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400" title="Download">
                    <Download className="w-3.5 h-3.5" />
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
