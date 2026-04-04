import { useState } from 'react';
import { Play, CheckCircle, XCircle } from 'lucide-react';
import { vmApi } from '../utils/api';

interface ImportVM { name: string; cpus: number; memory: number; image?: string; status?: string }

export default function BatchImport() {
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<ImportVM[]>([]);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<ImportVM[]>([]);

  const handleParse = () => {
    setParseError('');
    setParsed([]);
    const text = input.trim();
    if (!text) return;

    try {
      // Try JSON first
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : [data];
      const vms: ImportVM[] = arr.map((v: any) => ({
        name: v.name || '', cpus: v.cpus || 1, memory: v.memory || 1024, image: v.image || '',
      }));
      if (vms.some(v => !v.name)) { setParseError('Each VM must have a name'); return; }
      setParsed(vms);
    } catch {
      // Try CSV
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { setParseError('CSV needs a header row + data'); return; }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const nameIdx = headers.indexOf('name');
      if (nameIdx < 0) { setParseError('CSV must have a "name" column'); return; }
      const vms: ImportVM[] = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim());
        return {
          name: cols[nameIdx] || '',
          cpus: parseInt(cols[headers.indexOf('cpus')] || '1') || 1,
          memory: parseInt(cols[headers.indexOf('memory')] || '1024') || 1024,
          image: cols[headers.indexOf('image')] || '',
        };
      }).filter(v => v.name);
      if (vms.length === 0) { setParseError('No valid VMs found in CSV'); return; }
      setParsed(vms);
    }
  };

  const handleImport = async () => {
    if (parsed.length === 0) return;
    setImporting(true);
    setResults([]);
    setProgress({ done: 0, total: parsed.length });
    const res: ImportVM[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const vm = parsed[i];
      try {
        await vmApi.create({ name: vm.name, cpus: vm.cpus, memory: vm.memory, image: vm.image || undefined });
        res.push({ ...vm, status: 'success' });
      } catch {
        res.push({ ...vm, status: 'failed' });
      }
      setProgress({ done: i + 1, total: parsed.length });
    }

    setResults(res);
    setImporting(false);
    setProgress(null);
    setParsed([]);
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Batch Import</h1><p className="text-sm text-slate-400 mt-1">Import multiple VMs from JSON or CSV</p></div>

      {/* Input */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 space-y-3">
        <h3 className="text-sm font-semibold text-white">Paste JSON or CSV</h3>
        <textarea value={input} onChange={e => setInput(e.target.value)} rows={8}
          placeholder={'JSON:\n[{"name":"vm1","cpus":2,"memory":2048}]\n\nCSV:\nname,cpus,memory,image\nvm1,2,2048,ubuntu.qcow2'}
          className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white font-mono focus:ring-2 focus:ring-blue-500 resize-y" />
        {parseError && <p className="text-sm text-red-400">{parseError}</p>}
        <button onClick={handleParse} disabled={!input.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50">
          Parse
        </button>
      </div>

      {/* Preview */}
      {parsed.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">{parsed.length} VMs to import</h3>
            <button onClick={handleImport} disabled={importing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
              <Play className="w-4 h-4" />{importing ? 'Importing...' : 'Import All'}
            </button>
          </div>
          <table className="w-full"><thead><tr className="border-b border-slate-700/50">
            {['Name', 'CPUs', 'Memory', 'Image'].map(h =>
              <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-700/30">
            {parsed.map((vm, i) => (
              <tr key={i} className="hover:bg-slate-700/20">
                <td className="px-4 py-3 text-sm text-white font-medium">{vm.name}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{vm.cpus}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{vm.memory} MB</td>
                <td className="px-4 py-3 text-sm text-slate-300">{vm.image || '-'}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {/* Progress */}
      {progress && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <p className="text-sm text-white mb-2">Importing: {progress.done}/{progress.total}</p>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700/50"><h3 className="text-sm font-semibold text-white">Results</h3></div>
          <div className="divide-y divide-slate-700/30">
            {results.map((r, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-700/20">
                {r.status === 'success' ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                <span className="text-sm text-white">{r.name}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${r.status === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
