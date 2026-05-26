// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback, useEffect } from 'react';
import { GitCompare } from 'lucide-react';
import { vmApi } from '../utils/api';
import { formatMemory } from '../utils/format';
import { usePolling } from '../hooks/usePolling';

interface VM {
  name: string;
  state?: string;
  cpus?: number;
  memory?: number;
  ip?: string;
  disk_size?: number;
  os?: string;
  image?: string;
}

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
  </svg>
);

export default function VMCompare() {
  const [vmA, setVmA] = useState('');
  const [vmB, setVmB] = useState('');
  const [detailA, setDetailA] = useState<VM | null>(null);
  const [detailB, setDetailB] = useState<VM | null>(null);

  const fetchVMs = useCallback(async () => {
    const res = await vmApi.list() as { items: VM[]; total: number };
    return res.items || [];
  }, []);
  const { data: vms } = usePolling(fetchVMs, 30000);

  const items = vms || [];

  useEffect(() => {
    if (vmA) { vmApi.get(vmA).then(d => setDetailA(d as VM)).catch(() => setDetailA(null)); }
    else setDetailA(null);
  }, [vmA]);

  useEffect(() => {
    if (vmB) { vmApi.get(vmB).then(d => setDetailB(d as VM)).catch(() => setDetailB(null)); }
    else setDetailB(null);
  }, [vmB]);

  const fields: { label: string; key: keyof VM; format?: (v: unknown) => string }[] = [
    { label: 'State', key: 'state' },
    { label: 'CPUs', key: 'cpus', format: v => `${v} vCPU` },
    { label: 'Memory', key: 'memory', format: v => formatMemory(v as number) },
    { label: 'IP Address', key: 'ip' },
    { label: 'OS', key: 'os' },
    { label: 'Image', key: 'image' },
  ];

  const matchCount = detailA && detailB
    ? fields.filter(f => String(detailA[f.key] || '') === String(detailB[f.key] || '')).length
    : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">VM Compare</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <label className="text-xs text-slate-400 block mb-2">VM A</label>
          <select value={vmA} onChange={e => setVmA(e.target.value)}
            className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
            <option value="">Select a VM...</option>
            {items.map(vm => <option key={vm.name} value={vm.name}>{vm.name}</option>)}
          </select>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <label className="text-xs text-slate-400 block mb-2">VM B</label>
          <select value={vmB} onChange={e => setVmB(e.target.value)}
            className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
            <option value="">Select a VM...</option>
            {items.map(vm => <option key={vm.name} value={vm.name}>{vm.name}</option>)}
          </select>
        </div>
      </div>

      {detailA && detailB && (
        <>
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${
            matchCount === fields.length
              ? 'bg-green-500/10 border-green-500/30'
              : matchCount >= fields.length / 2
              ? 'bg-yellow-500/10 border-yellow-500/30'
              : 'bg-red-500/10 border-red-500/30'
          }`}>
            <GitCompare className="w-5 h-5 text-slate-300" />
            <span className="text-sm text-white font-medium">
              {matchCount} of {fields.length} properties match
            </span>
          </div>

          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Property</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{detailA.name}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{detailB.name}</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {fields.map(f => {
                  const valA = detailA[f.key];
                  const valB = detailB[f.key];
                  const dispA = f.format ? f.format(valA) : String(valA || '-');
                  const dispB = f.format ? f.format(valB) : String(valB || '-');
                  const match = String(valA || '') === String(valB || '');
                  return (
                    <tr key={f.key} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-5 py-3 font-medium text-white">{f.label}</td>
                      <td className="px-4 py-3 text-slate-300">{dispA}</td>
                      <td className="px-4 py-3 text-slate-300">{dispB}</td>
                      <td className="px-4 py-3 text-center">{match ? <CheckIcon /> : <XIcon />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {(!vmA || !vmB) && (
        <div className="bg-slate-800/50 rounded-xl p-12 border border-slate-700/50 text-center">
          <GitCompare className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Select two VMs above to compare their configurations</p>
        </div>
      )}
    </div>
  );
}
