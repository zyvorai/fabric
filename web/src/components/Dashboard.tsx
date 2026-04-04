import { useEffect, useState, useCallback } from 'react';
import {
  Activity, Server, Cpu, HardDrive, Power,
  TrendingUp, Wifi, WifiOff,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { vmApi } from '../utils/api';

interface VM { name: string; state: string; cpus: number; memory: number; ip?: string }

interface MetricsPoint { time: string; cpu: number; memory: number }

const DARK_TOOLTIP_STYLE = {
  backgroundColor: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#e2e8f0',
};

function getStatusColor(state: string): string {
  switch (state) {
    case 'running': return 'bg-green-500';
    case 'stopped': return 'bg-red-500';
    case 'paused': return 'bg-yellow-500';
    default: return 'bg-slate-500';
  }
}

export default function Dashboard({ wsConnected }: { wsConnected: boolean }) {
  const [vms, setVMs] = useState<VM[]>([]);
  const [loading, setLoading] = useState(true);
  const [metricsHistory, setMetricsHistory] = useState<MetricsPoint[]>([]);

  const loadVMs = useCallback(async () => {
    try {
      const res = await vmApi.list() as { items: VM[]; total: number };
      setVMs(res.items || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadVMs();
    const interval = setInterval(loadVMs, 10000);
    return () => clearInterval(interval);
  }, [loadVMs]);

  // Collect real metrics from running VMs
  useEffect(() => {
    const collectMetrics = async () => {
      try {
        const runningVMs = vms.filter((v) => v.state === 'running');
        let avgCpu = 0;
        let avgMem = 0;
        if (runningVMs.length > 0) {
          const results = await Promise.all(
            runningVMs.map((v) =>
              vmApi.metrics(v.name).catch(() => ({ cpu_usage: 0, memory_usage: 0 }))
            )
          );
          const totals = results.reduce<{ cpu: number; mem: number }>(
            (acc, m: any) => ({
              cpu: acc.cpu + (m.cpu_usage || 0),
              mem: acc.mem + (m.memory_usage || 0),
            }),
            { cpu: 0, mem: 0 }
          );
          avgCpu = Math.round(totals.cpu / runningVMs.length);
          avgMem = Math.round(totals.mem / runningVMs.length);
        }
        setMetricsHistory((prev) => [
          ...prev.slice(-29),
          {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            cpu: avgCpu,
            memory: avgMem,
          },
        ]);
      } catch {
        // On error, record zeros
        setMetricsHistory((prev) => [
          ...prev.slice(-29),
          {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            cpu: 0,
            memory: 0,
          },
        ]);
      }
    };
    collectMetrics();
    const interval = setInterval(collectMetrics, 5000);
    return () => clearInterval(interval);
  }, [vms]);

  const stats = {
    total: vms.length,
    running: vms.filter((v) => v.state === 'running').length,
    stopped: vms.filter((v) => v.state === 'stopped').length,
    paused: vms.filter((v) => v.state === 'paused').length,
    totalCPU: vms.reduce((a, v) => a + v.cpus, 0),
    totalMem: vms.reduce((a, v) => a + v.memory, 0),
  };

  const latestCpu = metricsHistory.length > 0 ? metricsHistory[metricsHistory.length - 1].cpu : 0;
  const latestMem = metricsHistory.length > 0 ? metricsHistory[metricsHistory.length - 1].memory : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gradient-blue">vmspawnd</h1>
        <p className="text-sm text-slate-400 mt-1">
          {wsConnected ? 'Real-time monitoring active' : 'Connecting...'}
        </p>
      </div>

      {/* Connection Status Banner */}
      {wsConnected && (
        <div className="stat-card-green rounded-xl border border-slate-700/50 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <Wifi className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-400">Connected</span>
          </div>
          <span className="text-sm text-slate-400">{stats.running} VMs running</span>
        </div>
      )}

      {!wsConnected && (
        <div className="bg-red-500/10 rounded-xl border border-red-500/30 p-4">
          <div className="flex items-center gap-3">
            <WifiOff className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm font-semibold text-red-400">
              Server connection unavailable
            </p>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total VMs - Blue */}
        <div className="stat-card-blue rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Server className="h-5 w-5 text-white" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">total</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.total}</div>
          <div className="text-xs text-slate-400 mt-1">Total VMs</div>
        </div>

        {/* Running - Green */}
        <div className="stat-card-green rounded-xl border border-slate-700/50 p-5 card-glow-green transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-green-500/20">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
              {stats.total > 0 ? `${Math.round((stats.running / stats.total) * 100)}%` : '0%'}
            </span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.running}</div>
          <div className="text-xs text-slate-400 mt-1">Running</div>
        </div>

        {/* Stopped - Red */}
        <div className="stat-card-red rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/20">
              <Power className="h-5 w-5 text-white" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">stopped</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.stopped}</div>
          <div className="text-xs text-slate-400 mt-1">Stopped</div>
        </div>

        {/* Resources - Purple */}
        <div className="stat-card-purple rounded-xl border border-slate-700/50 p-5 card-glow-purple transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Cpu className="h-5 w-5 text-white" />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">
              {stats.totalCPU} vCPU
            </span>
          </div>
          <div className="text-2xl font-bold text-white">
            {stats.totalMem >= 1024 ? `${(stats.totalMem / 1024).toFixed(1)}` : stats.totalMem}
            <span className="text-sm text-slate-500 font-medium ml-1">{stats.totalMem >= 1024 ? 'GB' : 'MB'}</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">Total Memory</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CPU Chart */}
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-base font-semibold text-white">CPU Usage</h3>
            <span className={`ml-auto text-lg font-semibold tabular-nums ${latestCpu > 80 ? 'text-red-400' : latestCpu > 50 ? 'text-yellow-400' : 'text-blue-400'}`}>
              {metricsHistory.length > 0 ? `${latestCpu}%` : '--'}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={metricsHistory}>
              <defs>
                <linearGradient id="gradCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#475569" fontSize={11} domain={[0, 100]} tickLine={false} axisLine={false} width={30} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={DARK_TOOLTIP_STYLE} formatter={(value: number) => [`${value}%`, 'CPU']} />
              <Area type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#gradCpu)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Memory Chart */}
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <HardDrive className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-base font-semibold text-white">Memory Usage</h3>
            <span className={`ml-auto text-lg font-semibold tabular-nums ${latestMem > 80 ? 'text-red-400' : latestMem > 50 ? 'text-yellow-400' : 'text-emerald-400'}`}>
              {metricsHistory.length > 0 ? `${latestMem}%` : '--'}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={metricsHistory}>
              <defs>
                <linearGradient id="gradMem" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#475569" fontSize={11} domain={[0, 100]} tickLine={false} axisLine={false} width={30} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={DARK_TOOLTIP_STYLE} formatter={(value: number) => [`${value}%`, 'Memory']} />
              <Area type="monotone" dataKey="memory" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#gradMem)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* VM Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Server className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-white">Virtual Machines</h2>
          </div>
          <span className="text-xs font-medium text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">{vms.length} VMs</span>
        </div>
        {vms.length === 0 ? (
          <div className="p-10 text-center">
            <Server className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No virtual machines yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">CPU</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Memory</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {vms.map((vm) => (
                  <tr key={vm.name} className="table-row-hover transition-colors">
                    <td className="px-5 py-3 font-medium text-white">{vm.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${getStatusColor(vm.state)}`} />
                        <span className="text-slate-300 capitalize">{vm.state}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 tabular-nums">{vm.cpus} vCPU</td>
                    <td className="px-4 py-3 text-slate-400 tabular-nums">
                      {vm.memory >= 1024 ? `${(vm.memory / 1024).toFixed(1)} GB` : `${vm.memory} MB`}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{vm.ip || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export { Dashboard };
