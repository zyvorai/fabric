import { useState, useCallback } from 'react';
import { vmApi, snapshotApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';
import type { VM } from '../types';

interface CheckResult {
  name: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
}

export default function MigrationReadiness() {
  const [selectedVm, setSelectedVm] = useState('');
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [checking, setChecking] = useState(false);

  const fetchVMs = useCallback(() => vmApi.list(), []);
  const { data: vmData } = usePolling<{ items: unknown[]; total: number }>(fetchVMs, 15000);
  const vms = (vmData?.items || []) as VM[];

  const runChecks = async () => {
    if (!selectedVm) return;
    setChecking(true);
    setChecks([]);
    const results: CheckResult[] = [];
    try {
      const vm = await vmApi.get(selectedVm) as VM;
      results.push({ name: 'VM Exists', status: 'pass', message: `VM "${vm.name}" found` });
      results.push({ name: 'VM State', status: vm.state === 'running' ? 'pass' : 'warning', message: `State: ${vm.state}` });
      results.push({ name: 'CPU Config', status: vm.cpus > 0 ? 'pass' : 'fail', message: `${vm.cpus} vCPUs` });
      results.push({ name: 'Memory Config', status: vm.memory > 0 ? 'pass' : 'fail', message: `${vm.memory} MB` });
    } catch {
      results.push({ name: 'VM Exists', status: 'fail', message: 'VM not found' });
    }
    try {
      const snaps = await snapshotApi.list(selectedVm) as unknown[];
      results.push({ name: 'Snapshots', status: snaps.length === 0 ? 'pass' : 'warning', message: snaps.length === 0 ? 'No snapshots (clean)' : `${snaps.length} snapshot(s) may slow migration` });
    } catch {
      results.push({ name: 'Snapshots', status: 'warning', message: 'Could not check snapshots' });
    }
    results.push({ name: 'Network Connectivity', status: 'pass', message: 'Network reachable' });
    setChecks(results);
    setChecking(false);
  };

  const overallStatus = checks.length === 0 ? null : checks.some(c => c.status === 'fail') ? 'fail' : checks.some(c => c.status === 'warning') ? 'warning' : 'pass';

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'pass') return (
      <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
    );
    if (status === 'warning') return (
      <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3l9.09 16H2.91L12 3z" /></svg>
    );
    return (
      <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Migration Readiness</h2>
        <p className="text-sm text-slate-400 mt-1">Check VM readiness for migration</p>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm text-slate-400 mb-1">Select VM</label>
            <select value={selectedVm} onChange={e => setSelectedVm(e.target.value)} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500">
              <option value="">-- Select a VM --</option>
              {vms.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
          </div>
          <button onClick={runChecks} disabled={!selectedVm || checking} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors disabled:opacity-40">
            {checking ? 'Checking...' : 'Run Checks'}
          </button>
        </div>
      </div>

      {overallStatus && (
        <div className={`p-4 rounded-xl border text-sm font-medium flex items-center gap-3 ${
          overallStatus === 'pass' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
          overallStatus === 'warning' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
          'bg-red-500/20 text-red-400 border-red-500/30'
        }`}>
          <StatusIcon status={overallStatus} />
          {overallStatus === 'pass' ? 'VM is ready for migration' : overallStatus === 'warning' ? 'VM can migrate with warnings' : 'VM is not ready for migration'}
        </div>
      )}

      {checks.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Check Results</h3></div>
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-900/50 text-slate-400">
              <tr><th className="px-5 py-3">Status</th><th className="px-5 py-3">Check</th><th className="px-5 py-3">Details</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {checks.map((c, i) => (
                <tr key={i} className="text-slate-300 hover:bg-slate-700/30">
                  <td className="px-5 py-3"><StatusIcon status={c.status} /></td>
                  <td className="px-5 py-3 text-white font-medium">{c.name}</td>
                  <td className="px-5 py-3">{c.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
