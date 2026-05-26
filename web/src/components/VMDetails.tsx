// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback } from 'react';
import {
  ArrowLeft, Play, Square, RotateCcw, Trash2, Cpu, MemoryStick,
  Globe, HardDrive, Clock, Image, Camera, Undo2, Monitor, Tag,
  Hash, AlertTriangle, Server,
} from 'lucide-react';
import { useViewContext } from '../App';
import { vmApi, snapshotApi } from '../utils/api';
import { formatMemory, formatBytes, getStatusBadgeClasses, formatDateTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { VM, VMMetrics, VMSnapshot } from '../types';

type Tab = 'overview' | 'disks' | 'network' | 'snapshots';

export default function VMDetails() {
  const { navigateTo, selectedVM } = useViewContext();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [actionLoading, setActionLoading] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);

  const vmName = selectedVM || '';

  const fetchVM = useCallback(() => vmApi.get(vmName) as Promise<VM>, [vmName]);
  const fetchMetrics = useCallback(() => vmApi.metrics(vmName) as Promise<VMMetrics>, [vmName]);
  const fetchSnapshots = useCallback(() => snapshotApi.list(vmName) as Promise<VMSnapshot[]>, [vmName]);

  const { data: vm, loading, refresh: refreshVM } = usePolling<VM>(fetchVM, 5000, !!vmName);
  const { data: metrics } = usePolling<VMMetrics>(fetchMetrics, 5000, !!vmName);
  const { data: snapshots, refresh: refreshSnapshots } = usePolling<VMSnapshot[]>(fetchSnapshots, 10000, !!vmName && activeTab === 'snapshots');

  const handleAction = async (action: 'start' | 'stop' | 'restart' | 'delete') => {
    if (!vmName) return;
    if (action === 'delete' && !confirm(`Delete VM "${vmName}"?`)) return;
    setActionLoading(true);
    try {
      if (action === 'start') await vmApi.start(vmName);
      else if (action === 'stop') await vmApi.stop(vmName);
      else if (action === 'restart') await vmApi.restart(vmName);
      else if (action === 'delete') {
        await vmApi.delete(vmName);
        navigateTo('vmList');
        return;
      }
      refreshVM();
    } catch (err) {
      console.error(`Failed to ${action}:`, err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateSnapshot = async () => {
    if (!snapshotName.trim() || !vmName) return;
    setCreatingSnapshot(true);
    try {
      await snapshotApi.create(vmName, { name: snapshotName.trim() });
      setSnapshotName('');
      refreshSnapshots();
    } catch (err) {
      console.error('Failed to create snapshot:', err);
    } finally {
      setCreatingSnapshot(false);
    }
  };

  const handleRevertSnapshot = async (id: string) => {
    if (!vmName || !confirm('Revert to this snapshot?')) return;
    try {
      await snapshotApi.revert(vmName, id);
      refreshVM();
    } catch (err) {
      console.error('Failed to revert snapshot:', err);
    }
  };

  const handleDeleteSnapshot = async (id: string) => {
    if (!vmName || !confirm('Delete this snapshot?')) return;
    try {
      await snapshotApi.delete(vmName, id);
      refreshSnapshots();
    } catch (err) {
      console.error('Failed to delete snapshot:', err);
    }
  };

  if (!vmName) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
        No VM selected
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-400">Loading...</span>
        </div>
      </div>
    );
  }

  const vmData = (vm || {}) as VM;
  const metricsData = (metrics || {}) as VMMetrics;
  const snapshotList = (snapshots || []) as VMSnapshot[];
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'disks', label: 'Disks' },
    { id: 'network', label: 'Network' },
    { id: 'snapshots', label: 'Snapshots' },
  ];

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigateTo('vmList')}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to VMs
      </button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">{vmData.name}</h1>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(vmData.state || 'unknown')}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${vmData.state === 'running' ? 'bg-green-400' : vmData.state === 'stopped' ? 'bg-red-400' : 'bg-slate-400'}`} />
            {vmData.state || 'unknown'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAction('start')}
            disabled={actionLoading || vmData.state === 'running'}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Play className="w-3.5 h-3.5" /> Start
          </button>
          <button
            onClick={() => handleAction('stop')}
            disabled={actionLoading || vmData.state !== 'running'}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Square className="w-3.5 h-3.5" /> Stop
          </button>
          <button
            onClick={() => handleAction('restart')}
            disabled={actionLoading || vmData.state !== 'running'}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Restart
          </button>
          <button
            onClick={() => handleAction('delete')}
            disabled={actionLoading}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-slate-700/50 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: <Cpu className="w-5 h-5 text-blue-400" />, label: 'CPU', value: `${vmData.cpus} vCPU` },
              { icon: <MemoryStick className="w-5 h-5 text-purple-400" />, label: 'Memory', value: formatMemory(vmData.memory || 0) },
              { icon: <HardDrive className="w-5 h-5 text-emerald-400" />, label: 'Disk', value: vmData.disk ? `${vmData.disk} GB` : 'N/A' },
              { icon: <Image className="w-5 h-5 text-amber-400" />, label: 'Image', value: vmData.image || 'N/A' },
              { icon: <Globe className="w-5 h-5 text-cyan-400" />, label: 'IP Address', value: vmData.ip || 'Not assigned' },
              { icon: <Hash className="w-5 h-5 text-indigo-400" />, label: 'PID', value: vmData.pid ? String(vmData.pid) : 'N/A' },
              { icon: <Server className="w-5 h-5 text-teal-400" />, label: 'Hostname', value: vmData.hostname || 'N/A' },
              { icon: <Globe className="w-5 h-5 text-orange-400" />, label: 'MAC Address', value: vmData.mac_address || 'N/A' },
              { icon: <Monitor className="w-5 h-5 text-pink-400" />, label: 'VNC Port', value: vmData.vnc_port ? String(vmData.vnc_port) : 'N/A' },
              { icon: <Clock className="w-5 h-5 text-slate-400" />, label: 'Created', value: vmData.created ? formatDateTime(vmData.created) : 'N/A' },
            ].map((item) => (
              <div key={item.label} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
                <div className="flex items-center gap-3 mb-2">
                  {item.icon}
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{item.label}</span>
                </div>
                <p className="text-lg font-semibold text-white truncate">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Tags */}
          {vmData.tags && vmData.tags.length > 0 && (
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-white">Tags</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {vmData.tags.map((tag) => (
                  <span key={tag} className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-700/50 text-slate-300">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* Last Error */}
          {vmData.last_error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-red-400">Last Error</h3>
              </div>
              <p className="text-sm text-red-300">{vmData.last_error}</p>
            </div>
          )}

          {/* Metrics */}
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-sm font-semibold text-white mb-4">Resource Usage</h3>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-400">CPU Usage</span>
                  <span className="text-xs font-medium text-white">{Math.round(metricsData.cpu_usage || 0)}%</span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(metricsData.cpu_usage || 0, 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-400">Memory Usage</span>
                  <span className="text-xs font-medium text-white">{Math.round(metricsData.memory_usage || 0)}%</span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2">
                  <div
                    className="bg-purple-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(metricsData.memory_usage || 0, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Disks tab */}
      {activeTab === 'disks' && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-sm font-semibold text-white mb-4">Disk Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30">
              <span className="text-xs text-slate-500 uppercase tracking-wider">Disk Size</span>
              <p className="text-lg font-semibold text-white mt-1">{vmData.disk ? `${vmData.disk} GB` : 'N/A'}</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30">
              <span className="text-xs text-slate-500 uppercase tracking-wider">Image</span>
              <p className="text-lg font-semibold text-white mt-1 truncate">{vmData.image || 'N/A'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Network tab */}
      {activeTab === 'network' && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-sm font-semibold text-white mb-4">Network Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30">
              <span className="text-xs text-slate-500 uppercase tracking-wider">IP Address</span>
              <p className="text-lg font-semibold text-white mt-1">{vmData.ip || 'Not assigned'}</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30">
              <span className="text-xs text-slate-500 uppercase tracking-wider">MAC Address</span>
              <p className="text-lg font-semibold text-white mt-1">{vmData.mac_address || 'N/A'}</p>
            </div>
            {metricsData.net_rx !== undefined && (
              <>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30">
                  <span className="text-xs text-slate-500 uppercase tracking-wider">Network RX</span>
                  <p className="text-lg font-semibold text-white mt-1">{formatBytes(metricsData.net_rx || 0)}/s</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30">
                  <span className="text-xs text-slate-500 uppercase tracking-wider">Network TX</span>
                  <p className="text-lg font-semibold text-white mt-1">{formatBytes(metricsData.net_tx || 0)}/s</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Snapshots tab */}
      {activeTab === 'snapshots' && (
        <div className="space-y-4">
          {/* Create snapshot */}
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-sm font-semibold text-white mb-3">Create Snapshot</h3>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Snapshot name..."
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                className="flex-1 bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleCreateSnapshot}
                disabled={creatingSnapshot || !snapshotName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Camera className="w-4 h-4" />
                {creatingSnapshot ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>

          {/* Snapshot list */}
          {snapshotList.length === 0 ? (
            <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
              <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No snapshots yet</p>
            </div>
          ) : (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700/50">
                <h3 className="text-sm font-semibold text-white">{snapshotList.length} Snapshot{snapshotList.length !== 1 ? 's' : ''}</h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Created</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Size</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {snapshotList.map((snap) => (
                    <tr key={snap.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 text-sm text-white font-medium">{snap.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{snap.created_at ? formatDateTime(snap.created_at) : '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{snap.size ? formatBytes(snap.size) : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleRevertSnapshot(snap.id)}
                            className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-colors"
                            title="Revert"
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSnapshot(snap.id)}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
