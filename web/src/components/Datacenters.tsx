import { useState, useCallback } from 'react';
import { datacenterApi } from '../utils/api';
import { formatMemory } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { Datacenter, Cluster, Host } from '../types';

export default function Datacenters() {
  const [dcName, setDcName] = useState('');
  const [dcLocation, setDcLocation] = useState('');
  const [hostName, setHostName] = useState('');
  const [hostAddress, setHostAddress] = useState('');
  const [hostCluster, setHostCluster] = useState('');

  const fetchDatacenters = useCallback(() => datacenterApi.listDatacenters() as Promise<Datacenter[]>, []);
  const fetchClusters = useCallback(() => datacenterApi.listClusters() as Promise<Cluster[]>, []);
  const fetchHosts = useCallback(() => datacenterApi.listHosts() as Promise<Host[]>, []);

  const { data: dcData, refresh: refreshDCs } = usePolling<Datacenter[]>(fetchDatacenters, 15000);
  const { data: clData } = usePolling<Cluster[]>(fetchClusters, 15000);
  const { data: hostData, refresh: refreshHosts } = usePolling<Host[]>(fetchHosts, 10000);

  const datacenters = (dcData || []) as Datacenter[];
  const clusters = (clData || []) as Cluster[];
  const hosts = (hostData || []) as Host[];

  const handleCreateDC = async () => {
    if (!dcName.trim()) return;
    try { await datacenterApi.createDatacenter({ name: dcName, location: dcLocation }); setDcName(''); setDcLocation(''); refreshDCs(); }
    catch (err) { console.error('Failed to create datacenter:', err); }
  };

  const handleDeleteDC = async (id: string) => {
    if (!confirm('Delete this datacenter?')) return;
    try { await datacenterApi.deleteDatacenter(id); refreshDCs(); }
    catch (err) { console.error('Failed to delete datacenter:', err); }
  };

  const handleRegisterHost = async () => {
    if (!hostName.trim() || !hostAddress.trim()) return;
    try { await datacenterApi.registerHost({ name: hostName, address: hostAddress, cluster_id: hostCluster || undefined }); setHostName(''); setHostAddress(''); setHostCluster(''); refreshHosts(); }
    catch (err) { console.error('Failed to register host:', err); }
  };

  const handleRemoveHost = async (id: string) => {
    if (!confirm('Remove this host?')) return;
    try { await datacenterApi.removeHost(id); refreshHosts(); }
    catch (err) { console.error('Failed to remove host:', err); }
  };

  const handleEnterMaintenance = async (id: string) => {
    try { await datacenterApi.hostEnterMaintenance(id); refreshHosts(); }
    catch (err) { console.error('Failed to enter maintenance:', err); }
  };

  const handleExitMaintenance = async (id: string) => {
    try { await datacenterApi.hostExitMaintenance(id); refreshHosts(); }
    catch (err) { console.error('Failed to exit maintenance:', err); }
  };

  const getStateBadge = (state: string) => {
    const colors: Record<string, string> = {
      connected: 'bg-green-500/20 text-green-400', active: 'bg-green-500/20 text-green-400',
      maintenance: 'bg-yellow-500/20 text-yellow-400', disconnected: 'bg-red-500/20 text-red-400',
    };
    return colors[state] || 'bg-slate-500/20 text-slate-400';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Datacenters</h2>
        <p className="text-sm text-slate-400 mt-1">Manage datacenters, clusters, and hosts</p>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Create Datacenter</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input value={dcName} onChange={e => setDcName(e.target.value)} placeholder="Datacenter name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={dcLocation} onChange={e => setDcLocation(e.target.value)} placeholder="Location" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={handleCreateDC} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Create</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {datacenters.map(dc => (
          <div key={dc.id} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <div className="flex items-start justify-between mb-3">
              <h4 className="text-white font-semibold text-lg">{dc.name}</h4>
              <button onClick={() => handleDeleteDC(dc.id)} className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Delete</button>
            </div>
            <div className="text-sm text-slate-400 space-y-1">
              {dc.location && <div>Location: <span className="text-slate-300">{dc.location}</span></div>}
              <div>Clusters: <span className="text-slate-300">{dc.clusters.length}</span></div>
            </div>
          </div>
        ))}
        {datacenters.length === 0 && <div className="col-span-3 text-center text-slate-500 py-8">No datacenters</div>}
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Clusters</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400"><tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Datacenter</th><th className="px-5 py-3">Hosts</th><th className="px-5 py-3">HA</th><th className="px-5 py-3">DRS</th></tr></thead>
          <tbody className="divide-y divide-slate-700/50">
            {clusters.map(c => (
              <tr key={c.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white font-medium">{c.name}</td>
                <td className="px-5 py-3 font-mono text-xs">{c.datacenter_id}</td>
                <td className="px-5 py-3">{c.hosts.length}</td>
                <td className="px-5 py-3">{c.ha_enabled ? <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">Yes</span> : <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400">No</span>}</td>
                <td className="px-5 py-3">{c.drs_enabled ? <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">Yes</span> : <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400">No</span>}</td>
              </tr>
            ))}
            {clusters.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No clusters</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Register Host</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input value={hostName} onChange={e => setHostName(e.target.value)} placeholder="Host name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={hostAddress} onChange={e => setHostAddress(e.target.value)} placeholder="Address" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <input value={hostCluster} onChange={e => setHostCluster(e.target.value)} placeholder="Cluster ID (optional)" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={handleRegisterHost} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Register</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Hosts</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400"><tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Address</th><th className="px-5 py-3">CPUs</th><th className="px-5 py-3">Memory</th><th className="px-5 py-3">VMs</th><th className="px-5 py-3">State</th><th className="px-5 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-700/50">
            {hosts.map(h => (
              <tr key={h.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white font-medium">{h.name}</td>
                <td className="px-5 py-3 font-mono text-xs">{h.address}</td>
                <td className="px-5 py-3">{h.cpus}</td>
                <td className="px-5 py-3">{formatMemory(h.memory)}</td>
                <td className="px-5 py-3">{h.vms}</td>
                <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStateBadge(h.state)}`}>{h.state}</span></td>
                <td className="px-5 py-3">
                  <div className="flex gap-1">
                    {h.state !== 'maintenance' ? (
                      <button onClick={() => handleEnterMaintenance(h.id)} className="px-2 py-1 bg-yellow-600 hover:bg-yellow-500 text-white text-xs rounded-lg">Maintenance</button>
                    ) : (
                      <button onClick={() => handleExitMaintenance(h.id)} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg">Exit Maint.</button>
                    )}
                    <button onClick={() => handleRemoveHost(h.id)} className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Remove</button>
                  </div>
                </td>
              </tr>
            ))}
            {hosts.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">No hosts</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
