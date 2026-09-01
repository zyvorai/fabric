// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import { Shield, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { networkSecurityApi } from '../utils/api';
import { NetworkPolicy, QoSPolicy } from '../types';
import { usePolling } from '../hooks/usePolling';

type Tab = 'firewall' | 'policies' | 'qos' | 'dns' | 'vpn' | 'nat' | 'mirror' | 'monitor';

const TABS: { key: Tab; label: string }[] = [
  { key: 'firewall', label: 'Firewall' },
  { key: 'policies', label: 'Policies' },
  { key: 'qos', label: 'QoS' },
  { key: 'dns', label: 'DNS' },
  { key: 'vpn', label: 'VPN' },
  { key: 'nat', label: 'NAT' },
  { key: 'mirror', label: 'Mirror' },
  { key: 'monitor', label: 'Monitor' },
];

const inputCls = 'bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none w-full';
const btnPrimary = 'bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors';
const btnDanger = 'bg-red-600 hover:bg-red-500 text-white rounded-lg px-2 py-1.5 text-xs font-medium transition-colors';
const thCls = 'text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider';

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return <tr><td colSpan={cols} className="px-4 py-10 text-center text-slate-500">{msg}</td></tr>;
}

export default function NetworkSecurity() {
  const [tab, setTab] = useState<Tab>('firewall');

  // Firewall
  const { data: fwProfiles, refresh: refreshFwProfiles } = usePolling<unknown[]>(
    useCallback(() => networkSecurityApi.listFirewallProfiles(), []), 15000
  );
  const { data: fwZones, refresh: refreshFwZones } = usePolling<unknown[]>(
    useCallback(() => networkSecurityApi.listFirewallZones(), []), 15000
  );
  const [fwProfileForm, setFwProfileForm] = useState({ name: '', description: '' });
  const createFwProfile = async () => {
    if (!fwProfileForm.name) return;
    await networkSecurityApi.createFirewallProfile({ name: fwProfileForm.name, description: fwProfileForm.description, rules: [] });
    setFwProfileForm({ name: '', description: '' });
    refreshFwProfiles();
  };
  const deleteFwProfile = async (id: string) => { await networkSecurityApi.deleteFirewallProfile(id); refreshFwProfiles(); };
  const [fwZoneForm, setFwZoneForm] = useState({ name: '' });
  const createFwZone = async () => {
    if (!fwZoneForm.name) return;
    await networkSecurityApi.createFirewallZone({ name: fwZoneForm.name });
    setFwZoneForm({ name: '' });
    refreshFwZones();
  };
  const deleteFwZone = async (id: string) => { await networkSecurityApi.deleteFirewallZone(id); refreshFwZones(); };

  // Policies
  const { data: policies, refresh: refreshPolicies } = usePolling<NetworkPolicy[]>(
    useCallback(() => networkSecurityApi.listPolicies() as Promise<NetworkPolicy[]>, []), 15000
  );
  const [policyForm, setPolicyForm] = useState({ name: '', description: '' });
  const createPolicy = async () => {
    if (!policyForm.name) return;
    await networkSecurityApi.createPolicy({ name: policyForm.name, description: policyForm.description, rules: [], enabled: true });
    setPolicyForm({ name: '', description: '' });
    refreshPolicies();
  };
  const deletePolicy = async (id: string) => { await networkSecurityApi.deletePolicy(id); refreshPolicies(); };
  const togglePolicy = async (p: NetworkPolicy) => {
    await networkSecurityApi.updatePolicy(p.id, { ...p, enabled: !p.enabled });
    refreshPolicies();
  };

  // QoS
  const { data: qosPolicies, refresh: refreshQos } = usePolling<QoSPolicy[]>(
    useCallback(() => networkSecurityApi.listQosPolicies() as Promise<QoSPolicy[]>, []), 15000
  );
  const [qosForm, setQosForm] = useState({ name: '', bandwidth_limit: '', burst_limit: '', priority: '' });
  const createQos = async () => {
    if (!qosForm.name) return;
    await networkSecurityApi.createQosPolicy({
      name: qosForm.name,
      bandwidth_limit: qosForm.bandwidth_limit ? parseInt(qosForm.bandwidth_limit) : undefined,
      burst_limit: qosForm.burst_limit ? parseInt(qosForm.burst_limit) : undefined,
      priority: qosForm.priority ? parseInt(qosForm.priority) : undefined,
    });
    setQosForm({ name: '', bandwidth_limit: '', burst_limit: '', priority: '' });
    refreshQos();
  };
  const deleteQos = async (id: string) => { await networkSecurityApi.deleteQosPolicy(id); refreshQos(); };

  // DNS
  const { data: dnsZones, refresh: refreshDnsZones } = usePolling<unknown[]>(
    useCallback(() => networkSecurityApi.listDnsZones(), []), 15000
  );
  const { data: dnsPolicies, refresh: refreshDnsPolicies } = usePolling<unknown[]>(
    useCallback(() => networkSecurityApi.listDnsPolicies(), []), 15000
  );
  const [dnsZoneForm, setDnsZoneForm] = useState({ name: '' });
  const createDnsZone = async () => {
    if (!dnsZoneForm.name) return;
    await networkSecurityApi.createDnsZone({ name: dnsZoneForm.name });
    setDnsZoneForm({ name: '' });
    refreshDnsZones();
  };
  const deleteDnsZone = async (id: string) => { await networkSecurityApi.deleteDnsZone(id); refreshDnsZones(); };
  const [dnsPolicyForm, setDnsPolicyForm] = useState({ name: '' });
  const createDnsPolicy = async () => {
    if (!dnsPolicyForm.name) return;
    await networkSecurityApi.createDnsPolicy({ name: dnsPolicyForm.name });
    setDnsPolicyForm({ name: '' });
    refreshDnsPolicies();
  };
  const deleteDnsPolicy = async (id: string) => { await networkSecurityApi.deleteDnsPolicy(id); refreshDnsPolicies(); };

  // VPN
  const { data: vpnTunnels, refresh: refreshVpnTunnels } = usePolling<unknown[]>(
    useCallback(() => networkSecurityApi.listVpnTunnels(), []), 15000
  );
  const { data: vpnNetworks, refresh: refreshVpnNetworks } = usePolling<unknown[]>(
    useCallback(() => networkSecurityApi.listVpnNetworks(), []), 15000
  );
  const [vpnTunnelForm, setVpnTunnelForm] = useState({ name: '', type: 'wireguard' });
  const createVpnTunnel = async () => {
    if (!vpnTunnelForm.name) return;
    await networkSecurityApi.createVpnTunnel(vpnTunnelForm);
    setVpnTunnelForm({ name: '', type: 'wireguard' });
    refreshVpnTunnels();
  };
  const deleteVpnTunnel = async (id: string) => { await networkSecurityApi.deleteVpnTunnel(id); refreshVpnTunnels(); };
  const [vpnNetForm, setVpnNetForm] = useState({ name: '' });
  const createVpnNetwork = async () => {
    if (!vpnNetForm.name) return;
    await networkSecurityApi.createVpnNetwork({ name: vpnNetForm.name });
    setVpnNetForm({ name: '' });
    refreshVpnNetworks();
  };
  const deleteVpnNetwork = async (id: string) => { await networkSecurityApi.deleteVpnNetwork(id); refreshVpnNetworks(); };

  // NAT
  const { data: natRules, refresh: refreshNatRules } = usePolling<unknown[]>(
    useCallback(() => networkSecurityApi.listNatRules(), []), 15000
  );
  const { data: natGateways, refresh: refreshNatGateways } = usePolling<unknown[]>(
    useCallback(() => networkSecurityApi.listNatGateways(), []), 15000
  );
  const [natRuleForm, setNatRuleForm] = useState({ name: '', type: 'snat' });
  const createNatRule = async () => {
    if (!natRuleForm.name) return;
    await networkSecurityApi.createNatRule(natRuleForm);
    setNatRuleForm({ name: '', type: 'snat' });
    refreshNatRules();
  };
  const deleteNatRule = async (id: string) => { await networkSecurityApi.deleteNatRule(id); refreshNatRules(); };
  const [natGwForm, setNatGwForm] = useState({ name: '' });
  const createNatGateway = async () => {
    if (!natGwForm.name) return;
    await networkSecurityApi.createNatGateway({ name: natGwForm.name });
    setNatGwForm({ name: '' });
    refreshNatGateways();
  };
  const deleteNatGateway = async (id: string) => { await networkSecurityApi.deleteNatGateway(id); refreshNatGateways(); };

  // Mirror
  const { data: mirrorSessions, refresh: refreshMirror } = usePolling<unknown[]>(
    useCallback(() => networkSecurityApi.listMirrorSessions(), []), 15000
  );
  const [mirrorForm, setMirrorForm] = useState({ name: '', source: '', destination: '' });
  const createMirror = async () => {
    if (!mirrorForm.name) return;
    await networkSecurityApi.createMirrorSession(mirrorForm);
    setMirrorForm({ name: '', source: '', destination: '' });
    refreshMirror();
  };
  const deleteMirror = async (id: string) => { await networkSecurityApi.deleteMirrorSession(id); refreshMirror(); };

  // Monitor
  const { data: monitorPolicies, refresh: refreshMonitor } = usePolling<unknown[]>(
    useCallback(() => networkSecurityApi.listMonitorPolicies(), []), 15000
  );
  const [monitorForm, setMonitorForm] = useState({ name: '', type: 'bandwidth' });
  const createMonitor = async () => {
    if (!monitorForm.name) return;
    await networkSecurityApi.createMonitorPolicy(monitorForm);
    setMonitorForm({ name: '', type: 'bandwidth' });
    refreshMonitor();
  };
  const deleteMonitor = async (id: string) => { await networkSecurityApi.deleteMonitorPolicy(id); refreshMonitor(); };

  const r = (item: unknown) => item as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Shield className="w-7 h-7 text-blue-400" />
          Network Security
        </h1>
        <p className="text-sm text-slate-400 mt-1">Firewall, policies, QoS, DNS, VPN, NAT, mirroring and monitoring</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-slate-700/50 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.key ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Firewall */}
      {tab === 'firewall' && (
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Firewall Profiles</h3>
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input className={inputCls} placeholder="Profile name" value={fwProfileForm.name} onChange={e => setFwProfileForm({ ...fwProfileForm, name: e.target.value })} />
                <input className={inputCls} placeholder="Description" value={fwProfileForm.description} onChange={e => setFwProfileForm({ ...fwProfileForm, description: e.target.value })} />
                <button onClick={createFwProfile} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create Profile</button>
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-700/50">
                  <th className={thCls}>Name</th><th className={thCls}>Description</th><th className={thCls}>Actions</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-700/30">
                  {(fwProfiles || []).length === 0 ? <EmptyRow cols={3} msg="No firewall profiles" /> : (fwProfiles || []).map((p, i) => (
                    <tr key={i} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-white">{r(p).name as string}</td>
                      <td className="px-4 py-3 text-slate-400">{(r(p).description as string) || '-'}</td>
                      <td className="px-4 py-3"><button onClick={() => deleteFwProfile(r(p).id as string)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Firewall Zones</h3>
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input className={inputCls} placeholder="Zone name" value={fwZoneForm.name} onChange={e => setFwZoneForm({ name: e.target.value })} />
                <button onClick={createFwZone} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create Zone</button>
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-700/50">
                  <th className={thCls}>Name</th><th className={thCls}>Actions</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-700/30">
                  {(fwZones || []).length === 0 ? <EmptyRow cols={2} msg="No firewall zones" /> : (fwZones || []).map((z, i) => (
                    <tr key={i} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-white">{r(z).name as string}</td>
                      <td className="px-4 py-3"><button onClick={() => deleteFwZone(r(z).id as string)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Policies */}
      {tab === 'policies' && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-sm font-semibold text-white mb-3">Create Network Policy</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input className={inputCls} placeholder="Policy name" value={policyForm.name} onChange={e => setPolicyForm({ ...policyForm, name: e.target.value })} />
              <input className={inputCls} placeholder="Description" value={policyForm.description} onChange={e => setPolicyForm({ ...policyForm, description: e.target.value })} />
              <button onClick={createPolicy} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create</button>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700/50">
                <th className={thCls}>Name</th><th className={thCls}>Description</th><th className={thCls}>Rules</th><th className={thCls}>Enabled</th><th className={thCls}>Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {(policies || []).length === 0 ? <EmptyRow cols={5} msg="No network policies" /> : (policies || []).map(p => (
                  <tr key={p.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{p.name}</td>
                    <td className="px-4 py-3 text-slate-400">{p.description || '-'}</td>
                    <td className="px-4 py-3 text-slate-400">{p.rules.length}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => togglePolicy(p)} className="text-slate-400 hover:text-white">
                        {p.enabled ? <ToggleRight className="w-6 h-6 text-green-400" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                    </td>
                    <td className="px-4 py-3"><button onClick={() => deletePolicy(p.id)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* QoS */}
      {tab === 'qos' && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-sm font-semibold text-white mb-3">Create QoS Policy</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <input className={inputCls} placeholder="Name" value={qosForm.name} onChange={e => setQosForm({ ...qosForm, name: e.target.value })} />
              <input className={inputCls} placeholder="Bandwidth limit (Mbps)" type="number" value={qosForm.bandwidth_limit} onChange={e => setQosForm({ ...qosForm, bandwidth_limit: e.target.value })} />
              <input className={inputCls} placeholder="Burst limit" type="number" value={qosForm.burst_limit} onChange={e => setQosForm({ ...qosForm, burst_limit: e.target.value })} />
              <input className={inputCls} placeholder="Priority" type="number" value={qosForm.priority} onChange={e => setQosForm({ ...qosForm, priority: e.target.value })} />
              <button onClick={createQos} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create</button>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700/50">
                <th className={thCls}>Name</th><th className={thCls}>Bandwidth Limit</th><th className={thCls}>Burst Limit</th><th className={thCls}>Priority</th><th className={thCls}>Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {(qosPolicies || []).length === 0 ? <EmptyRow cols={5} msg="No QoS policies" /> : (qosPolicies || []).map(q => (
                  <tr key={q.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{q.name}</td>
                    <td className="px-4 py-3 text-slate-400">{q.bandwidth_limit ? `${q.bandwidth_limit} Mbps` : '-'}</td>
                    <td className="px-4 py-3 text-slate-400">{q.burst_limit ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-400">{q.priority ?? '-'}</td>
                    <td className="px-4 py-3"><button onClick={() => deleteQos(q.id)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DNS */}
      {tab === 'dns' && (
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">DNS Zones</h3>
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input className={inputCls} placeholder="Zone name" value={dnsZoneForm.name} onChange={e => setDnsZoneForm({ name: e.target.value })} />
                <button onClick={createDnsZone} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create Zone</button>
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-700/50"><th className={thCls}>Name</th><th className={thCls}>Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-700/30">
                  {(dnsZones || []).length === 0 ? <EmptyRow cols={2} msg="No DNS zones" /> : (dnsZones || []).map((z, i) => (
                    <tr key={i} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-white">{r(z).name as string}</td>
                      <td className="px-4 py-3"><button onClick={() => deleteDnsZone(r(z).id as string)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">DNS Policies</h3>
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input className={inputCls} placeholder="Policy name" value={dnsPolicyForm.name} onChange={e => setDnsPolicyForm({ name: e.target.value })} />
                <button onClick={createDnsPolicy} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create Policy</button>
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-700/50"><th className={thCls}>Name</th><th className={thCls}>Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-700/30">
                  {(dnsPolicies || []).length === 0 ? <EmptyRow cols={2} msg="No DNS policies" /> : (dnsPolicies || []).map((p, i) => (
                    <tr key={i} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-white">{r(p).name as string}</td>
                      <td className="px-4 py-3"><button onClick={() => deleteDnsPolicy(r(p).id as string)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VPN */}
      {tab === 'vpn' && (
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">VPN Tunnels</h3>
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input className={inputCls} placeholder="Tunnel name" value={vpnTunnelForm.name} onChange={e => setVpnTunnelForm({ ...vpnTunnelForm, name: e.target.value })} />
                <select className={inputCls} value={vpnTunnelForm.type} onChange={e => setVpnTunnelForm({ ...vpnTunnelForm, type: e.target.value })}>
                  <option value="wireguard">WireGuard</option>
                  <option value="ipsec">IPsec</option>
                  <option value="openvpn">OpenVPN</option>
                </select>
                <button onClick={createVpnTunnel} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create Tunnel</button>
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-700/50"><th className={thCls}>Name</th><th className={thCls}>Type</th><th className={thCls}>Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-700/30">
                  {(vpnTunnels || []).length === 0 ? <EmptyRow cols={3} msg="No VPN tunnels" /> : (vpnTunnels || []).map((t, i) => (
                    <tr key={i} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-white">{r(t).name as string}</td>
                      <td className="px-4 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">{r(t).type as string}</span></td>
                      <td className="px-4 py-3"><button onClick={() => deleteVpnTunnel(r(t).id as string)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">VPN Networks</h3>
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input className={inputCls} placeholder="Network name" value={vpnNetForm.name} onChange={e => setVpnNetForm({ name: e.target.value })} />
                <button onClick={createVpnNetwork} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create Network</button>
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-700/50"><th className={thCls}>Name</th><th className={thCls}>Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-700/30">
                  {(vpnNetworks || []).length === 0 ? <EmptyRow cols={2} msg="No VPN networks" /> : (vpnNetworks || []).map((n, i) => (
                    <tr key={i} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-white">{r(n).name as string}</td>
                      <td className="px-4 py-3"><button onClick={() => deleteVpnNetwork(r(n).id as string)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* NAT */}
      {tab === 'nat' && (
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">NAT Rules</h3>
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input className={inputCls} placeholder="Rule name" value={natRuleForm.name} onChange={e => setNatRuleForm({ ...natRuleForm, name: e.target.value })} />
                <select className={inputCls} value={natRuleForm.type} onChange={e => setNatRuleForm({ ...natRuleForm, type: e.target.value })}>
                  <option value="snat">SNAT</option>
                  <option value="dnat">DNAT</option>
                  <option value="masquerade">Masquerade</option>
                </select>
                <button onClick={createNatRule} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create Rule</button>
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-700/50"><th className={thCls}>Name</th><th className={thCls}>Type</th><th className={thCls}>Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-700/30">
                  {(natRules || []).length === 0 ? <EmptyRow cols={3} msg="No NAT rules" /> : (natRules || []).map((r2, i) => (
                    <tr key={i} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-white">{r(r2).name as string}</td>
                      <td className="px-4 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400 uppercase">{r(r2).type as string}</span></td>
                      <td className="px-4 py-3"><button onClick={() => deleteNatRule(r(r2).id as string)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">NAT Gateways</h3>
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input className={inputCls} placeholder="Gateway name" value={natGwForm.name} onChange={e => setNatGwForm({ name: e.target.value })} />
                <button onClick={createNatGateway} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create Gateway</button>
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-700/50"><th className={thCls}>Name</th><th className={thCls}>Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-700/30">
                  {(natGateways || []).length === 0 ? <EmptyRow cols={2} msg="No NAT gateways" /> : (natGateways || []).map((g, i) => (
                    <tr key={i} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-white">{r(g).name as string}</td>
                      <td className="px-4 py-3"><button onClick={() => deleteNatGateway(r(g).id as string)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Mirror */}
      {tab === 'mirror' && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-sm font-semibold text-white mb-3">Create Mirror Session</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input className={inputCls} placeholder="Session name" value={mirrorForm.name} onChange={e => setMirrorForm({ ...mirrorForm, name: e.target.value })} />
              <input className={inputCls} placeholder="Source" value={mirrorForm.source} onChange={e => setMirrorForm({ ...mirrorForm, source: e.target.value })} />
              <input className={inputCls} placeholder="Destination" value={mirrorForm.destination} onChange={e => setMirrorForm({ ...mirrorForm, destination: e.target.value })} />
              <button onClick={createMirror} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create</button>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700/50"><th className={thCls}>Name</th><th className={thCls}>Source</th><th className={thCls}>Destination</th><th className={thCls}>Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {(mirrorSessions || []).length === 0 ? <EmptyRow cols={4} msg="No mirror sessions" /> : (mirrorSessions || []).map((s, i) => (
                  <tr key={i} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{r(s).name as string}</td>
                    <td className="px-4 py-3 text-slate-400">{(r(s).source as string) || '-'}</td>
                    <td className="px-4 py-3 text-slate-400">{(r(s).destination as string) || '-'}</td>
                    <td className="px-4 py-3"><button onClick={() => deleteMirror(r(s).id as string)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monitor */}
      {tab === 'monitor' && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-sm font-semibold text-white mb-3">Create Monitoring Policy</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input className={inputCls} placeholder="Policy name" value={monitorForm.name} onChange={e => setMonitorForm({ ...monitorForm, name: e.target.value })} />
              <select className={inputCls} value={monitorForm.type} onChange={e => setMonitorForm({ ...monitorForm, type: e.target.value })}>
                <option value="bandwidth">Bandwidth</option>
                <option value="latency">Latency</option>
                <option value="packet-loss">Packet Loss</option>
                <option value="connection">Connection</option>
              </select>
              <button onClick={createMonitor} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create</button>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700/50"><th className={thCls}>Name</th><th className={thCls}>Type</th><th className={thCls}>Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {(monitorPolicies || []).length === 0 ? <EmptyRow cols={3} msg="No monitoring policies" /> : (monitorPolicies || []).map((m, i) => (
                  <tr key={i} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{r(m).name as string}</td>
                    <td className="px-4 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400">{r(m).type as string}</span></td>
                    <td className="px-4 py-3"><button onClick={() => deleteMonitor(r(m).id as string)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
