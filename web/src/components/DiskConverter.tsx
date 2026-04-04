import { useState } from 'react';
import { RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { imageApi } from '../utils/api';

export default function DiskConverter() {
  const [source, setSource] = useState('');
  const [name, setName] = useState('');
  const [targetFormat, setTargetFormat] = useState('qcow2');
  const [converting, setConverting] = useState(false);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);

  const handleConvert = async () => {
    if (!source.trim()) return;
    setConverting(true);
    setResult(null);

    // Derive a VM name from the filename if not provided
    const vmName = name.trim() || source.split('/').pop()?.replace(/\.[^.]+$/, '') || 'imported-vm';

    try {
      const res = await imageApi.importImage({
        source_path: source.trim(),
        name: vmName,
        target_format: targetFormat,
      }) as { vm_name?: string; image_path?: string; source_format?: string; target_format?: string };

      setResult({
        status: 'success',
        message: `Converted ${res.source_format || 'source'} to ${res.target_format || targetFormat} successfully. Output: ${res.image_path || vmName}`,
      });
    } catch (err) {
      setResult({
        status: 'error',
        message: err instanceof Error ? err.message : 'Conversion failed',
      });
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Disk Converter</h1>
        <p className="text-sm text-slate-400 mt-1">Convert disk images between formats</p>
      </div>

      {/* Form */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 space-y-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Source File Path</label>
          <input value={source} onChange={e => setSource(e.target.value)}
            placeholder="/var/lib/vmspawn/images/disk.raw"
            className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">VM Name (optional, derived from filename)</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="my-imported-vm"
            className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Target Format</label>
          <select value={targetFormat} onChange={e => setTargetFormat(e.target.value)}
            className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500">
            <option value="qcow2">qcow2</option>
            <option value="raw">raw</option>
            <option value="vmdk">vmdk</option>
          </select>
        </div>
        <button onClick={handleConvert} disabled={converting || !source.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${converting ? 'animate-spin' : ''}`} />
          {converting ? 'Converting...' : 'Convert'}
        </button>
      </div>

      {/* Converting indicator */}
      {converting && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-white">Converting disk image via qemu-img...</span>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 flex items-center gap-3 ${
          result.status === 'success' ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500'
        }`}>
          {result.status === 'success'
            ? <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
            : <XCircle className="w-5 h-5 text-red-400 shrink-0" />}
          <p className="text-sm text-white">{result.message}</p>
        </div>
      )}
    </div>
  );
}
