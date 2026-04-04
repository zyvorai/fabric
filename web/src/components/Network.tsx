import { useState, useCallback } from 'react';
import { Network as NetworkIcon, Plus, Trash2, Globe, Cable, Radio, Layers, Link2, ArrowRightLeft } from 'lucide-react';
import { networkApi } from '../utils/api';
import { BridgeConfig, VlanConfig, MacvtapConfig, TapConfig, BondConfig, PortForward } from '../types';
import { usePolling } from '../hooks/usePolling';

type Tab = 'bridges' | 'vlans' | 'macvtaps' | 'taps' | 'bonds' | 'port-forwards';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'bridges', label: 'Bridges', icon: <Cable className="w-4 h-4" /> },
  { key: 'vlans', label: 'VLANs', icon: <Layers className="w-4 h-4" /> },
  { key: 'macvtaps', label: 'MacVTAPs', icon: <Radio className="w-4 h-4" /> },
  { key: 'taps', label: 'TAPs', icon: <Link2 className="w-4 h-4" /> },
  { key: 'bonds', label: 'Bonds', icon: <Globe className="w-4 h-4" /> },
  { key: 'port-forwards', label: 'Port Forwards', icon: <ArrowRightLeft className="w-4 h-4" /> },
];

const inputCls = 'bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none w-full';
const btnPrimary = 'bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors';
const btnDanger = 'bg-red-600 hover:bg-red-500 text-white rounded-lg px-2 py-1.5 text-xs font-medium transition-colors';

export default function Network() {
  const [tab, setTab] = useState<Tab>('bridges');

  const { data: bridges, refresh: refreshBridges } = usePolling<BridgeConfig[]>(
    useCallback(() => networkApi.listBridges() as Promise<BridgeConfig[]>, []), 15000
  );
  const { data: vlans, refresh: refreshVlans } = usePolling<VlanConfig[]>(
    useCallback(() => networkApi.listVlans() as Promise<VlanConfig[]>, []), 15000
  );
  const { data: macvtaps, refresh: refreshMacvtaps } = usePolling<MacvtapConfig[]>(
    useCallback(() => networkApi.listMacvtaps() as Promise<MacvtapConfig[]>, []), 15000
  );
  const { data: taps, refresh: refreshTaps } = usePolling<TapConfig[]>(
    useCallback(() => networkApi.listTaps() as Promise<TapConfig[]>, []), 15000
  );
  const { data: bonds, refresh: refreshBonds } = usePolling<BondConfig[]>(
    useCallback(() => networkApi.listBonds() as Promise<BondConfig[]>, []), 15000
  );
  const { data: portForwards, refresh: refreshPf } = usePolling<PortForward[]>(
    useCallback(() => networkApi.listPortForwards() as Promise<PortForward[]>, []), 15000
  );

  // Fetch available physical interfaces via netlink for dropdowns
  interface NetlinkIface { index: number; name: string; mac: string; mtu: number; state: string; kind: string | null; master_name: string | null; speed_mbps: number | null }
  const { data: netlinkIfaces } = usePolling<NetlinkIface[]>(
    useCallback(() => networkApi.listNetlinkInterfaces() as Promise<NetlinkIface[]>, []), 30000
  );
  // Physical interfaces (no kind, not loopback)
  // All interfaces (no filtering - show everything)
  const allIfaces = (netlinkIfaces || []).filter(i => i.name !== 'lo');
  const physicalIfaces = allIfaces;
  const availableIfaces = allIfaces;

  // Bridge form
  const [bridgeForm, setBridgeForm] = useState({ name: '', addresses: '', dhcp: false, members: [] as string[] });
  const createBridge = async () => {
    if (!bridgeForm.name) return;
    await networkApi.createBridge({
      name: bridgeForm.name,
      addresses: bridgeForm.addresses ? bridgeForm.addresses.split(',').map(s => s.trim()) : [],
      dhcp: bridgeForm.dhcp,
      slave_interfaces: bridgeForm.members,
    });
    setBridgeForm({ name: '', addresses: '', dhcp: false, members: [] });
    refreshBridges();
  };

  // VLAN form
  const [vlanForm, setVlanForm] = useState({ name: '', vlan_id: '', parent: '', addresses: '' });
  const createVlan = async () => {
    if (!vlanForm.name || !vlanForm.vlan_id || !vlanForm.parent) return;
    await networkApi.createVlan({
      name: vlanForm.name,
      vlan_id: parseInt(vlanForm.vlan_id),
      parent: vlanForm.parent,
      addresses: vlanForm.addresses ? vlanForm.addresses.split(',').map(s => s.trim()) : [],
    });
    setVlanForm({ name: '', vlan_id: '', parent: '', addresses: '' });
    refreshVlans();
  };

  // MacVTAP form
  const [macvtapForm, setMacvtapForm] = useState({ name: '', parent: '', mode: 'bridge' });
  const createMacvtap = async () => {
    if (!macvtapForm.name || !macvtapForm.parent) return;
    await networkApi.createMacvtap(macvtapForm);
    setMacvtapForm({ name: '', parent: '', mode: 'bridge' });
    refreshMacvtaps();
  };

  // TAP form
  const [tapForm, setTapForm] = useState({ name: '', user: '', group: '' });
  const createTap = async () => {
    if (!tapForm.name) return;
    await networkApi.createTap(tapForm);
    setTapForm({ name: '', user: '', group: '' });
    refreshTaps();
  };

  // Bond form
  const [bondForm, setBondForm] = useState({ name: '', mode: 'balance-rr', members: [] as string[], addresses: '' });
  const createBond = async () => {
    if (!bondForm.name || bondForm.members.length === 0) return;
    await networkApi.createBond({
      name: bondForm.name,
      mode: bondForm.mode,
      slave_interfaces: bondForm.members,
      addresses: bondForm.addresses ? bondForm.addresses.split(',').map(s => s.trim()) : [],
    });
    setBondForm({ name: '', mode: 'balance-rr', members: [], addresses: '' });
    refreshBonds();
  };

  // Port Forward form
  const [pfForm, setPfForm] = useState({ protocol: 'tcp', host_port: '', guest_ip: '', guest_port: '' });
  const createPf = async () => {
    if (!pfForm.host_port || !pfForm.guest_ip || !pfForm.guest_port) return;
    await networkApi.createPortForward({
      protocol: pfForm.protocol,
      host_port: parseInt(pfForm.host_port),
      guest_ip: pfForm.guest_ip,
      guest_port: parseInt(pfForm.guest_port),
    });
    setPfForm({ protocol: 'tcp', host_port: '', guest_ip: '', guest_port: '' });
    refreshPf();
  };

  const deleteBridge = async (id: string) => { await networkApi.deleteBridge(id); refreshBridges(); };
  const deleteVlan = async (id: string) => { await networkApi.deleteVlan(id); refreshVlans(); };
  const deleteMacvtap = async (id: string) => { await networkApi.deleteMacvtap(id); refreshMacvtaps(); };
  const deleteTap = async (id: string) => { await networkApi.deleteTap(id); refreshTaps(); };
  const deleteBond = async (id: string) => { await networkApi.deleteBond(id); refreshBonds(); };
  const deletePf = async (id: string) => { await networkApi.deletePortForward(id); refreshPf(); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <NetworkIcon className="w-7 h-7 text-blue-400" />
          Network
        </h1>
        <p className="text-sm text-slate-400 mt-1">Manage bridges, VLANs, taps, bonds and port forwards</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-slate-700/50 mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Bridges */}
      {tab === 'bridges' && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 space-y-3">
            <h3 className="text-sm font-semibold text-white">Create Bridge</h3>
            <div className="flex flex-wrap items-center gap-3">
              <input className={`${inputCls} w-40`} placeholder="Name" value={bridgeForm.name} onChange={e => setBridgeForm({ ...bridgeForm, name: e.target.value })} />
              <input className={`${inputCls} w-52`} placeholder="Addresses (comma-sep)" value={bridgeForm.addresses} onChange={e => setBridgeForm({ ...bridgeForm, addresses: e.target.value })} />
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input type="checkbox" checked={bridgeForm.dhcp} onChange={e => setBridgeForm({ ...bridgeForm, dhcp: e.target.checked })} className="rounded" />
                DHCP
              </label>
              <button onClick={createBridge} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create</button>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Member Interfaces</label>
              <div className="flex flex-wrap gap-1.5">
                {availableIfaces.map(iface => (
                  <label key={iface.name} className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs cursor-pointer transition-colors ${bridgeForm.members.includes(iface.name) ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                    <input type="checkbox" className="sr-only" checked={bridgeForm.members.includes(iface.name)} onChange={() => setBridgeForm({ ...bridgeForm, members: bridgeForm.members.includes(iface.name) ? bridgeForm.members.filter(m => m !== iface.name) : [...bridgeForm.members, iface.name] })} />
                    {iface.name}
                  </label>
                ))}
                {availableIfaces.length === 0 && <span className="text-xs text-slate-500">No available interfaces</span>}
              </div>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Members</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Addresses</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">DHCP</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {(bridges || []).length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No bridges configured</td></tr>
                ) : (bridges || []).map(b => (
                  <tr key={b.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{b.name}</td>
                    <td className="px-4 py-3 text-slate-400">{(b.members || []).join(', ') || '-'}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{(b.addresses || []).join(', ') || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${b.dhcp ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}`}>
                        {b.dhcp ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3"><button onClick={() => deleteBridge(b.id)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VLANs */}
      {tab === 'vlans' && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-sm font-semibold text-white mb-3">Create VLAN</h3>
            <div className="flex flex-wrap items-center gap-3">
              <input className={`${inputCls} w-36`} placeholder="Name" value={vlanForm.name} onChange={e => setVlanForm({ ...vlanForm, name: e.target.value })} />
              <input className={`${inputCls} w-24`} placeholder="VLAN ID" type="number" value={vlanForm.vlan_id} onChange={e => setVlanForm({ ...vlanForm, vlan_id: e.target.value })} />
              <select className={`${inputCls} w-52`} value={vlanForm.parent} onChange={e => setVlanForm({ ...vlanForm, parent: e.target.value })}>
                <option value="">Parent interface</option>
                {physicalIfaces.map(iface => (
                  <option key={iface.name} value={iface.name}>{iface.name} ({iface.state})</option>
                ))}
              </select>
              <input className={`${inputCls} w-48`} placeholder="Addresses (comma-sep)" value={vlanForm.addresses} onChange={e => setVlanForm({ ...vlanForm, addresses: e.target.value })} />
              <button onClick={createVlan} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create</button>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">VLAN ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Parent</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Addresses</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {(vlans || []).length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No VLANs configured</td></tr>
                ) : (vlans || []).map(v => (
                  <tr key={v.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{v.name}</td>
                    <td className="px-4 py-3 text-slate-400">{v.vlan_id}</td>
                    <td className="px-4 py-3 text-slate-400">{v.parent}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{(v.addresses || []).join(', ') || '-'}</td>
                    <td className="px-4 py-3"><button onClick={() => deleteVlan(v.id)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MacVTAPs */}
      {tab === 'macvtaps' && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-sm font-semibold text-white mb-3">Create MacVTAP</h3>
            <div className="flex flex-wrap items-center gap-3">
              <input className={`${inputCls} w-36`} placeholder="Name" value={macvtapForm.name} onChange={e => setMacvtapForm({ ...macvtapForm, name: e.target.value })} />
              <select className={`${inputCls} w-48`} value={macvtapForm.parent} onChange={e => setMacvtapForm({ ...macvtapForm, parent: e.target.value })}>
                <option value="">Parent interface</option>
                {physicalIfaces.map(iface => (
                  <option key={iface.name} value={iface.name}>{iface.name} ({iface.state})</option>
                ))}
              </select>
              <select className={`${inputCls} w-32`} value={macvtapForm.mode} onChange={e => setMacvtapForm({ ...macvtapForm, mode: e.target.value })}>
                <option value="bridge">Bridge</option>
                <option value="vepa">VEPA</option>
                <option value="private">Private</option>
                <option value="passthru">Passthru</option>
              </select>
              <button onClick={createMacvtap} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create</button>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Parent</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Mode</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {(macvtaps || []).length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">No MacVTAPs configured</td></tr>
                ) : (macvtaps || []).map(m => (
                  <tr key={m.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{m.name}</td>
                    <td className="px-4 py-3 text-slate-400">{m.parent}</td>
                    <td className="px-4 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">{m.mode || 'bridge'}</span></td>
                    <td className="px-4 py-3"><button onClick={() => deleteMacvtap(m.id)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAPs */}
      {tab === 'taps' && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-sm font-semibold text-white mb-3">Create TAP</h3>
            <div className="flex flex-wrap items-center gap-3">
              <input className={`${inputCls} w-36`} placeholder="Name" value={tapForm.name} onChange={e => setTapForm({ ...tapForm, name: e.target.value })} />
              <input className={`${inputCls} w-32`} placeholder="User" value={tapForm.user} onChange={e => setTapForm({ ...tapForm, user: e.target.value })} />
              <input className={`${inputCls} w-32`} placeholder="Group" value={tapForm.group} onChange={e => setTapForm({ ...tapForm, group: e.target.value })} />
              <button onClick={createTap} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create</button>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Group</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {(taps || []).length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">No TAPs configured</td></tr>
                ) : (taps || []).map(t => (
                  <tr key={t.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{t.name}</td>
                    <td className="px-4 py-3 text-slate-400">{t.user || '-'}</td>
                    <td className="px-4 py-3 text-slate-400">{t.group || '-'}</td>
                    <td className="px-4 py-3"><button onClick={() => deleteTap(t.id)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bonds */}
      {tab === 'bonds' && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 space-y-3">
            <h3 className="text-sm font-semibold text-white">Create Bond</h3>
            <div className="flex flex-wrap items-center gap-3">
              <input className={`${inputCls} w-40`} placeholder="Name" value={bondForm.name} onChange={e => setBondForm({ ...bondForm, name: e.target.value })} />
              <select className={`${inputCls} w-40`} value={bondForm.mode} onChange={e => setBondForm({ ...bondForm, mode: e.target.value })}>
                <option value="balance-rr">balance-rr</option>
                <option value="active-backup">active-backup</option>
                <option value="balance-xor">balance-xor</option>
                <option value="802.3ad">802.3ad</option>
                <option value="balance-tlb">balance-tlb</option>
                <option value="balance-alb">balance-alb</option>
              </select>
              <input className={`${inputCls} w-52`} placeholder="Addresses (comma-sep)" value={bondForm.addresses} onChange={e => setBondForm({ ...bondForm, addresses: e.target.value })} />
              <button onClick={createBond} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create</button>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Slave Interfaces</label>
              <div className="flex flex-wrap gap-1.5">
                {availableIfaces.map(iface => (
                  <label key={iface.name} className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs cursor-pointer transition-colors ${bondForm.members.includes(iface.name) ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                    <input type="checkbox" className="sr-only" checked={bondForm.members.includes(iface.name)} onChange={() => setBondForm({ ...bondForm, members: bondForm.members.includes(iface.name) ? bondForm.members.filter(m => m !== iface.name) : [...bondForm.members, iface.name] })} />
                    {iface.name}
                  </label>
                ))}
                {availableIfaces.length === 0 && <span className="text-xs text-slate-500">No available interfaces</span>}
              </div>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Mode</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Members</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Addresses</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {(bonds || []).length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No bonds configured</td></tr>
                ) : (bonds || []).map(b => (
                  <tr key={b.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{b.name}</td>
                    <td className="px-4 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">{b.mode}</span></td>
                    <td className="px-4 py-3 text-slate-400">{b.members.join(', ')}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{(b.addresses || []).join(', ') || '-'}</td>
                    <td className="px-4 py-3"><button onClick={() => deleteBond(b.id)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Port Forwards */}
      {tab === 'port-forwards' && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-sm font-semibold text-white mb-3">Create Port Forward</h3>
            <div className="flex flex-wrap items-center gap-3">
              <select className={`${inputCls} w-24`} value={pfForm.protocol} onChange={e => setPfForm({ ...pfForm, protocol: e.target.value })}>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
              <input className={`${inputCls} w-28`} placeholder="Host port" type="number" value={pfForm.host_port} onChange={e => setPfForm({ ...pfForm, host_port: e.target.value })} />
              <input className={`${inputCls} w-36`} placeholder="Guest IP" value={pfForm.guest_ip} onChange={e => setPfForm({ ...pfForm, guest_ip: e.target.value })} />
              <input className={`${inputCls} w-28`} placeholder="Guest port" type="number" value={pfForm.guest_port} onChange={e => setPfForm({ ...pfForm, guest_port: e.target.value })} />
              <button onClick={createPf} className={btnPrimary}><Plus className="w-4 h-4 inline mr-1" />Create</button>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Protocol</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Host Port</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Guest IP</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Guest Port</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {(portForwards || []).length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No port forwards configured</td></tr>
                ) : (portForwards || []).map(pf => (
                  <tr key={pf.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400 uppercase">{pf.protocol}</span></td>
                    <td className="px-4 py-3 text-white font-mono">{pf.host_port}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono">{pf.guest_ip}</td>
                    <td className="px-4 py-3 text-white font-mono">{pf.guest_port}</td>
                    <td className="px-4 py-3"><button onClick={() => deletePf(pf.id)} className={btnDanger}><Trash2 className="w-3.5 h-3.5" /></button></td>
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
