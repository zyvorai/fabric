// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
import { Network as NetworkIcon, RefreshCw, Server, Layers, Cable, Terminal, Link2, Settings, FileText, ArrowRightLeft, Radio, Cpu } from 'lucide-react'
import * as api from '../api/networkd'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import type {
  BridgeConfig, VlanConfig, MacvtapConfig, TapConfig, LinkInfo,
  BondConfig, NetworkFileConfig, LinkFileConfig, PortForwardConfig,
  VxlanConfig, SriovConfig,
} from '../api/networkd'
import {
  BridgesTab, CreateBridgeModal,
  BondsTab, CreateBondModal,
  VlansTab, CreateVlanModal,
  MacvtapTab, CreateMacvtapModal,
  TapsTab, CreateTapModal,
  NetfilesTab, CreateNetfileModal,
  LinkfilesTab, CreateLinkfileModal,
  PortForwardsTab, CreatePortForwardModal,
  VxlansTab, CreateVxlanModal,
  SriovTab, CreateSriovModal,
  StatusTab,
} from './network/index'
import { countNetfileTypes } from './network/NetfilesTab'
import { extractErrorMessage } from './network/ModalShared'
import ErrorBanner from '../components/ErrorBanner'
import { formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { useToastContext } from '../contexts/ToastContext'
import { hintsForError } from '../utils/daemonHints'
import SubsystemBanner from '../components/SubsystemBanner'

type Tab = 'bridges' | 'bonds' | 'vlans' | 'macvtap' | 'taps' | 'netfiles' | 'linkfiles' | 'portforwards' | 'vxlan' | 'sriov' | 'status'
type Modal = 'bridge' | 'bond' | 'vlan' | 'macvtap' | 'tap' | 'netfile' | 'linkfile' | 'portforward' | 'vxlan' | 'sriov' | null

export default function Network() {
  const toast = useToastContext()
  const [activeTab, setActiveTab] = useState<Tab>('bridges')
  const [bridges, setBridges] = useState<BridgeConfig[]>([])
  const [bonds, setBonds] = useState<BondConfig[]>([])
  const [vlans, setVlans] = useState<VlanConfig[]>([])
  const [macvtaps, setMacvtaps] = useState<MacvtapConfig[]>([])
  const [taps, setTaps] = useState<TapConfig[]>([])
  const [netfiles, setNetfiles] = useState<NetworkFileConfig[]>([])
  const [linkfiles, setLinkfiles] = useState<LinkFileConfig[]>([])
  const [portForwards, setPortForwards] = useState<PortForwardConfig[]>([])
  const [vxlans, setVxlans] = useState<VxlanConfig[]>([])
  const [sriov, setSriov] = useState<SriovConfig[]>([])
  const [links, setLinks] = useState<LinkInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Single modal state replaces 8 separate booleans
  const [activeModal, setActiveModal] = useState<Modal>(null)
  const { confirmState, confirm, cancel } = useConfirm()

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [b, bo, v, m, t, nf, lf, pf, vx, sr, l] = await Promise.all([
        api.listBridges(),
        api.listBonds(),
        api.listVlans(),
        api.listMacvtaps(),
        api.listTaps(),
        api.listNetworkFiles(),
        api.listLinkFiles(),
        api.listPortForwards(),
        api.listVxlans(),
        api.listSriov(),
        api.listLinks().catch(() => []),
      ])
      setBridges(b)
      setBonds(bo)
      setVlans(v)
      setMacvtaps(m)
      setTaps(t)
      setNetfiles(nf)
      setLinkfiles(lf)
      setPortForwards(pf)
      setVxlans(vx)
      setSriov(sr)
      setLinks(l)
    } catch (e: unknown) {
      const msg = formatUserError(e)
      setError(msg)
      toastFailure(toast, 'Failed to load network configuration', e)
    } finally {
      setLoading(false)
    }
  }, [toast])

  const failAction = useCallback((label: string, e: unknown) => {
    setError(extractErrorMessage(e))
    toastFailure(toast, label, e)
  }, [toast])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleReload = async () => {
    try {
      await api.reloadNetworkd()
      await fetchAll()
    } catch (e: unknown) {
      failAction('Failed to reload networkd', e)
    }
  }

  const handleDeleteBridge = async (id: string) => {
    if (!await confirm('Delete Bridge', 'Delete this bridge and its systemd-networkd config files?')) return
    try {
      await api.deleteBridge(id)
      setBridges(prev => prev.filter(b => b.id !== id))
    } catch (e: unknown) { failAction('Failed to delete bridge', e) }
  }

  const handleAdoptBridge = async (hostId: string) => {
    const name = hostId.replace(/^host:/, '')
    if (!await confirm(
      'Adopt Bridge',
      `Import "${name}" into vmspawnd? This writes systemd-networkd config files and reloads networkd.`,
    )) return
    try {
      const adopted = await api.adoptBridge(hostId)
      setBridges(prev => [...prev.filter(b => b.id !== hostId), adopted])
      toast.success(`Bridge "${adopted.name}" is now managed by vmspawnd`)
    } catch (e: unknown) { failAction('Failed to adopt bridge', e) }
  }

  const handleDeleteVlan = async (id: string) => {
    if (!await confirm('Delete VLAN', 'Delete this VLAN?')) return
    try {
      await api.deleteVlan(id)
      setVlans(prev => prev.filter(v => v.id !== id))
    } catch (e: unknown) { failAction('Failed to delete VLAN', e) }
  }

  const handleDeleteMacvtap = async (id: string) => {
    if (!await confirm('Delete Macvtap', 'Delete this macvtap device?')) return
    try {
      await api.deleteMacvtap(id)
      setMacvtaps(prev => prev.filter(m => m.id !== id))
    } catch (e: unknown) { failAction('Failed to delete macvtap', e) }
  }

  const handleDeleteTap = async (id: string) => {
    if (!await confirm('Delete Tap', 'Delete this tap device?')) return
    try {
      await api.deleteTap(id)
      setTaps(prev => prev.filter(t => t.id !== id))
    } catch (e: unknown) { failAction('Failed to delete tap', e) }
  }

  const handleDeleteBond = async (id: string) => {
    if (!await confirm('Delete Bond', 'Delete this bond and its systemd-networkd config files?')) return
    try {
      await api.deleteBond(id)
      setBonds(prev => prev.filter(b => b.id !== id))
    } catch (e: unknown) { failAction('Failed to delete bond', e) }
  }

  const handleDeleteNetfile = async (id: string) => {
    if (!await confirm('Delete Network File', 'Delete this network file config?')) return
    try {
      await api.deleteNetworkFile(id)
      setNetfiles(prev => prev.filter(n => n.id !== id))
    } catch (e: unknown) { failAction('Failed to delete network file', e) }
  }

  const handleAdoptNetfile = async (hostId: string) => {
    const name = hostId.replace(/^host:/, '')
    if (!await confirm(
      'Adopt Interface',
      `Import "${name}" into vmspawnd? This writes a .network file and reloads networkd.`,
    )) return
    try {
      const adopted = await api.adoptNetworkFile(hostId)
      setNetfiles(prev => [...prev.filter(n => n.id !== hostId), adopted])
      toast.success(`Interface "${adopted.match_name}" is now managed by vmspawnd`)
    } catch (e: unknown) { failAction('Failed to adopt interface', e) }
  }

  const adoptHost = async <T extends { id: string; name?: string; match_name?: string }>(
    label: string,
    hostId: string,
    adoptFn: (id: string) => Promise<T>,
    setState: Dispatch<SetStateAction<T[]>>,
  ) => {
    const name = hostId.replace(/^host:/, '')
    if (!await confirm(`Adopt ${label}`, `Import "${name}" into vmspawnd and write systemd-networkd config?`)) return
    try {
      const adopted = await adoptFn(hostId)
      setState(prev => [...prev.filter(x => x.id !== hostId), adopted])
      const display = adopted.match_name ?? adopted.name ?? name
      toast.success(`${label} "${display}" is now managed by vmspawnd`)
    } catch (e: unknown) {
      failAction(`Failed to adopt ${label.toLowerCase()}`, e)
    }
  }

  const handleDeleteLinkfile = async (id: string) => {
    if (!await confirm('Delete Link File', 'Delete this link file config?')) return
    try {
      await api.deleteLinkFile(id)
      setLinkfiles(prev => prev.filter(l => l.id !== id))
    } catch (e: unknown) { failAction('Failed to delete link file', e) }
  }

  const handleDeletePortForward = async (id: string) => {
    if (!await confirm('Delete Port Forward', 'Delete this port forward rule?')) return
    try {
      await api.deletePortForward(id)
      setPortForwards(prev => prev.filter(p => p.id !== id))
    } catch (e: unknown) { failAction('Failed to delete port forward', e) }
  }

  const handleSyncPortForwards = async () => {
    try {
      await api.syncPortForwards()
      await fetchAll()
    } catch (e: unknown) { failAction('Failed to sync port forwards', e) }
  }

  const handleDeleteVxlan = async (id: string) => {
    if (!await confirm('Delete VXLAN', 'Delete this VXLAN configuration?')) return
    try {
      await api.deleteVxlan(id)
      setVxlans(prev => prev.filter(v => v.id !== id))
    } catch (e: unknown) { failAction('Failed to delete VXLAN', e) }
  }

  const handleDeleteSriov = async (id: string) => {
    if (!await confirm('Delete SR-IOV', 'Delete this SR-IOV configuration?')) return
    try {
      await api.deleteSriov(id)
      setSriov(prev => prev.filter(s => s.id !== id))
    } catch (e: unknown) { failAction('Failed to delete SR-IOV', e) }
  }

  const netfileCounts = useMemo(() => countNetfileTypes(netfiles), [netfiles])

  const closeModal = () => setActiveModal(null)

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'bridges', label: 'Bridges', icon: <Server className="w-4 h-4" /> },
    { key: 'bonds', label: 'Bonds', icon: <Link2 className="w-4 h-4" /> },
    { key: 'vlans', label: 'VLANs', icon: <Layers className="w-4 h-4" /> },
    { key: 'macvtap', label: 'Macvtap', icon: <Cable className="w-4 h-4" /> },
    { key: 'taps', label: 'Tap', icon: <Terminal className="w-4 h-4" /> },
    { key: 'netfiles', label: 'Interfaces', icon: <Settings className="w-4 h-4" /> },
    { key: 'linkfiles', label: 'Link Files', icon: <FileText className="w-4 h-4" /> },
    { key: 'portforwards', label: 'Port Forwards', icon: <ArrowRightLeft className="w-4 h-4" /> },
    { key: 'vxlan', label: 'VXLAN', icon: <Radio className="w-4 h-4" /> },
    { key: 'sriov', label: 'SR-IOV', icon: <Cpu className="w-4 h-4" /> },
    { key: 'status', label: 'Status', icon: <RefreshCw className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-6">
      <SubsystemBanner subsystem="machined" title="Network stack" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <NetworkIcon className="w-8 h-8" />
          Network Configuration
        </h1>
        <button onClick={handleReload} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition">
          <RefreshCw className="w-4 h-4" />
          Reload networkd
        </button>
      </div>

      {error && (
        <ErrorBanner
          title="Could not load network"
          headline={error}
          hints={hintsForError(error, 'network')}
          onRetry={fetchAll}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10 gap-4">
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">Bridges</div>
          <div className="text-2xl font-bold text-blue-400">{bridges.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">Bonds</div>
          <div className="text-2xl font-bold text-cyan-400">{bonds.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">VLANs</div>
          <div className="text-2xl font-bold text-purple-400">{vlans.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">Macvtap</div>
          <div className="text-2xl font-bold text-green-400">{macvtaps.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">Tap</div>
          <div className="text-2xl font-bold text-orange-400">{taps.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">Interfaces</div>
          <div className="text-2xl font-bold text-yellow-400">{netfileCounts.total}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {netfileCounts.physical} phys · {netfileCounts.container} ctr
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">Link Files</div>
          <div className="text-2xl font-bold text-pink-400">{linkfiles.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">Port Forwards</div>
          <div className="text-2xl font-bold text-red-400">{portForwards.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">VXLAN</div>
          <div className="text-2xl font-bold text-indigo-400">{vxlans.length}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-1">SR-IOV</div>
          <div className="text-2xl font-bold text-violet-400">{sriov.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-700/50">
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
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
          {activeTab === 'bridges' && (
            <BridgesTab bridges={bridges} onDelete={handleDeleteBridge} onAdopt={handleAdoptBridge} onCreate={() => setActiveModal('bridge')} />
          )}
          {activeTab === 'bonds' && (
            <BondsTab bonds={bonds} onDelete={handleDeleteBond} onAdopt={id => adoptHost('Bond', id, api.adoptBond, setBonds)} onCreate={() => setActiveModal('bond')} />
          )}
          {activeTab === 'vlans' && (
            <VlansTab vlans={vlans} onDelete={handleDeleteVlan} onAdopt={id => adoptHost('VLAN', id, api.adoptVlan, setVlans)} onCreate={() => setActiveModal('vlan')} />
          )}
          {activeTab === 'macvtap' && (
            <MacvtapTab macvtaps={macvtaps} onDelete={handleDeleteMacvtap} onAdopt={id => adoptHost('Macvtap', id, api.adoptMacvtap, setMacvtaps)} onCreate={() => setActiveModal('macvtap')} />
          )}
          {activeTab === 'taps' && (
            <TapsTab taps={taps} onDelete={handleDeleteTap} onAdopt={id => adoptHost('Tap', id, api.adoptTap, setTaps)} onCreate={() => setActiveModal('tap')} />
          )}
          {activeTab === 'netfiles' && (
            <NetfilesTab netfiles={netfiles} onDelete={handleDeleteNetfile} onAdopt={handleAdoptNetfile} onCreate={() => setActiveModal('netfile')} />
          )}
          {activeTab === 'linkfiles' && (
            <LinkfilesTab linkfiles={linkfiles} onDelete={handleDeleteLinkfile} onCreate={() => setActiveModal('linkfile')} />
          )}
          {activeTab === 'portforwards' && (
            <PortForwardsTab
              portForwards={portForwards}
              onDelete={handleDeletePortForward}
              onAdopt={id => adoptHost('Port forward', id, api.adoptPortForward, setPortForwards)}
              onCreate={() => setActiveModal('portforward')}
              onSync={handleSyncPortForwards}
            />
          )}
          {activeTab === 'vxlan' && (
            <VxlansTab
              vxlans={vxlans}
              onDelete={handleDeleteVxlan}
              onAdopt={id => adoptHost('VXLAN', id, api.adoptVxlan, setVxlans)}
              onCreate={() => setActiveModal('vxlan')}
            />
          )}
          {activeTab === 'sriov' && (
            <SriovTab
              sriov={sriov}
              onDelete={handleDeleteSriov}
              onAdopt={id => adoptHost('SR-IOV', id, api.adoptSriov, setSriov)}
              onCreate={() => setActiveModal('sriov')}
            />
          )}
          {activeTab === 'status' && <StatusTab links={links} onRefresh={fetchAll} />}
        </>
      )}

      {/* Modals */}
      {activeModal === 'bridge' && <CreateBridgeModal onClose={closeModal} onCreated={(b) => { setBridges(prev => [...prev, b]); closeModal() }} />}
      {activeModal === 'bond' && <CreateBondModal onClose={closeModal} onCreated={(b) => { setBonds(prev => [...prev, b]); closeModal() }} />}
      {activeModal === 'vlan' && <CreateVlanModal onClose={closeModal} onCreated={(v) => { setVlans(prev => [...prev, v]); closeModal() }} />}
      {activeModal === 'macvtap' && <CreateMacvtapModal onClose={closeModal} onCreated={(m) => { setMacvtaps(prev => [...prev, m]); closeModal() }} />}
      {activeModal === 'tap' && <CreateTapModal onClose={closeModal} onCreated={(t) => { setTaps(prev => [...prev, t]); closeModal() }} />}
      {activeModal === 'netfile' && <CreateNetfileModal onClose={closeModal} onCreated={(n) => { setNetfiles(prev => [...prev, n]); closeModal() }} />}
      {activeModal === 'linkfile' && <CreateLinkfileModal onClose={closeModal} onCreated={(l) => { setLinkfiles(prev => [...prev, l]); closeModal() }} />}
      {activeModal === 'portforward' && <CreatePortForwardModal onClose={closeModal} onCreated={(pf) => { setPortForwards(prev => [...prev, pf]); closeModal() }} />}
      {activeModal === 'vxlan' && <CreateVxlanModal onClose={closeModal} onCreated={(v) => { setVxlans(prev => [...prev, v]); closeModal() }} />}
      {activeModal === 'sriov' && <CreateSriovModal onClose={closeModal} onCreated={(s) => { setSriov(prev => [...prev, s]); closeModal() }} />}
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
