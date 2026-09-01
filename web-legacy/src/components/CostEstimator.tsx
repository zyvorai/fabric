// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { DollarSign, Calculator } from 'lucide-react';

interface CostResult {
  label: string;
  amount: number;
}

const PRICES: Record<string, Record<string, number>> = {
  local: { raw: 0.02, qcow2: 0.015, vmdk: 0.018 },
  cloud: { raw: 0.08, qcow2: 0.06, vmdk: 0.07 },
};

export default function CostEstimator() {
  const [diskCount, setDiskCount] = useState(1);
  const [diskSize, setDiskSize] = useState(50);
  const [format, setFormat] = useState('qcow2');
  const [provider, setProvider] = useState('local');
  const [includeSnapshots, setIncludeSnapshots] = useState(false);
  const [results, setResults] = useState<CostResult[] | null>(null);

  const calculate = () => {
    const pricePerGb = PRICES[provider]?.[format] || 0.05;
    const baseCost = diskCount * diskSize * pricePerGb;
    const snapshotCost = includeSnapshots ? baseCost * 0.3 : 0;
    const totalMonthly = baseCost + snapshotCost;

    const items: CostResult[] = [
      { label: 'Base Storage', amount: baseCost },
    ];
    if (includeSnapshots) {
      items.push({ label: 'Snapshot Overhead (30%)', amount: snapshotCost });
    }
    items.push(
      { label: 'Monthly Total', amount: totalMonthly },
      { label: 'Annual Estimate', amount: totalMonthly * 12 },
    );
    setResults(items);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Cost Estimator</h1>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 space-y-4">
        <h3 className="text-base font-semibold text-white">Storage Cost Calculator</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Number of Disks</label>
            <input type="number" min={1} value={diskCount} onChange={e => setDiskCount(Number(e.target.value))}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Disk Size (GB)</label>
            <input type="number" min={1} value={diskSize} onChange={e => setDiskSize(Number(e.target.value))}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Disk Format</label>
            <select value={format} onChange={e => setFormat(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
              <option value="qcow2">QCOW2</option>
              <option value="raw">Raw</option>
              <option value="vmdk">VMDK</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Provider</label>
            <select value={provider} onChange={e => setProvider(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
              <option value="local">Local Storage</option>
              <option value="cloud">Cloud Storage</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setIncludeSnapshots(!includeSnapshots)}
            className={`w-10 h-5 rounded-full transition-colors relative ${includeSnapshots ? 'bg-blue-600' : 'bg-slate-600'}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${includeSnapshots ? 'left-5' : 'left-0.5'}`} />
          </button>
          <span className="text-sm text-slate-300">Include snapshot storage overhead</span>
        </div>

        <button onClick={calculate}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          <Calculator className="w-4 h-4" /> Calculate Cost
        </button>
      </div>

      {results && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-green-500/20">
              <DollarSign className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-white">Cost Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Item</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                <tr className="hover:bg-slate-700/20">
                  <td className="px-5 py-3 text-slate-400">Configuration</td>
                  <td className="px-5 py-3 text-right text-slate-300">{diskCount} x {diskSize} GB {format.toUpperCase()} ({provider})</td>
                </tr>
                {results.map((r, i) => (
                  <tr key={i} className={`hover:bg-slate-700/20 ${r.label.includes('Total') || r.label.includes('Annual') ? 'font-semibold' : ''}`}>
                    <td className="px-5 py-3 text-white">{r.label}</td>
                    <td className="px-5 py-3 text-right text-white tabular-nums">${r.amount.toFixed(2)}/mo</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!results && (
        <div className="bg-slate-800/50 rounded-xl p-12 border border-slate-700/50 text-center">
          <DollarSign className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Configure your storage and click Calculate</p>
        </div>
      )}
    </div>
  );
}
