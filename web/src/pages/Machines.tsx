// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Server, Terminal, Key, Download, Power, RotateCw, XCircle,
  HardDrive, Trash2, CheckCircle2, Ban, FolderInput,
  Copy, Pencil, Lock, Unlock, Sparkles, X, Monitor,
} from 'lucide-react'
import {
  listMachines, getMachineProperties, shellMachine, getSshInfo,
  poweroffMachine, rebootMachine, terminateMachine,
  enableMachine, disableMachine, copyToMachine, copyFromMachine, bindMachine,
  listMachineImages, pullRawImage, removeMachineImage,
  cloneMachineImage, renameMachineImage, setImageReadOnly, cleanMachineImages,
  MachineInfo, MachineImage, ShellOutput, SshInfo,
} from '../api/machines'
import { useToastContext } from '../contexts/ToastContext'
import ErrorBanner from '../components/ErrorBanner'
import { formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import SubsystemBanner from '../components/SubsystemBanner'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import { PageHeader } from '../components/ui'

export default function Machines() {
  const navigate = useNavigate()
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const [machines, setMachines] = useState<MachineInfo[]>([])
  const [images, setImages] = useState<MachineImage[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'machines' | 'images'>('machines')
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null)
  const [machineProps, setMachineProps] = useState<Record<string, string>>({})
  const [shellCmd, setShellCmd] = useState('')
  const [shellOutput, setShellOutput] = useState<ShellOutput | null>(null)
  const [sshInfo, setSshInfo] = useState<SshInfo | null>(null)
  const [pullUrl, setPullUrl] = useState('')
  const [pullName, setPullName] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fileMode, setFileMode] = useState<'copy-to' | 'copy-from' | 'bind'>('copy-to')
  const [hostPath, setHostPath] = useState('')
  const [machinePath, setMachinePath] = useState('')
  const [bindReadOnly, setBindReadOnly] = useState(false)
  const [imageAction, setImageAction] = useState<{ mode: 'clone' | 'rename'; name: string } | null>(null)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 10000)
    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    setLoadError(null)
    const [machinesRes, imagesRes] = await Promise.allSettled([
      listMachines(),
      listMachineImages(),
    ])
    if (machinesRes.status === 'fulfilled') {
      setMachines(machinesRes.value)
    } else {
      const msg = formatUserError(machinesRes.reason)
      setLoadError(msg)
      toastFailure(toast, 'Failed to load machines', machinesRes.reason)
      setMachines([])
    }
    if (imagesRes.status === 'fulfilled') {
      setImages(imagesRes.value)
    } else {
      toastFailure(toast, 'Failed to load machine images', imagesRes.reason)
      setImages([])
    }
    setLoading(false)
  }

  const selectMachine = async (name: string) => {
    setSelectedMachine(name)
    setShellOutput(null)
    try {
      const [props, ssh] = await Promise.all([
        getMachineProperties(name).catch(() => ({})),
        getSshInfo(name).catch(() => null),
      ])
      setMachineProps(props)
      setSshInfo(ssh)
    } catch (err) { toastFailure(toast, 'Failed to load machine details', err) }
  }

  const runShell = async () => {
    if (!selectedMachine || !shellCmd.trim()) return
    try {
      const out = await shellMachine(selectedMachine, shellCmd)
      setShellOutput(out)
    } catch (e) {
      toastFailure(toast, 'Shell command failed', e)
    }
  }

  const handlePullImage = async () => {
    if (!pullUrl || !pullName) return
    try {
      await pullRawImage(pullUrl, pullName)
      toast.success(`Pulling image '${pullName}'...`)
      setPullUrl('')
      setPullName('')
      loadData()
    } catch (e) {
      toastFailure(toast, 'Failed to pull image', e)
    }
  }

  const handleReboot = async () => {
    if (!selectedMachine) return
    try {
      await rebootMachine(selectedMachine)
      toast.success('Rebooting...')
      loadData()
    } catch (e) {
      toastFailure(toast, 'Failed to reboot machine', e)
    }
  }

  const handlePoweroff = async () => {
    if (!selectedMachine) return
    if (!await confirm('Power Off Machine', `Force power off '${selectedMachine}'? Unsaved state will be lost.`, { variant: 'danger', confirmLabel: 'Power Off' })) return
    try {
      await poweroffMachine(selectedMachine)
      toast.success('Powering off...')
      loadData()
    } catch (e) {
      toastFailure(toast, 'Failed to power off machine', e)
    }
  }

  const handleTerminate = async () => {
    if (!selectedMachine) return
    if (!await confirm('Terminate Machine', `Terminate '${selectedMachine}'? This cannot be undone.`, { variant: 'danger', confirmLabel: 'Terminate' })) return
    try {
      await terminateMachine(selectedMachine)
      toast.success('Terminated')
      loadData()
      setSelectedMachine(null)
    } catch (e) {
      toastFailure(toast, 'Failed to terminate machine', e)
    }
  }

  const handleEnable = async () => {
    if (!selectedMachine) return
    try { await enableMachine(selectedMachine); toast.success(`'${selectedMachine}' enabled at boot`); selectMachine(selectedMachine) }
    catch (e) { toastFailure(toast, 'Failed to enable machine', e) }
  }

  const handleDisable = async () => {
    if (!selectedMachine) return
    try { await disableMachine(selectedMachine); toast.success(`'${selectedMachine}' disabled at boot`); selectMachine(selectedMachine) }
    catch (e) { toastFailure(toast, 'Failed to disable machine', e) }
  }

  const handleFileTransfer = async () => {
    if (!selectedMachine || !hostPath.trim() || !machinePath.trim()) return
    try {
      if (fileMode === 'copy-to') await copyToMachine(selectedMachine, hostPath, machinePath)
      else if (fileMode === 'copy-from') await copyFromMachine(selectedMachine, machinePath, hostPath)
      else await bindMachine(selectedMachine, hostPath, machinePath, bindReadOnly)
      toast.success(fileMode === 'bind' ? 'Bind mount created' : 'File copied')
      setHostPath('')
      setMachinePath('')
    } catch (e) { toastFailure(toast, 'File transfer failed', e) }
  }

  const handleRemoveImage = async (imageName: string) => {
    if (!await confirm('Remove Image', `Remove image '${imageName}'? This cannot be undone.`, { variant: 'danger', confirmLabel: 'Remove' })) return
    try {
      await removeMachineImage(imageName)
      toast.success(`Removed '${imageName}'`)
      loadData()
    } catch (e) {
      toastFailure(toast, 'Failed to remove image', e)
    }
  }

  const handleToggleReadOnly = async (img: MachineImage) => {
    try {
      await setImageReadOnly(img.name, !img.read_only)
      toast.success(`'${img.name}' is now ${img.read_only ? 'writable' : 'read-only'}`)
      loadData()
    } catch (e) {
      toastFailure(toast, 'Failed to change read-only state', e)
    }
  }

  const handleCleanImages = async () => {
    if (!await confirm('Clean Images', 'Remove hidden/cached images not referenced by any machine?', { confirmLabel: 'Clean' })) return
    try {
      await cleanMachineImages()
      toast.success('Cleaned unused images')
      loadData()
    } catch (e) {
      toastFailure(toast, 'Failed to clean images', e)
    }
  }

  const handleImageAction = async (targetName: string) => {
    if (!imageAction) return
    try {
      if (imageAction.mode === 'clone') await cloneMachineImage(imageAction.name, targetName)
      else await renameMachineImage(imageAction.name, targetName)
      toast.success(imageAction.mode === 'clone' ? `Cloned to '${targetName}'` : `Renamed to '${targetName}'`)
      setImageAction(null)
      loadData()
    } catch (e) {
      toastFailure(toast, `Failed to ${imageAction.mode} image`, e)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--zf-ink)]"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SubsystemBanner subsystem="vm_driver" title="VM driver" />
      {loadError && (
        <ErrorBanner
          title="Could not load machines"
          headline={loadError}
          hints={hintsForError(loadError, 'vm')}
          onRetry={loadData}
        />
      )}
      <PageHeader
        title="Machines"
        description="Running machines and pulled images"
        onRefresh={loadData}
      />

      {/* Tabs */}
      <div className="border-b border-[var(--zf-hairline)] flex gap-4">
        <button onClick={() => setActiveTab('machines')} className={`px-4 py-3 border-b-2 transition ${activeTab === 'machines' ? 'border-[var(--zf-ink)] text-[var(--zf-ink)] font-medium' : 'border-transparent text-[var(--zf-muted)] hover:text-[var(--zf-ink)]'}`}>
          <Server className="w-4 h-4 inline mr-2" />Running Machines ({machines.length})
        </button>
        <button onClick={() => setActiveTab('images')} className={`px-4 py-3 border-b-2 transition ${activeTab === 'images' ? 'border-[var(--zf-ink)] text-[var(--zf-ink)] font-medium' : 'border-transparent text-[var(--zf-muted)] hover:text-[var(--zf-ink)]'}`}>
          <HardDrive className="w-4 h-4 inline mr-2" />Images ({images.length})
        </button>
      </div>

      {activeTab === 'machines' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Machine list */}
          <div className="space-y-3">
            {machines.length === 0 ? (
              <div className="text-center py-8 bg-[var(--zf-surface)] rounded-lg border border-[var(--zf-hairline)]">
                <Server className="w-12 h-12 mx-auto mb-3 text-[var(--zf-muted)]" />
                <p className="text-[var(--zf-muted)]">No running machines</p>
              </div>
            ) : machines.map(m => (
              <button key={m.name} onClick={() => selectMachine(m.name)}
                className={`w-full text-left p-4 rounded-lg border transition ${selectedMachine === m.name ? 'bg-black/[0.04] border-[var(--zf-ink)]' : 'bg-[var(--zf-surface)] border-[var(--zf-hairline)] hover:border-[var(--zf-ink)]'}`}>
                <div className="font-bold">{m.name}</div>
                <div className="text-xs text-[var(--zf-muted)]">{m.class} / {m.service}</div>
              </button>
            ))}
          </div>

          {/* Machine detail panel */}
          {selectedMachine && (
            <div className="lg:col-span-2 space-y-4">
              {/* Actions */}
              <div className="bg-[var(--zf-surface)] rounded-lg p-4 border border-[var(--zf-hairline)]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-lg">{selectedMachine}</h3>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => navigate(`/app/vms/${selectedMachine}/console`)}
                      className="zf-btn zf-btn-ghost zf-btn-sm"><Terminal className="w-3.5 h-3.5" />Terminal</button>
                    <button onClick={() => navigate(`/app/vms/${selectedMachine}/console?mode=vnc`)}
                      className="zf-btn zf-btn-ghost zf-btn-sm"><Monitor className="w-3.5 h-3.5" />VNC</button>
                    <button onClick={handleReboot}
                      className="zf-btn zf-btn-primary zf-btn-sm"><RotateCw className="w-3.5 h-3.5" />Reboot</button>
                    <button onClick={handlePoweroff}
                      className="zf-btn zf-btn-ghost zf-btn-sm"><Power className="w-3.5 h-3.5" />Poweroff</button>
                    <button onClick={handleTerminate}
                      className="zf-btn zf-btn-danger zf-btn-sm"><XCircle className="w-3.5 h-3.5" />Kill</button>
                    <button onClick={handleEnable} title="Enable at boot"
                      className="zf-btn zf-btn-ghost zf-btn-sm"><CheckCircle2 className="w-3.5 h-3.5" />Enable</button>
                    <button onClick={handleDisable} title="Disable at boot"
                      className="zf-btn zf-btn-ghost zf-btn-sm"><Ban className="w-3.5 h-3.5" />Disable</button>
                  </div>
                </div>

                {/* SSH info */}
                <div className="bg-[var(--zf-canvas)] rounded p-3 mb-3">
                  <div className="text-xs text-[var(--zf-muted)] mb-1 flex items-center gap-1"><Key className="w-3.5 h-3.5" /> SSH</div>
                  {sshInfo?.ssh_command ? (
                    <div className="flex items-center gap-2">
                      <code className="text-sm text-emerald-600 font-mono flex-1">{sshInfo.ssh_command}</code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(sshInfo.ssh_command!); toast.success('Copied') }}
                        title="Copy" className="p-1.5 hover:bg-black/[0.04] rounded transition-colors text-[var(--zf-muted)] hover:text-[var(--zf-ink)]"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--zf-muted)]">
                      No SSH address yet — this VM has no host-routable IP (NAT networking with no port
                      forward, or bridged networking still waiting on a DHCP lease).
                    </p>
                  )}
                </div>

                {/* Properties */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {['State', 'Leader', 'Class', 'Service', 'VSockCID'].map(key => (
                    machineProps[key] && (
                      <div key={key}>
                        <span className="text-[var(--zf-muted)]">{key}: </span>
                        <span className="font-mono">{machineProps[key]}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>

              {/* Shell */}
              <div className="bg-[var(--zf-surface)] rounded-lg p-4 border border-[var(--zf-hairline)]">
                <h4 className="font-medium mb-3 flex items-center gap-2"><Terminal className="w-4 h-4" /> Shell</h4>
                <div className="flex gap-2 mb-3">
                  <input value={shellCmd} onChange={e => setShellCmd(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && runShell()}
                    placeholder="Enter command..." className="flex-1 input-field font-mono text-sm" />
                  <button onClick={runShell} className="zf-btn zf-btn-primary zf-btn-sm">Run</button>
                </div>
                {shellOutput && (
                  <div className="bg-[var(--zf-canvas)] rounded p-3 font-mono text-xs max-h-64 overflow-auto">
                    {shellOutput.stdout && <pre className="text-[var(--zf-ink)] whitespace-pre-wrap">{shellOutput.stdout}</pre>}
                    {shellOutput.stderr && <pre className="text-red-600 whitespace-pre-wrap">{shellOutput.stderr}</pre>}
                    <div className="text-[var(--zf-muted)] mt-2 border-t border-[var(--zf-hairline)] pt-1">exit code: {shellOutput.exit_code}</div>
                  </div>
                )}
              </div>

              {/* File transfer */}
              <div className="bg-[var(--zf-surface)] rounded-lg p-4 border border-[var(--zf-hairline)]">
                <h4 className="font-medium mb-3 flex items-center gap-2"><FolderInput className="w-4 h-4" /> Files</h4>
                <div className="flex gap-1 mb-3 bg-[var(--zf-canvas)] rounded-lg p-1 w-fit">
                  {(['copy-to', 'copy-from', 'bind'] as const).map(m => (
                    <button key={m} onClick={() => setFileMode(m)}
                      className={`px-3 py-1.5 rounded text-xs font-medium ${fileMode === m ? 'bg-[var(--zf-ink)] text-white' : 'text-[var(--zf-muted)] hover:bg-black/[0.04]'}`}>
                      {m === 'copy-to' ? 'Copy to VM' : m === 'copy-from' ? 'Copy from VM' : 'Bind Mount'}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input value={hostPath} onChange={e => setHostPath(e.target.value)} placeholder="Host path"
                    className="input-field font-mono text-sm" />
                  <input value={machinePath} onChange={e => setMachinePath(e.target.value)} placeholder="Machine path"
                    className="input-field font-mono text-sm" />
                </div>
                {fileMode === 'bind' && (
                  <label className="flex items-center gap-2 mb-2 text-sm">
                    <input type="checkbox" checked={bindReadOnly} onChange={e => setBindReadOnly(e.target.checked)} />
                    Read-only
                  </label>
                )}
                <button onClick={handleFileTransfer} disabled={!hostPath.trim() || !machinePath.trim()}
                  className="zf-btn zf-btn-primary zf-btn-sm">
                  {fileMode === 'bind' ? 'Bind' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'images' && (
        <div className="space-y-4">
          {/* Pull image */}
          <div className="bg-[var(--zf-surface)] rounded-lg p-4 border border-[var(--zf-hairline)]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium flex items-center gap-2"><Download className="w-4 h-4" /> Pull Image</h3>
              <button onClick={handleCleanImages} className="zf-btn zf-btn-ghost zf-btn-sm">
                <Sparkles className="w-3.5 h-3.5" />
                Clean unused
              </button>
            </div>
            <div className="flex gap-2">
              <input value={pullUrl} onChange={e => setPullUrl(e.target.value)} placeholder="Image URL (https://...)"
                className="flex-1 input-field text-sm" />
              <input value={pullName} onChange={e => setPullName(e.target.value)} placeholder="Name"
                className="w-48 input-field text-sm" />
              <button onClick={handlePullImage} disabled={!pullUrl || !pullName}
                className="zf-btn zf-btn-primary zf-btn-sm">Pull</button>
            </div>
          </div>

          {/* Image list */}
          <div className="bg-[var(--zf-surface)] rounded-lg border border-[var(--zf-hairline)]">
            <table className="w-full">
              <thead className="bg-white">
                <tr>
                  <th className="text-left p-4 font-medium text-[var(--zf-ink)]">Name</th>
                  <th className="text-left p-4 font-medium text-[var(--zf-ink)]">Type</th>
                  <th className="text-left p-4 font-medium text-[var(--zf-ink)]">Size</th>
                  <th className="text-left p-4 font-medium text-[var(--zf-ink)]">Read-Only</th>
                  <th className="text-left p-4 font-medium text-[var(--zf-ink)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--zf-hairline)]">
                {images.map(img => (
                  <tr key={img.name} className="hover:bg-black/[0.03]">
                    <td className="p-4 font-medium">{img.name}</td>
                    <td className="p-4 text-[var(--zf-muted)]">{img.image_type}</td>
                    <td className="p-4 font-mono text-sm">{img.size}</td>
                    <td className="p-4">{img.read_only ? 'Yes' : 'No'}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setImageAction({ mode: 'clone', name: img.name })}
                          title="Clone" className="p-2 rounded-lg border border-[var(--zf-hairline)] text-[var(--zf-muted)] hover:text-[var(--zf-ink)] hover:bg-black/[0.04] transition"><Copy className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setImageAction({ mode: 'rename', name: img.name })}
                          title="Rename" className="p-2 rounded-lg border border-[var(--zf-hairline)] text-[var(--zf-muted)] hover:text-[var(--zf-ink)] hover:bg-black/[0.04] transition"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleToggleReadOnly(img)}
                          title={img.read_only ? 'Make writable' : 'Make read-only'}
                          className="p-2 rounded-lg border border-[var(--zf-hairline)] text-[var(--zf-muted)] hover:text-[var(--zf-ink)] hover:bg-black/[0.04] transition">
                          {img.read_only ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => handleRemoveImage(img.name)}
                          title="Remove" className="p-2 rounded-lg border border-[var(--zf-hairline)] text-[var(--zf-muted)] hover:text-red-700 hover:bg-red-50 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {images.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-[var(--zf-muted)]">No images found. Pull one above to get started.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          variant={confirmState.variant}
          onConfirm={confirmState.onConfirm}
          onCancel={cancel}
        />
      )}

      {imageAction && (
        <ImageActionModal
          mode={imageAction.mode}
          sourceName={imageAction.name}
          onClose={() => setImageAction(null)}
          onSubmit={handleImageAction}
        />
      )}
    </div>
  )
}

function ImageActionModal({ mode, sourceName, onClose, onSubmit }: {
  mode: 'clone' | 'rename'
  sourceName: string
  onClose: () => void
  onSubmit: (targetName: string) => void
}) {
  const [name, setName] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--zf-surface)] rounded-lg border border-[var(--zf-hairline)] w-full max-w-sm">
        <div className="flex items-center justify-between p-6 border-b border-[var(--zf-hairline)]">
          <h2 className="text-lg font-bold text-[var(--zf-ink)]">{mode === 'clone' ? 'Clone' : 'Rename'} '{sourceName}'</h2>
          <button onClick={onClose} className="p-2 hover:bg-black/[0.04] rounded transition text-[var(--zf-muted)] hover:text-[var(--zf-ink)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--zf-ink)] mb-2">{mode === 'clone' ? 'New Image Name' : 'New Name'}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name) onSubmit(name) }}
              className="input-field font-mono text-sm"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="zf-btn zf-btn-ghost">Cancel</button>
            <button type="button" onClick={() => onSubmit(name)} disabled={!name} className="zf-btn zf-btn-primary">
              {mode === 'clone' ? 'Clone' : 'Rename'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
