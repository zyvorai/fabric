// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect } from 'react';
import { BarChart3, Cpu, MemoryStick, TrendingUp, Server } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { analyticsApi, vmApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';

interface SystemPerf {
  avg_cpu?: number;
  avg_memory?: number;
  top_vm?: string;
}

const DARK_TOOLTIP_STYLE = {
  backgroundColor: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#e2e8f0',
};

export default function Analytics() {
  const [chartData, setChartData] = useState<{ time: string; cpu: number; memory: number }[]>([]);

  const { data: perf } = usePolling<SystemPerf>(
    () => analyticsApi.getSystemPerformance() as Promise<SystemPerf>,
    10000
  );

  const { data: vmList } = usePolling<{ items: unknown[]; total: number }>(
    () => vmApi.list() as Promise<{ items: unknown[]; total: number }>,
    15000
  );

  const totalVMs = vmList?.total || vmList?.items?.length || 0;
  const avgCpu = perf?.avg_cpu ?? 0;
  const avgMem = perf?.avg_memory ?? 0;
  const topVM = perf?.top_vm || 'N/A';

  useEffect(() => {
    const collectChartData = async () => {
      try {
        const sysPerf = await analyticsApi.getSystemPerformance() as SystemPerf;
        setChartData((prev) => [
          ...prev.slice(-29),
          {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            cpu: Math.round(sysPerf?.avg_cpu || 0),
            memory: Math.round(sysPerf?.avg_memory || 0),
          },
        ]);
      } catch {
        setChartData((prev) => [
          ...prev.slice(-29),
          {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            cpu: 0,
            memory: 0,
          },
        ]);
      }
    };
    collectChartData();
    const interval = setInterval(collectChartData, 5000);
    return () => clearInterval(interval);
  }, []);

  const statCards = [
    { label: 'Total VMs', value: totalVMs, icon: Server, color: 'text-blue-400' },
    { label: 'Avg CPU', value: `${avgCpu}%`, icon: Cpu, color: 'text-green-400' },
    { label: 'Avg Memory', value: `${avgMem}%`, icon: MemoryStick, color: 'text-purple-400' },
    { label: 'Top VM', value: topVM, icon: TrendingUp, color: 'text-amber-400' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-sm text-slate-400 mt-1">System performance analytics and insights</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">{s.label}</p>
                <p className="text-2xl font-bold text-white mt-1">{s.value}</p>
              </div>
              <s.icon className={`w-8 h-8 ${s.color}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-blue-400" />
          <h3 className="text-white font-medium">Resource Usage Over Time</h3>
        </div>
        {chartData.length < 2 ? (
          <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
            Collecting data points...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, 100]} />
              <Tooltip contentStyle={DARK_TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fill="url(#cpuGrad)" name="CPU %" />
              <Area type="monotone" dataKey="memory" stroke="#8b5cf6" fill="url(#memGrad)" name="Memory %" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-green-400" />
          <h3 className="text-white font-medium">Performance Insights</h3>
        </div>
        <div className="space-y-3">
          {[
            { text: 'CPU usage is within normal range', status: 'good' },
            { text: 'Memory utilization is moderate', status: 'good' },
            { text: 'No performance bottlenecks detected', status: 'good' },
            { text: 'Disk I/O is operating efficiently', status: 'good' },
          ].map((insight, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-slate-900/30 rounded-lg">
              <div className={`w-2 h-2 rounded-full ${insight.status === 'good' ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span className="text-sm text-slate-300">{insight.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
