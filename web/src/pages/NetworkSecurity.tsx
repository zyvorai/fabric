// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback } from 'react'
import {
  Shield, RefreshCw, ShieldCheck, Globe, Server, Gauge,
  Wifi, Eye, ArrowUpDown, Activity,
} from 'lucide-react'
import * as api from '../api/network-security'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import type {
  NetworkPolicy, FirewallProfile, FirewallZone, VMFirewallAssignment,
  Service, QoSPolicy, DnsZone, DnsPolicy, VpnTunnel, VpnNetwork,
  MirrorSession, NatRule, NatPool, NatGatewayConfig,
  MonitorPolicy, NetworkMetrics, BandwidthAlert,
} from '../api/network-security'
import {
  PoliciesTab, CreatePolicyModal,
  FirewallTab, CreateFirewallProfileModal,
  ServicesTab, CreateServiceModal,
  QosTab, CreateQosModal,
  DnsTab, CreateDnsZoneModal, CreateDnsPolicyModal,
  VpnTab, CreateVpnTunnelModal, CreateVpnNetworkModal,
  MirrorTab, CreateMirrorModal,
  NatTab, CreateNatRuleModal, CreateNatPoolModal, CreateNatGatewayModal,
  MonitorTab, CreateMonitorPolicyModal,
} from './network-security'
import { extractErrorMessage } from './network/ModalShared'
import ErrorBanner from '../components/ErrorBanner'
import { formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { useToastContext } from '../contexts/ToastContext'

type Tab = 'policies' | 'firewall' | 'services' | 'qos' | 'dns' | 'vpn' | 'mirror' | 'nat' | 'monitor'
type Modal =
  | 'policy' | 'firewall-profile' | 'service' | 'qos'
  | 'dns-zone' | 'dns-policy' | 'vpn-tunnel' | 'vpn-network'
  | 'mirror' | 'nat-rule' | 'nat-pool' | 'nat-gateway' | 'monitor'
  | null

export default function NetworkSecurity() {
  const toast = useToastContext()
  const [activeTab, setActiveTab] = useState<Tab>('policies')

  // Data state
  const [policies, setPolicies] = useState<NetworkPolicy[]>([])
  const [fwProfiles, setFwProfiles] = useState<FirewallProfile[]>([])
  const [fwZones, setFwZones] = useState<FirewallZone[]>([])
  const [fwAssignments, setFwAssignments] = useState<VMFirewallAssignment[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [qosPolicies, setQosPolicies] = useState<QoSPolicy[]>([])
  const [dnsZones, setDnsZones] = useState<DnsZone[]>([])
  const [dnsPolicies, setDnsPolicies] = useState<DnsPolicy[]>([])
  const [vpnTunnels, setVpnTunnels] = useState<VpnTunnel[]>([])
  const [vpnNetworks, setVpnNetworks] = useState<VpnNetwork[]>([])
  const [mirrorSessions, setMirrorSessions] = useState<MirrorSession[]>([])
  const [natRules, setNatRules] = useState<NatRule[]>([])
  const [natPools, setNatPools] = useState<NatPool[]>([])
  const [natGateways, setNatGateways] = useState<NatGatewayConfig[]>([])
  const [monitorPolicies, setMonitorPolicies] = useState<MonitorPolicy[]>([])
  const [metrics, setMetrics] = useState<NetworkMetrics[]>([])
  const [alerts, setAlerts] = useState<BandwidthAlert[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeModal, setActiveModal] = useState<Modal>(null)
  const { confirmState, confirm, cancel } = useConfirm()

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [
        pol, fwp, fwz, fwa, svc, qos, dz, dp,
        vt, vn, ms, nr, np, ng, mp, met, al,
      ] = await Promise.all([
        api.listNetworkPolicies().catch(() => []),
        api.listFirewallProfiles().catch(() => []),
        api.listFirewallZones().catch(() => []),
        api.listVMFirewallAssignments().catch(() => []),
        api.listServices().catch(() => []),
        api.listQosPolicies().catch(() => []),
        api.listDnsZones().catch(() => []),
        api.listDnsPolicies().catch(() => []),
        api.listVpnTunnels().catch(() => []),
        api.listVpnNetworks().catch(() => []),
        api.listMirrorSessions().catch(() => []),
        api.listNatRules().catch(() => []),
        api.listNatPools().catch(() => []),
        api.listNatGateways().catch(() => []),
        api.listMonitorPolicies().catch(() => []),
        api.listNetworkMetrics().catch(() => []),
        api.listBandwidthAlerts().catch(() => []),
      ])
      setPolicies(pol)
      setFwProfiles(fwp)
      setFwZones(fwz)
      setFwAssignments(fwa)
      setServices(svc)
      setQosPolicies(qos)
      setDnsZones(dz)
      setDnsPolicies(dp)
      setVpnTunnels(vt)
      setVpnNetworks(vn)
      setMirrorSessions(ms)
      setNatRules(nr)
      setNatPools(np)
      setNatGateways(ng)
      setMonitorPolicies(mp)
      setMetrics(met)
      setAlerts(al)
    } catch (e: unknown) {
      const msg = formatUserError(e)
      setError(msg)
      toastFailure(toast, 'Failed to load network security', e)
    } finally {
      setLoading(false)
    }
  }, [toast])

  const failAction = useCallback((label: string, e: unknown) => {
    setError(extractErrorMessage(e))
    toastFailure(toast, label, e)
  }, [toast])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ─── Delete handlers ─────────────────────────────────────────────────────

  const handleDeletePolicy = async (id: string) => {
    if (!await confirm('Delete Policy', 'Delete this network policy?')) return
    try { await api.deleteNetworkPolicy(id); setPolicies(prev => prev.filter(p => p.id !== id)) }
    catch (e: unknown) { failAction('Failed to delete network policy', e) }
  }

  const handleDeleteFwProfile = async (id: string) => {
    if (!await confirm('Delete Profile', 'Delete this firewall profile?')) return
    try { await api.deleteFirewallProfile(id); setFwProfiles(prev => prev.filter(p => p.id !== id)) }
    catch (e: unknown) { failAction('Failed to delete firewall profile', e) }
  }

  const handleDeleteFwZone = async (id: string) => {
    if (!await confirm('Delete Zone', 'Delete this firewall zone?')) return
    try { await api.deleteFirewallZone(id); setFwZones(prev => prev.filter(z => z.id !== id)) }
    catch (e: unknown) { failAction('Failed to delete firewall zone', e) }
  }

  const handleDeleteFwAssignment = async (vmName: string) => {
    if (!await confirm('Delete Assignment', 'Remove this VM firewall assignment?')) return
    try { await api.deleteVMFirewallAssignment(vmName); setFwAssignments(prev => prev.filter(a => a.vm_name !== vmName)) }
    catch (e: unknown) { failAction('Failed to remove firewall assignment', e) }
  }

  const handleAdoptNatRule = async (id: string) => {
    try {
      const adopted = await api.adoptNatRule(id)
      setNatRules(prev => [...prev.filter(r => r.id !== id), adopted])
    } catch (e: unknown) { failAction('Failed to adopt NAT rule', e) }
  }

  const handleAdoptService = async (id: string) => {
    try {
      const adopted = await api.adoptService(id)
      setServices(prev => [...prev.filter(s => s.id !== id), adopted])
    } catch (e: unknown) { failAction('Failed to adopt host listener', e) }
  }

  const handleAdoptFwZone = async (id: string) => {
    try {
      const adopted = await api.adoptFirewallZone(id)
      setFwZones(prev => [...prev.filter(z => z.id !== id), adopted])
    } catch (e: unknown) { failAction('Failed to adopt firewalld zone', e) }
  }

  const handleAdoptFwProfile = async (id: string) => {
    try {
      const adopted = await api.adoptFirewallProfile(id)
      setFwProfiles(prev => [...prev.filter(p => p.id !== id), adopted])
    } catch (e: unknown) { failAction('Failed to adopt firewall profile', e) }
  }

  const handleAdoptQos = async (id: string) => {
    try {
      const adopted = await api.adoptQosPolicy(id)
      setQosPolicies(prev => [...prev.filter(p => p.id !== id), adopted])
    } catch (e: unknown) { failAction('Failed to adopt QoS policy', e) }
  }

  const handleDeleteService = async (id: string) => {
    if (!await confirm('Delete Service', 'Delete this service?')) return
    try { await api.deleteService(id); setServices(prev => prev.filter(s => s.id !== id)) }
    catch (e: unknown) { failAction('Failed to delete service', e) }
  }

  const handleDeleteQos = async (id: string) => {
    if (!await confirm('Delete QoS Policy', 'Delete this QoS policy?')) return
    try { await api.deleteQosPolicy(id); setQosPolicies(prev => prev.filter(p => p.id !== id)) }
    catch (e: unknown) { failAction('Failed to delete QoS policy', e) }
  }

  const handleDeleteDnsZone = async (id: string) => {
    if (!await confirm('Delete DNS Zone', 'Delete this DNS zone?')) return
    try { await api.deleteDnsZone(id); setDnsZones(prev => prev.filter(z => z.id !== id)) }
    catch (e: unknown) { failAction('Failed to delete DNS zone', e) }
  }

  const handleDeleteDnsPolicy = async (id: string) => {
    if (!await confirm('Delete DNS Policy', 'Delete this DNS policy?')) return
    try { await api.deleteDnsPolicy(id); setDnsPolicies(prev => prev.filter(p => p.id !== id)) }
    catch (e: unknown) { failAction('Failed to delete DNS policy', e) }
  }

  const handleDeleteVpnTunnel = async (id: string) => {
    if (!await confirm('Delete Tunnel', 'Delete this VPN tunnel?')) return
    try { await api.deleteVpnTunnel(id); setVpnTunnels(prev => prev.filter(t => t.id !== id)) }
    catch (e: unknown) { failAction('Failed to delete VPN tunnel', e) }
  }

  const handleDeleteVpnNetwork = async (id: string) => {
    if (!await confirm('Delete Network', 'Delete this VPN network?')) return
    try { await api.deleteVpnNetwork(id); setVpnNetworks(prev => prev.filter(n => n.id !== id)) }
    catch (e: unknown) { failAction('Failed to delete VPN network', e) }
  }

  const handleDeleteMirror = async (id: string) => {
    if (!await confirm('Delete Session', 'Delete this mirror session?')) return
    try { await api.deleteMirrorSession(id); setMirrorSessions(prev => prev.filter(s => s.id !== id)) }
    catch (e: unknown) { failAction('Failed to delete mirror session', e) }
  }

  const handleDeleteNatRule = async (id: string) => {
    if (!await confirm('Delete NAT Rule', 'Delete this NAT rule?')) return
    try { await api.deleteNatRule(id); setNatRules(prev => prev.filter(r => r.id !== id)) }
    catch (e: unknown) { failAction('Failed to delete NAT rule', e) }
  }

  const handleDeleteNatPool = async (id: string) => {
    if (!await confirm('Delete NAT Pool', 'Delete this NAT pool?')) return
    try { await api.deleteNatPool(id); setNatPools(prev => prev.filter(p => p.id !== id)) }
    catch (e: unknown) { failAction('Failed to delete NAT pool', e) }
  }

  const handleDeleteNatGateway = async (id: string) => {
    if (!await confirm('Delete NAT Gateway', 'Delete this NAT gateway?')) return
    try { await api.deleteNatGateway(id); setNatGateways(prev => prev.filter(g => g.id !== id)) }
    catch (e: unknown) { failAction('Failed to delete NAT gateway', e) }
  }

  const handleDeleteMonitorPolicy = async (id: string) => {
    if (!await confirm('Delete Monitor Policy', 'Delete this monitor policy?')) return
    try { await api.deleteMonitorPolicy(id); setMonitorPolicies(prev => prev.filter(p => p.id !== id)) }
    catch (e: unknown) { failAction('Failed to delete monitor policy', e) }
  }

  const handleAcknowledgeAlert = async (id: string) => {
    try {
      await api.acknowledgeBandwidthAlert(id)
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a))
    } catch (e: unknown) { failAction('Failed to acknowledge alert', e) }
  }

  // ─── Sync handlers ───────────────────────────────────────────────────────

  const handleSync = async (syncFn: () => Promise<unknown>) => {
    try { await syncFn(); await fetchAll() }
    catch (e: unknown) { failAction('Sync failed', e) }
  }

  const closeModal = () => setActiveModal(null)

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'policies', label: 'Policies', icon: <ShieldCheck className="w-4 h-4" /> },
    { key: 'firewall', label: 'Firewall', icon: <Shield className="w-4 h-4" /> },
    { key: 'services', label: 'Services', icon: <Server className="w-4 h-4" /> },
    { key: 'qos', label: 'QoS', icon: <Gauge className="w-4 h-4" /> },
    { key: 'dns', label: 'DNS', icon: <Globe className="w-4 h-4" /> },
    { key: 'vpn', label: 'VPN', icon: <Wifi className="w-4 h-4" /> },
    { key: 'mirror', label: 'Mirror', icon: <Eye className="w-4 h-4" /> },
    { key: 'nat', label: 'NAT', icon: <ArrowUpDown className="w-4 h-4" /> },
    { key: 'monitor', label: 'Monitor', icon: <Activity className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Shield className="w-8 h-8" />
          Network Security
        </h1>
        <button onClick={() => fetchAll()} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <ErrorBanner
          title="Could not load network security"
          headline={error}
          onRetry={fetchAll}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-4">
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">Policies</div>
          <div className="text-2xl font-bold text-blue-400">{policies.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">Firewall</div>
          <div className="text-2xl font-bold text-red-400">{fwProfiles.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">Services</div>
          <div className="text-2xl font-bold text-cyan-400">{services.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">QoS</div>
          <div className="text-2xl font-bold text-purple-400">{qosPolicies.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">DNS</div>
          <div className="text-2xl font-bold text-green-400">{dnsZones.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">VPN</div>
          <div className="text-2xl font-bold text-orange-400">{vpnTunnels.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">Mirror</div>
          <div className="text-2xl font-bold text-yellow-400">{mirrorSessions.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">NAT</div>
          <div className="text-2xl font-bold text-pink-400">{natRules.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">Monitor</div>
          <div className="text-2xl font-bold text-teal-400">{monitorPolicies.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-700/50">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                activeTab === t.key
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-12">Loading...</div>
      ) : (
        <>
          {activeTab === 'policies' && (
            <PoliciesTab policies={policies} onDelete={handleDeletePolicy} onCreate={() => setActiveModal('policy')} onSync={() => handleSync(api.syncNetworkPolicies)} />
          )}
          {activeTab === 'firewall' && (
            <FirewallTab
              profiles={fwProfiles} zones={fwZones} assignments={fwAssignments}
              onDeleteProfile={handleDeleteFwProfile} onDeleteZone={handleDeleteFwZone} onDeleteAssignment={handleDeleteFwAssignment}
              onAdoptProfile={handleAdoptFwProfile}
              onAdoptZone={handleAdoptFwZone}
              onCreate={() => setActiveModal('firewall-profile')} onSync={() => handleSync(api.syncFirewall)}
            />
          )}
          {activeTab === 'services' && (
            <ServicesTab services={services} onDelete={handleDeleteService} onAdopt={handleAdoptService} onCreate={() => setActiveModal('service')} onSync={() => handleSync(api.syncServices)} />
          )}
          {activeTab === 'qos' && (
            <QosTab policies={qosPolicies} onDelete={handleDeleteQos} onCreate={() => setActiveModal('qos')} onSync={() => handleSync(api.syncQos)} />
          )}
          {activeTab === 'dns' && (
            <DnsTab
              zones={dnsZones} policies={dnsPolicies}
              onDeleteZone={handleDeleteDnsZone} onDeletePolicy={handleDeleteDnsPolicy}
              onCreate={() => setActiveModal('dns-zone')} onSync={() => handleSync(api.syncDns)}
            />
          )}
          {activeTab === 'vpn' && (
            <VpnTab
              tunnels={vpnTunnels} networks={vpnNetworks}
              onDeleteTunnel={handleDeleteVpnTunnel} onDeleteNetwork={handleDeleteVpnNetwork}
              onCreate={() => setActiveModal('vpn-tunnel')} onSync={() => handleSync(api.syncVpn)}
            />
          )}
          {activeTab === 'mirror' && (
            <MirrorTab sessions={mirrorSessions} onDelete={handleDeleteMirror} onCreate={() => setActiveModal('mirror')} onSync={() => handleSync(api.syncMirror)} />
          )}
          {activeTab === 'nat' && (
            <NatTab
              rules={natRules} pools={natPools} gateways={natGateways}
              onDeleteRule={handleDeleteNatRule} onDeletePool={handleDeleteNatPool} onDeleteGateway={handleDeleteNatGateway}
              onAdoptRule={handleAdoptNatRule}
              onCreate={() => setActiveModal('nat-rule')} onSync={() => handleSync(api.syncNat)}
            />
          )}
          {activeTab === 'monitor' && (
            <MonitorTab
              policies={monitorPolicies} metrics={metrics} alerts={alerts}
              onDelete={handleDeleteMonitorPolicy} onAcknowledge={handleAcknowledgeAlert}
              onCreate={() => setActiveModal('monitor')} onSync={() => handleSync(api.syncMonitor)}
            />
          )}
        </>
      )}

      {/* Modals */}
      {activeModal === 'policy' && <CreatePolicyModal onClose={closeModal} onCreated={(p) => { setPolicies(prev => [...prev, p]); closeModal() }} />}
      {activeModal === 'firewall-profile' && <CreateFirewallProfileModal onClose={closeModal} onCreated={(p) => { setFwProfiles(prev => [...prev, p]); closeModal() }} />}
      {activeModal === 'service' && <CreateServiceModal onClose={closeModal} onCreated={(s) => { setServices(prev => [...prev, s]); closeModal() }} />}
      {activeModal === 'qos' && <CreateQosModal onClose={closeModal} onCreated={(p) => { setQosPolicies(prev => [...prev, p]); closeModal() }} />}
      {activeModal === 'dns-zone' && <CreateDnsZoneModal onClose={closeModal} onCreated={(z) => { setDnsZones(prev => [...prev, z]); closeModal() }} />}
      {activeModal === 'dns-policy' && <CreateDnsPolicyModal onClose={closeModal} onCreated={(p) => { setDnsPolicies(prev => [...prev, p]); closeModal() }} />}
      {activeModal === 'vpn-tunnel' && <CreateVpnTunnelModal onClose={closeModal} onCreated={(t) => { setVpnTunnels(prev => [...prev, t]); closeModal() }} />}
      {activeModal === 'vpn-network' && <CreateVpnNetworkModal onClose={closeModal} onCreated={(n) => { setVpnNetworks(prev => [...prev, n]); closeModal() }} />}
      {activeModal === 'mirror' && <CreateMirrorModal onClose={closeModal} onCreated={(s) => { setMirrorSessions(prev => [...prev, s]); closeModal() }} />}
      {activeModal === 'nat-rule' && <CreateNatRuleModal onClose={closeModal} onCreated={(r) => { setNatRules(prev => [...prev, r]); closeModal() }} />}
      {activeModal === 'nat-pool' && <CreateNatPoolModal onClose={closeModal} onCreated={(p) => { setNatPools(prev => [...prev, p]); closeModal() }} />}
      {activeModal === 'nat-gateway' && <CreateNatGatewayModal onClose={closeModal} onCreated={(g) => { setNatGateways(prev => [...prev, g]); closeModal() }} />}
      {activeModal === 'monitor' && <CreateMonitorPolicyModal onClose={closeModal} onCreated={(p) => { setMonitorPolicies(prev => [...prev, p]); closeModal() }} />}
      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel ?? 'Delete'}
          variant={confirmState.variant ?? 'danger'}
          onConfirm={confirmState.onConfirm}
          onCancel={cancel}
        />
      )}
    </div>
  )
}
