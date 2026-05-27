// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback, Fragment } from 'react';
import { vmApi, migrationApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';
import type { VM } from '../types';

const STEPS = ['Select VM', 'Configure Source', 'Configure Target', 'Review'];

export default function MigrationWizard() {
  const [step, setStep] = useState(0);
  const [selectedVm, setSelectedVm] = useState('');
  const [sourceHost, setSourceHost] = useState('');
  const [targetHost, setTargetHost] = useState('');
  const [targetFormat, setTargetFormat] = useState('qcow2');
  const [bandwidth, setBandwidth] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const fetchVMs = useCallback(() => vmApi.list(), []);
  const { data: vmData } = usePolling<{ items: unknown[]; total: number }>(fetchVMs, 15000);
  const vms = (vmData?.items || []) as VM[];

  const canNext = () => {
    if (step === 0) return !!selectedVm;
    if (step === 1) return !!sourceHost;
    if (step === 2) return !!targetHost;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setResult(null);
    try {
      await migrationApi.start({
        vm_name: selectedVm, source: sourceHost, destination: targetHost,
        target_format: targetFormat, bandwidth_limit: bandwidth ? Number(bandwidth) : undefined,
      });
      setResult('Migration started successfully');
      setStep(0); setSelectedVm(''); setSourceHost(''); setTargetHost('');
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Migration Wizard</h2>
        <p className="text-sm text-slate-400 mt-1">Step-by-step VM migration</p>
      </div>

      {result && (
        <div className={`p-4 rounded-xl text-sm ${result.startsWith('Error') ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
          {result}
        </div>
      )}

      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <Fragment key={s}>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${i === step ? 'bg-blue-600 text-white' : i < step ? 'bg-green-600/20 text-green-400' : 'bg-slate-800/50 text-slate-500'}`}>
              <span className="w-6 h-6 rounded-full bg-slate-700/50 flex items-center justify-center text-xs">{i + 1}</span>
              {s}
            </div>
            {i < STEPS.length - 1 && <div className="w-8 h-px bg-slate-700" />}
          </Fragment>
        ))}
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        {step === 0 && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Select VM</h3>
            <select value={selectedVm} onChange={e => setSelectedVm(e.target.value)} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500">
              <option value="">-- Select a VM --</option>
              {vms.map(v => <option key={v.name} value={v.name}>{v.name} ({v.state})</option>)}
            </select>
          </div>
        )}

        {step === 1 && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Configure Source</h3>
            <label className="block text-sm text-slate-400 mb-1">Source Host</label>
            <input value={sourceHost} onChange={e => setSourceHost(e.target.value)} placeholder="source-host-01" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">Configure Target</h3>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Target Host</label>
              <input value={targetHost} onChange={e => setTargetHost(e.target.value)} placeholder="target-host-01" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Target Format</label>
                <select value={targetFormat} onChange={e => setTargetFormat(e.target.value)} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500">
                  <option value="qcow2">qcow2</option><option value="raw">raw</option><option value="vmdk">vmdk</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Bandwidth Limit (MB/s)</label>
                <input type="number" value={bandwidth} onChange={e => setBandwidth(e.target.value)} placeholder="Unlimited" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Review</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="text-slate-400">VM:</div><div className="text-white">{selectedVm}</div>
              <div className="text-slate-400">Source Host:</div><div className="text-white">{sourceHost}</div>
              <div className="text-slate-400">Target Host:</div><div className="text-white">{targetHost}</div>
              <div className="text-slate-400">Target Format:</div><div className="text-white">{targetFormat}</div>
              <div className="text-slate-400">Bandwidth:</div><div className="text-white">{bandwidth ? `${bandwidth} MB/s` : 'Unlimited'}</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={() => setStep(s => s - 1)} disabled={step === 0} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors disabled:opacity-40">
          Back
        </button>
        {step < 3 ? (
          <button onClick={() => setStep(s => s + 1)} disabled={!canNext()} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors disabled:opacity-40">
            Next
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors disabled:opacity-40">
            {submitting ? 'Starting...' : 'Start Migration'}
          </button>
        )}
      </div>
    </div>
  );
}
