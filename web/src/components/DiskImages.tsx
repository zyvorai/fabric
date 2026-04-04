import { useCallback } from 'react';
import { HardDrive } from 'lucide-react';
import { imageApi } from '../utils/api';
import { formatBytes, formatDateTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { DiskImage } from '../types';

export default function DiskImages() {
  const fetchImages = useCallback(() => imageApi.list() as Promise<DiskImage[]>, []);
  const { data: images, loading } = usePolling<DiskImage[]>(fetchImages, 15000);
  const imageList = (images || []) as DiskImage[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Disk Images</h1>
        <p className="text-sm text-slate-400 mt-1">Browse available disk images</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : imageList.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No disk images found</p>
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50">
            <h2 className="text-sm font-semibold text-white">{imageList.length} Image{imageList.length !== 1 ? 's' : ''}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50">
                  {['Name', 'Path', 'Size', 'Format', 'Modified'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {imageList.map(img => (
                  <tr key={img.name} className="hover:bg-slate-700/20">
                    <td className="px-4 py-3 text-sm text-white font-medium">{img.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 font-mono truncate max-w-xs">{img.path}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{formatBytes(img.size)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">{img.format}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{img.mod_time ? formatDateTime(img.mod_time) : '-'}</td>
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
