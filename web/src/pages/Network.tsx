import { useState, useEffect, useCallback } from 'react'
import { Network as NetworkIcon, RefreshCw, X, Server, Layers, Cable, Terminal, Link2, Settings, FileText, ArrowRightLeft } from 'lucide-react'
import * as api from '../api/networkd'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import type {
  BridgeConfig, VlanConfig, MacvtapConfig, TapConfig, LinkInfo,
  BondConfig, NetworkFileConfig, LinkFileConfig, PortForwardConfig,
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
  StatusTab,
} from './network'
import { extractErrorMessage } from './network/ModalShared'

type Tab = 'bridges' | 'bonds' | 'vlans' | 'macvtap' | 'taps' | 'netfiles' | 'linkfiles' | 'portforwards' | 'status'
type Modal = 'bridge' | 'bond' | 'vlan' | 'macvtap' | 'tap' | 'netfile' | 'linkfile' | 'portforward' | null

export default function Network() {
  const [activeTab, setActiveTab] = useState<Tab>('bridges')
  const [bridges, setBridges] = useState<BridgeConfig[]>([])
  const [bonds, setBonds] = useState<BondConfig[]>([])
  const [vlans, setVlans] = useState<VlanConfig[]>([])
  const [macvtaps, setMacvtaps] = useState<MacvtapConfig[]>([])
  const [taps, setTaps] = useState<TapConfig[]>([])
  const [netfiles, setNetfiles] = useState<NetworkFileConfig[]>([])
  const [linkfiles, setLinkfiles] = useState<LinkFileConfig[]>([])
  const [portForwards, setPortForwards] = useState<PortForwardConfig[]>([])
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
      const [b, bo, v, m, t, nf, lf, pf, l] = await Promise.all([
        api.listBridges(),
        api.listBonds(),
        api.listVlans(),
        api.listMacvtaps(),
        api.listTaps(),
        api.listNetworkFiles(),
        api.listLinkFiles(),
        api.listPortForwards(),
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
      setLinks(l)
    } catch (e: unknown) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleReload = async () => {
    try {
      await api.reloadNetworkd()
      await fetchAll()
    } catch (e: unknown) {
      setError(extractErrorMessage(e))
    }
  }

  const handleDeleteBridge = async (id: string) => {
    if (!await confirm('Delete Bridge', 'Delete this bridge and its systemd-networkd config files?')) return
    try {
      await api.deleteBridge(id)
      setBridges(prev => prev.filter(b => b.id !== id))
    } catch (e: unknown) { setError(extractErrorMessage(e)) }
  }

  const handleDeleteVlan = async (id: string) => {
    if (!await confirm('Delete VLAN', 'Delete this VLAN?')) return
    try {
      await api.deleteVlan(id)
      setVlans(prev => prev.filter(v => v.id !== id))
    } catch (e: unknown) { setError(extractErrorMessage(e)) }
  }

  const handleDeleteMacvtap = async (id: string) => {
    if (!await confirm('Delete Macvtap', 'Delete this macvtap device?')) return
    try {
      await api.deleteMacvtap(id)
      setMacvtaps(prev => prev.filter(m => m.id !== id))
    } catch (e: unknown) { setError(extractErrorMessage(e)) }
  }

  const handleDeleteTap = async (id: string) => {
    if (!await confirm('Delete Tap', 'Delete this tap device?')) return
    try {
      await api.deleteTap(id)
      setTaps(prev => prev.filter(t => t.id !== id))
    } catch (e: unknown) { setError(extractErrorMessage(e)) }
  }

  const handleDeleteBond = async (id: string) => {
    if (!await confirm('Delete Bond', 'Delete this bond and its systemd-networkd config files?')) return
    try {
      await api.deleteBond(id)
      setBonds(prev => prev.filter(b => b.id !== id))
    } catch (e: unknown) { setError(extractErrorMessage(e)) }
  }

  const handleDeleteNetfile = async (id: string) => {
    if (!await confirm('Delete Network File', 'Delete this network file config?')) return
    try {
      await api.deleteNetworkFile(id)
      setNetfiles(prev => prev.filter(n => n.id !== id))
    } catch (e: unknown) { setError(extractErrorMessage(e)) }
  }

  const handleDeleteLinkfile = async (id: string) => {
    if (!await confirm('Delete Link File', 'Delete this link file config?')) return
    try {
      await api.deleteLinkFile(id)
      setLinkfiles(prev => prev.filter(l => l.id !== id))
    } catch (e: unknown) { setError(extractErrorMessage(e)) }
  }

  const handleDeletePortForward = async (id: string) => {
    if (!await confirm('Delete Port Forward', 'Delete this port forward rule?')) return
    try {
      await api.deletePortForward(id)
      setPortForwards(prev => prev.filter(p => p.id !== id))
    } catch (e: unknown) { setError(extractErrorMessage(e)) }
  }

  const handleSyncPortForwards = async () => {
    try {
      await api.syncPortForwards()
      await fetchAll()
    } catch (e: unknown) { setError(extractErrorMessage(e)) }
  }

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
    { key: 'status', label: 'Status', icon: <RefreshCw className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <NetworkIcon className="w-8 h-8" />
          Network Configuration
        </h1>
        <button onClick={handleReload} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition">
          <RefreshCw className="w-4 h-4" />
          Reload networkd
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <div className="text-gray-400 text-xs mb-1">Bridges</div>
          <div className="text-2xl font-bold text-blue-400">{bridges.length}</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <div className="text-gray-400 text-xs mb-1">Bonds</div>
          <div className="text-2xl font-bold text-cyan-400">{bonds.length}</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <div className="text-gray-400 text-xs mb-1">VLANs</div>
          <div className="text-2xl font-bold text-purple-400">{vlans.length}</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <div className="text-gray-400 text-xs mb-1">Macvtap</div>
          <div className="text-2xl font-bold text-green-400">{macvtaps.length}</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <div className="text-gray-400 text-xs mb-1">Tap</div>
          <div className="text-2xl font-bold text-orange-400">{taps.length}</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <div className="text-gray-400 text-xs mb-1">Interfaces</div>
          <div className="text-2xl font-bold text-yellow-400">{netfiles.length}</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <div className="text-gray-400 text-xs mb-1">Link Files</div>
          <div className="text-2xl font-bold text-pink-400">{linkfiles.length}</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <div className="text-gray-400 text-xs mb-1">Port Forwards</div>
          <div className="text-2xl font-bold text-red-400">{portForwards.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800">
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === t.key
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading...</div>
      ) : (
        <>
          {activeTab === 'bridges' && (
            <BridgesTab bridges={bridges} onDelete={handleDeleteBridge} onCreate={() => setActiveModal('bridge')} />
          )}
          {activeTab === 'bonds' && (
            <BondsTab bonds={bonds} onDelete={handleDeleteBond} onCreate={() => setActiveModal('bond')} />
          )}
          {activeTab === 'vlans' && (
            <VlansTab vlans={vlans} onDelete={handleDeleteVlan} onCreate={() => setActiveModal('vlan')} />
          )}
          {activeTab === 'macvtap' && (
            <MacvtapTab macvtaps={macvtaps} onDelete={handleDeleteMacvtap} onCreate={() => setActiveModal('macvtap')} />
          )}
          {activeTab === 'taps' && (
            <TapsTab taps={taps} onDelete={handleDeleteTap} onCreate={() => setActiveModal('tap')} />
          )}
          {activeTab === 'netfiles' && (
            <NetfilesTab netfiles={netfiles} onDelete={handleDeleteNetfile} onCreate={() => setActiveModal('netfile')} />
          )}
          {activeTab === 'linkfiles' && (
            <LinkfilesTab linkfiles={linkfiles} onDelete={handleDeleteLinkfile} onCreate={() => setActiveModal('linkfile')} />
          )}
          {activeTab === 'portforwards' && (
            <PortForwardsTab portForwards={portForwards} onDelete={handleDeletePortForward} onCreate={() => setActiveModal('portforward')} onSync={handleSyncPortForwards} />
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
