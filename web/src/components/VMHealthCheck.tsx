// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback } from 'react';
import { Stethoscope, Activity } from 'lucide-react';
import { vmApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';

interface VM {
  name: string;
  state?: string;
  cpus?: number;
  memory?: number;
}

interface CheckResult {
  name: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
}

const PassIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
    <circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />
  </svg>
);

const WarnIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" /><path d="M12 17h.01" />
  </svg>
);

const FailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
    <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
  </svg>
);

export default function VMHealthCheck() {
  const [selected, setSelected] = useState('');
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<CheckResult[]>([]);

  const fetchVMs = useCallback(async () => {
    const res = await vmApi.list() as { items: VM[]; total: number };
    return res.items || [];
  }, []);
  const { data: vms } = usePolling(fetchVMs, 30000);

  const items = vms || [];

  const runCheck = async () => {
    if (!selected) return;
    setChecking(true);
    setResults([]);
    try {
      const vm = await vmApi.get(selected) as VM;
      const checks: CheckResult[] = [];

      checks.push({
        name: 'VM State',
        status: vm.state === 'running' ? 'pass' : vm.state === 'paused' ? 'warning' : 'fail',
        message: vm.state === 'running' ? 'VM is running' : `VM is ${vm.state || 'unknown'}`,
      });
      checks.push({
        name: 'CPU Allocation',
        status: (vm.cpus || 0) > 0 ? 'pass' : 'fail',
        message: (vm.cpus || 0) > 0 ? `${vm.cpus} vCPUs allocated` : 'No CPUs allocated',
      });
      checks.push({
        name: 'Memory Allocation',
        status: (vm.memory || 0) >= 512 ? 'pass' : (vm.memory || 0) > 0 ? 'warning' : 'fail',
        message: (vm.memory || 0) >= 512 ? `${vm.memory} MB allocated` : `Low memory: ${vm.memory || 0} MB`,
      });
      checks.push({
        name: 'CPU Sizing',
        status: (vm.cpus || 0) <= 8 ? 'pass' : 'warning',
        message: (vm.cpus || 0) <= 8 ? 'CPU count is reasonable' : 'High CPU count - verify necessity',
      });
      checks.push({
        name: 'Memory Sizing',
        status: (vm.memory || 0) <= 16384 ? 'pass' : 'warning',
        message: (vm.memory || 0) <= 16384 ? 'Memory allocation is reasonable' : 'High memory allocation',
      });

      setResults(checks);
    } catch (err) {
      setResults([{ name: 'Connection', status: 'fail', message: `Failed to fetch VM: ${err}` }]);
    } finally {
      setChecking(false);
    }
  };

  const overallStatus = results.length === 0 ? null :
    results.some(r => r.status === 'fail') ? 'fail' :
    results.some(r => r.status === 'warning') ? 'warning' : 'pass';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">VM Health Check</h1>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="text-xs text-slate-400 block mb-2">Select VM</label>
            <select value={selected} onChange={e => setSelected(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
              <option value="">Choose a VM...</option>
              {items.map(vm => <option key={vm.name} value={vm.name}>{vm.name}</option>)}
            </select>
          </div>
          <button onClick={runCheck} disabled={!selected || checking}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            <Stethoscope className="w-4 h-4" />
            {checking ? 'Checking...' : 'Run Check'}
          </button>
        </div>
      </div>

      {overallStatus && (
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${
          overallStatus === 'pass' ? 'bg-green-500/10 border-green-500/30' :
          overallStatus === 'warning' ? 'bg-yellow-500/10 border-yellow-500/30' :
          'bg-red-500/10 border-red-500/30'
        }`}>
          {overallStatus === 'pass' ? <PassIcon /> : overallStatus === 'warning' ? <WarnIcon /> : <FailIcon />}
          <span className={`text-sm font-medium ${
            overallStatus === 'pass' ? 'text-green-400' :
            overallStatus === 'warning' ? 'text-yellow-400' : 'text-red-400'
          }`}>
            Overall: {overallStatus === 'pass' ? 'Healthy' : overallStatus === 'warning' ? 'Warnings Detected' : 'Issues Found'}
          </span>
          <span className="ml-auto text-xs text-slate-400">
            {results.filter(r => r.status === 'pass').length}/{results.length} checks passed
          </span>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={i} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 flex items-center gap-3">
              {r.status === 'pass' ? <PassIcon /> : r.status === 'warning' ? <WarnIcon /> : <FailIcon />}
              <div className="flex-1">
                <div className="text-sm font-medium text-white">{r.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">{r.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {results.length === 0 && !checking && (
        <div className="bg-slate-800/50 rounded-xl p-12 border border-slate-700/50 text-center">
          <Activity className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Select a VM and run a health check</p>
        </div>
      )}
    </div>
  );
}
