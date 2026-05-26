// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback } from 'react';
import { Cpu, Server, Database, Zap, RefreshCw } from 'lucide-react';
import { systemApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';

type Tab = 'cpu' | 'numa' | 'memory' | 'optimization';

export default function SystemResources() {
  const [activeTab, setActiveTab] = useState<Tab>('cpu');
  const [allocSize, setAllocSize] = useState<'2mb' | '1gb'>('2mb');
  const [allocCount, setAllocCount] = useState(128);
  const [allocating, setAllocating] = useState(false);
  const [showAllocDialog, setShowAllocDialog] = useState(false);

  const fetchCpu = useCallback(() => systemApi.getCpuTopology(), []);
  const fetchNuma = useCallback(() => systemApi.getNumaTopology(), []);
  const fetchMemory = useCallback(() => systemApi.getSystemMemory(), []);
  const fetchHugepages = useCallback(() => systemApi.getHugepageStats(), []);
  const fetchRecommendations = useCallback(() => systemApi.getOptimizationRecommendations() as Promise<any[]>, []);

  const { data: cpuTopology, loading: cpuLoading, refresh: refreshCpu } = usePolling<any>(fetchCpu, 30000);
  const { data: numaTopology, loading: numaLoading, refresh: refreshNuma } = usePolling<any>(fetchNuma, 30000);
  const { data: systemMemory, loading: memLoading, refresh: refreshMem } = usePolling<any>(fetchMemory, 15000);
  const { data: hugepages, loading: hpLoading, refresh: refreshHp } = usePolling<any>(fetchHugepages, 30000);
  const { data: recommendations, refresh: refreshRecs } = usePolling<any[]>(fetchRecommendations, 60000);

  const loading = cpuLoading && numaLoading && memLoading && hpLoading;

  const refreshAll = () => {
    refreshCpu(); refreshNuma(); refreshMem(); refreshHp(); refreshRecs();
  };

  const formatKb = (kb: number) => {
    const gb = kb / (1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  };

  const formatMb = (mb: number) => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb} MB`;
  };

  const handleAllocate = async () => {
    setAllocating(true);
    try {
      await systemApi.allocateHugepages({ size: allocSize === '2mb' ? 'Size2MB' : 'Size1GB', count: allocCount });
      refreshHp();
      setShowAllocDialog(false);
    } catch (err) {
      console.error('Failed to allocate hugepages:', err);
    } finally {
      setAllocating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-400">Loading system resources...</span>
        </div>
      </div>
    );
  }

  const totalCpus = cpuTopology?.total_cpus || cpuTopology?.cpus?.length || 0;
  const sockets = cpuTopology?.sockets || 0;
  const coresPerSocket = cpuTopology?.cores_per_socket || 0;
  const threadsPerCore = cpuTopology?.threads_per_core || 1;
  const numaNodes = numaTopology?.nodes || [];
  const totalMemKb = systemMemory?.total_kb || 0;
  const availMemKb = systemMemory?.available_kb || 0;
  const hpTotal = hugepages?.total || 0;
  const hpFree = hugepages?.free || 0;
  const recs: any[] = recommendations || [];

  const tabs: { id: Tab; label: string }[] = [
    { id: 'cpu', label: 'CPU Topology' },
    { id: 'numa', label: 'NUMA Topology' },
    { id: 'memory', label: 'Memory & Hugepages' },
    { id: 'optimization', label: 'Optimization' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">System Resources</h2>
          <p className="text-sm text-slate-400 mt-1">Hardware topology and resource allocation</p>
        </div>
        <button onClick={refreshAll} className="flex items-center gap-2 px-4 py-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/50 text-slate-300 rounded-lg transition-colors text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-blue-500/10"><Cpu className="w-5 h-5 text-blue-400" /></div>
            <span className="text-sm text-slate-400">Total CPUs</span>
          </div>
          <div className="text-2xl font-bold text-white">{totalCpus}</div>
          <div className="text-xs text-slate-500 mt-1">{sockets} socket(s) x {coresPerSocket} cores</div>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-green-500/10"><Server className="w-5 h-5 text-green-400" /></div>
            <span className="text-sm text-slate-400">NUMA Nodes</span>
          </div>
          <div className="text-2xl font-bold text-white">{numaNodes.length}</div>
          <div className="text-xs text-slate-500 mt-1">{numaNodes.length > 0 ? 'Available' : 'Not available'}</div>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/10"><Database className="w-5 h-5 text-purple-400" /></div>
            <span className="text-sm text-slate-400">Total Memory</span>
          </div>
          <div className="text-2xl font-bold text-white">{totalMemKb ? formatKb(totalMemKb) : 'N/A'}</div>
          <div className="text-xs text-slate-500 mt-1">{availMemKb ? formatKb(availMemKb) : 'N/A'} available</div>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-yellow-500/10"><Zap className="w-5 h-5 text-yellow-400" /></div>
            <span className="text-sm text-slate-400">Hugepages</span>
          </div>
          <div className="text-2xl font-bold text-white">{hpTotal}</div>
          <div className="text-xs text-slate-500 mt-1">{hpFree} free</div>
        </div>
      </div>

      {/* Tabbed Content */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="border-b border-slate-700/50 flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'text-blue-400 border-b-2 border-blue-500 bg-slate-800/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
              }`}
            >
              {tab.label}
              {tab.id === 'optimization' && recs.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] bg-blue-500 text-white rounded-full">{recs.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* CPU Tab */}
          {activeTab === 'cpu' && (
            <div>
              {!cpuTopology ? (
                <p className="text-slate-400">CPU topology information not available.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Architecture</div>
                      <div className="text-lg font-medium text-white">
                        {sockets} Socket(s) x {coresPerSocket} Core(s) x {threadsPerCore} Thread(s)
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Online CPUs</div>
                      <div className="text-lg font-medium text-white">
                        {cpuTopology.online_cpus?.length ?? totalCpus} CPUs
                      </div>
                      {cpuTopology.offline_cpus?.length > 0 && (
                        <div className="text-xs text-slate-500">{cpuTopology.offline_cpus.length} offline</div>
                      )}
                    </div>
                  </div>

                  {cpuTopology.cpus && (() => {
                    const bySocket = new Map<number, any[]>();
                    cpuTopology.cpus.forEach((cpu: any) => {
                      const sid = cpu.socket_id ?? 0;
                      if (!bySocket.has(sid)) bySocket.set(sid, []);
                      bySocket.get(sid)!.push(cpu);
                    });
                    return Array.from(bySocket.entries()).map(([sid, cpus]) => (
                      <div key={sid} className="bg-slate-900/50 rounded-lg p-4 mb-4 border border-slate-700/30">
                        <div className="font-medium text-white mb-3">Socket {sid}</div>
                        <div className="grid grid-cols-8 gap-2">
                          {cpus.map((cpu: any) => (
                            <div
                              key={cpu.id}
                              className={`p-2 rounded text-center text-xs font-mono ${
                                cpu.online !== false
                                  ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                                  : 'bg-slate-800 text-slate-600 border border-slate-700/30'
                              }`}
                              title={`CPU ${cpu.id} | Core ${cpu.core_id} | NUMA ${cpu.numa_node ?? 'N/A'}`}
                            >
                              {cpu.id}
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </>
              )}
            </div>
          )}

          {/* NUMA Tab */}
          {activeTab === 'numa' && (
            <div>
              {numaNodes.length === 0 ? (
                <p className="text-slate-400">NUMA topology not available on this system.</p>
              ) : (
                <div className="space-y-4">
                  {numaNodes.map((node: any) => (
                    <div key={node.id} className="bg-slate-900/50 rounded-lg p-5 border border-slate-700/30">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div className="text-lg font-bold text-white">Node {node.id}</div>
                          <div className="text-xs text-slate-500">{node.cpus?.length || 0} CPUs</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-medium text-white">{formatMb(node.memory_total_mb || 0)}</div>
                          <div className="text-xs text-slate-500">{formatMb(node.memory_free_mb || 0)} free</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-slate-500 mb-1">CPU List</div>
                          <div className="font-mono text-xs text-slate-300">{node.cpus?.join(', ') || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Memory Usage</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{
                                  width: node.memory_total_mb
                                    ? `${((node.memory_total_mb - (node.memory_free_mb || 0)) / node.memory_total_mb * 100)}%`
                                    : '0%',
                                }}
                              />
                            </div>
                            <span className="text-xs text-slate-400">
                              {node.memory_total_mb
                                ? `${((node.memory_total_mb - (node.memory_free_mb || 0)) / node.memory_total_mb * 100).toFixed(0)}%`
                                : '0%'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {(node.hugepages_2mb_total > 0 || node.hugepages_1gb_total > 0) && (
                        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-700/30">
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Hugepages 2MB</div>
                            <div className="text-sm text-slate-300">{node.hugepages_2mb_free} / {node.hugepages_2mb_total} free</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Hugepages 1GB</div>
                            <div className="text-sm text-slate-300">{node.hugepages_1gb_free} / {node.hugepages_1gb_total} free</div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {numaTopology.distances?.length > 0 && (
                    <div className="bg-slate-900/50 rounded-lg p-5 border border-slate-700/30">
                      <div className="font-medium text-white mb-3">Inter-Node Distances</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr>
                              <th className="p-2 text-left text-xs text-slate-500">From \ To</th>
                              {numaNodes.map((n: any) => (
                                <th key={n.id} className="p-2 text-xs text-slate-500 text-center">Node {n.id}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {numaTopology.distances.map((row: number[], fromIdx: number) => (
                              <tr key={fromIdx}>
                                <td className="p-2 text-xs font-medium text-white">Node {fromIdx}</td>
                                {row.map((distance: number, toIdx: number) => (
                                  <td
                                    key={toIdx}
                                    className={`p-2 text-xs text-center text-slate-300 ${fromIdx === toIdx ? 'bg-blue-500/10' : ''}`}
                                  >
                                    {distance}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Memory Tab */}
          {activeTab === 'memory' && (
            <div>
              {!systemMemory ? (
                <p className="text-slate-400">Memory information not available.</p>
              ) : (
                <>
                  <div className="bg-slate-900/50 rounded-lg p-5 border border-slate-700/30 mb-6">
                    <div className="text-lg font-medium text-white mb-4">System Memory</div>
                    {(() => {
                      const usagePct = totalMemKb > 0 ? ((totalMemKb - availMemKb) / totalMemKb * 100) : 0;
                      return (
                        <>
                          <div className="grid grid-cols-3 gap-6 mb-4">
                            <div>
                              <div className="text-xs text-slate-500 mb-1">Total</div>
                              <div className="text-xl font-medium text-white">{formatKb(totalMemKb)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-500 mb-1">Available</div>
                              <div className="text-xl font-medium text-green-400">{formatKb(availMemKb)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-500 mb-1">Usage</div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-800 rounded-full h-3 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      usagePct > 90 ? 'bg-red-500' : usagePct > 75 ? 'bg-yellow-500' : 'bg-blue-500'
                                    }`}
                                    style={{ width: `${usagePct}%` }}
                                  />
                                </div>
                                <span className="text-sm text-slate-300">{usagePct.toFixed(0)}%</span>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-6 pt-3 border-t border-slate-700/30">
                            <div>
                              <div className="text-xs text-slate-500 mb-1">Buffers</div>
                              <div className="text-sm text-slate-300">{formatKb(systemMemory.buffers_kb || 0)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-500 mb-1">Cached</div>
                              <div className="text-sm text-slate-300">{formatKb(systemMemory.cached_kb || 0)}</div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <div className="text-lg font-medium text-white">Hugepages</div>
                    <button
                      onClick={() => setShowAllocDialog(true)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                    >
                      Allocate Hugepages
                    </button>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-5 border border-slate-700/30">
                    {hugepages ? (
                      <div className="grid grid-cols-3 gap-6">
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Total</div>
                          <div className="text-2xl font-bold text-white">{hugepages.total}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Free</div>
                          <div className="text-xl text-green-400">{hugepages.free}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Reserved</div>
                          <div className="text-sm text-slate-300">{hugepages.reserved ?? 'N/A'}</div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-400">Hugepage statistics not available.</p>
                    )}
                  </div>
                </>
              )}

              {/* Allocate Hugepages Dialog */}
              {showAllocDialog && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center" onClick={() => setShowAllocDialog(false)}>
                  <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-lg font-bold text-white mb-4">Allocate Hugepages</h3>
                    <div className="mb-4">
                      <label className="block text-sm text-slate-400 mb-1">Size</label>
                      <select
                        value={allocSize}
                        onChange={(e) => setAllocSize(e.target.value as '2mb' | '1gb')}
                        className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="2mb">2MB</option>
                        <option value="1gb">1GB</option>
                      </select>
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm text-slate-400 mb-1">Count</label>
                      <input
                        type="number"
                        value={allocCount}
                        onChange={(e) => setAllocCount(parseInt(e.target.value) || 0)}
                        min={0}
                        className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="text-xs text-slate-500 mt-1">
                        Total: {allocSize === '2mb' ? (allocCount * 2 / 1024).toFixed(2) : allocCount} GB
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => setShowAllocDialog(false)} className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors text-sm">Cancel</button>
                      <button onClick={handleAllocate} disabled={allocating} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm disabled:opacity-40">
                        {allocating ? 'Allocating...' : 'Allocate'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Optimization Tab */}
          {activeTab === 'optimization' && (
            <div>
              {recs.length === 0 ? (
                <div className="text-center py-12">
                  <Zap className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                  <p className="text-lg text-slate-400 mb-1">No optimization recommendations</p>
                  <p className="text-sm text-slate-500">All running VMs are configured optimally, or no VMs are running.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-slate-400">
                    Recommendations based on system topology analysis. Click "Apply" to auto-configure optimal settings.
                  </p>
                  {recs.map((rec: any, idx: number) => (
                    <div key={rec.vm_name || idx} className="bg-slate-900/50 rounded-lg p-5 border border-slate-700/30">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-white">{rec.vm_name}</h3>
                        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">
                          <Zap className="w-4 h-4" /> Apply
                        </button>
                      </div>
                      <div className="space-y-2">
                        {(rec.recommendations || []).map((r: any, i: number) => (
                          <div key={i} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/20">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-blue-400">{r.resource}</span>
                              <span className="text-xs text-slate-500">{r.current_value} &rarr; {r.recommended_value}</span>
                            </div>
                            <p className="text-xs text-slate-400">{r.reason}</p>
                            {r.impact && <p className="text-xs text-green-400 mt-1">{r.impact}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
