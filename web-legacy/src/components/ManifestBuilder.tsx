// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useMemo } from 'react';
import { FileText, Copy, Download } from 'lucide-react';

interface ManifestConfig {
  name: string;
  cpus: number;
  memory: number;
  image: string;
  disk_size: number;
  disk_format: string;
  network_mode: string;
  bridge: string;
  os: string;
  cloud_init: boolean;
}

const INITIAL: ManifestConfig = {
  name: 'my-vm',
  cpus: 2,
  memory: 2048,
  image: 'ubuntu-24.04.qcow2',
  disk_size: 20,
  disk_format: 'qcow2',
  network_mode: 'bridge',
  bridge: 'virbr0',
  os: 'linux',
  cloud_init: false,
};

export default function ManifestBuilder() {
  const [config, setConfig] = useState<ManifestConfig>(INITIAL);
  const [format, setFormat] = useState<'yaml' | 'json'>('yaml');
  const [copied, setCopied] = useState(false);

  const set = (k: keyof ManifestConfig, v: string | number | boolean) =>
    setConfig({ ...config, [k]: v });

  const manifest = useMemo(() => {
    const obj: Record<string, unknown> = {};
    Object.entries(config).forEach(([k, v]) => {
      if (v !== '' && v !== 0 && v !== false) obj[k] = v;
    });
    if (format === 'json') {
      return JSON.stringify(obj, null, 2);
    }
    // Simple YAML serialization
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v}"` : v}`)
      .join('\n');
  }, [config, format]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(manifest);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadManifest = () => {
    const ext = format === 'json' ? 'json' : 'yaml';
    const blob = new Blob([manifest], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name || 'vm'}-manifest.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const Input = ({ label, field, type = 'text' }: { label: string; field: keyof ManifestConfig; type?: string }) => (
    <div>
      <label className="text-xs text-slate-400 block mb-1.5">{label}</label>
      <input type={type} value={String(config[field])}
        onChange={e => set(field, type === 'number' ? Number(e.target.value) : e.target.value)}
        className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" />
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Manifest Builder</h1>

      <div className="grid grid-cols-12 gap-4">
        {/* Form */}
        <div className="col-span-12 lg:col-span-6">
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 space-y-4">
            <h3 className="text-base font-semibold text-white">VM Configuration</h3>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Name" field="name" />
              <Input label="Image" field="image" />
              <Input label="vCPUs" field="cpus" type="number" />
              <Input label="Memory (MB)" field="memory" type="number" />
              <Input label="Disk Size (GB)" field="disk_size" type="number" />
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Disk Format</label>
                <select value={config.disk_format} onChange={e => set('disk_format', e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                  <option value="qcow2">QCOW2</option>
                  <option value="raw">Raw</option>
                  <option value="vmdk">VMDK</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Network Mode</label>
                <select value={config.network_mode} onChange={e => set('network_mode', e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                  <option value="bridge">Bridge</option>
                  <option value="nat">NAT</option>
                  <option value="none">None</option>
                </select>
              </div>
              <Input label="Bridge" field="bridge" />
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">OS Type</label>
                <select value={config.os} onChange={e => set('os', e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                  <option value="linux">Linux</option>
                  <option value="windows">Windows</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="flex items-center gap-3 col-span-2">
                <button onClick={() => set('cloud_init', !config.cloud_init)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${config.cloud_init ? 'bg-blue-600' : 'bg-slate-600'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${config.cloud_init ? 'left-5' : 'left-0.5'}`} />
                </button>
                <span className="text-sm text-slate-300">Enable cloud-init</span>
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="col-span-12 lg:col-span-6">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-semibold text-white">Preview</span>
              </div>
              <div className="flex items-center gap-2">
                <select value={format} onChange={e => setFormat(e.target.value as 'yaml' | 'json')}
                  className="bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-1 text-xs text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                  <option value="yaml">YAML</option>
                  <option value="json">JSON</option>
                </select>
                <button onClick={copyToClipboard}
                  className="flex items-center gap-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 text-xs text-white rounded-lg transition-colors">
                  <Copy className="w-3 h-3" /> {copied ? 'Copied!' : 'Copy'}
                </button>
                <button onClick={downloadManifest}
                  className="flex items-center gap-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 text-xs text-white rounded-lg transition-colors">
                  <Download className="w-3 h-3" /> Download
                </button>
              </div>
            </div>
            <div className="bg-slate-900 p-4 min-h-[300px]">
              <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">{manifest}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
