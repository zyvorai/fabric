// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useRef } from 'react';
import { Upload, CheckCircle, XCircle } from 'lucide-react';
import { formatBytes, formatDateTime } from '../utils/format';

interface UploadEntry { name: string; size: number; status: string; time: string }

export default function UploadDisk() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [history, setHistory] = useState<UploadEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => setFile(f);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true); setProgress(0);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setHistory(prev => [{ name: file.name, size: file.size, status: 'completed', time: new Date().toISOString() }, ...prev]);
            resolve();
          } else { reject(new Error(`HTTP ${xhr.status}`)); }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        const token = sessionStorage.getItem('vmspawnd_token');
        xhr.open('POST', '/api/images/import');
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
      });
      setFile(null); setProgress(100);
    } catch (err) {
      console.error('Upload failed:', err);
      setHistory(prev => [{ name: file.name, size: file.size, status: 'failed', time: new Date().toISOString() }, ...prev]);
    } finally { setUploading(false); }
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Upload Disk</h1><p className="text-sm text-slate-400 mt-1">Upload disk images to the server</p></div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`bg-slate-800/50 rounded-xl p-10 border-2 border-dashed text-center cursor-pointer transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700/50 hover:border-slate-600'
        }`}
      >
        <Upload className="w-12 h-12 mx-auto mb-3 text-slate-500" />
        <p className="text-sm text-slate-300">{file ? file.name : 'Drop a disk image here or click to browse'}</p>
        {file && <p className="text-xs text-slate-500 mt-1">{formatBytes(file.size)}</p>}
        <input ref={inputRef} type="file" className="hidden" accept=".qcow2,.raw,.img,.vmdk,.vdi,.iso"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>

      {/* Progress */}
      {uploading && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white">Uploading {file?.name}</span>
            <span className="text-sm text-slate-400">{progress}%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Upload button */}
      {file && !uploading && (
        <button onClick={handleUpload}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <Upload className="w-4 h-4" />Upload
        </button>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700/50"><h3 className="text-sm font-semibold text-white">Upload History</h3></div>
          <div className="divide-y divide-slate-700/30">
            {history.map((h, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-700/20">
                {h.status === 'completed' ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{h.name}</p>
                  <p className="text-xs text-slate-500">{formatBytes(h.size)}</p>
                </div>
                <span className="text-xs text-slate-500">{formatDateTime(h.time)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
