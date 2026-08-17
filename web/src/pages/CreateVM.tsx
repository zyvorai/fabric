// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { createVM } from '../api/vm'
import type { PortForwardSpec } from '../api/vm'
import { apiGet } from '../api/client'
import { applyCreateAdvancedOptions } from '../utils/applyCreateAdvancedOptions'
import { ArrowLeft, ArrowRight, Cpu, HardDrive, ChevronDown, ChevronUp, Shield, Monitor, Plus, X, Network } from 'lucide-react'
import WizardStepper from '../components/WizardStepper'
import ErrorBanner from '../components/ErrorBanner'
import { PageHeader } from '../components/ui/PageHeader'
import { formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

interface AdvancedOptions {
  firmware: 'bios' | 'uefi'
  secureBoot: boolean
  cpuMode: 'host-passthrough' | 'host-model' | 'custom'
  machineType: string
  displayType: 'vnc' | 'spice'
  bootOrder: string[]
  enableBalloon: boolean
}

const defaultAdvanced: AdvancedOptions = {
  firmware: 'uefi',
  secureBoot: false,
  cpuMode: 'host-passthrough',
  machineType: 'q35',
  displayType: 'vnc',
  bootOrder: ['hd', 'cdrom', 'network'],
  enableBalloon: true,
}

const WIZARD_STEPS = ['Basics', 'Resources', 'Review'] as const
const VM_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/

export default function CreateVM() {
  const navigate = useNavigate()
  const toast = useToastContext()
  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [cpus, setCpus] = useState(2)
  const [memory, setMemory] = useState(2048)
  const [diskGb, setDiskGb] = useState(20)
  const [imageOptions, setImageOptions] = useState<{ name: string; path: string }[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [imagesError, setImagesError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [advanced, setAdvanced] = useState<AdvancedOptions>(defaultAdvanced)
  const [wizardStep, setWizardStep] = useState(0)
  const [imagesReload, setImagesReload] = useState(0)
  const [networkMode, setNetworkMode] = useState<'nat' | 'bridged'>('nat')
  const [staticIp, setStaticIp] = useState(false)
  const [portForwards, setPortForwards] = useState<{ hostPort: string; guestPort: string; protocol: 'tcp' | 'udp' }[]>([])

  const addPortForwardRow = (guestPort = '', hostPort = '') => {
    setPortForwards((rows) => [...rows, { hostPort, guestPort, protocol: 'tcp' }])
  }
  const updatePortForwardRow = (index: number, patch: Partial<{ hostPort: string; guestPort: string; protocol: 'tcp' | 'udp' }>) => {
    setPortForwards((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }
  const removePortForwardRow = (index: number) => {
    setPortForwards((rows) => rows.filter((_, i) => i !== index))
  }

  useEffect(() => {
    if (wizardStep !== 0) return
    void imagesReload
    let cancelled = false
    setImagesLoading(true)
    setImagesError(null)
    apiGet<{ name: string; path: string }[]>('/api/images')
      .then((data) => {
        if (cancelled) return
        setImageOptions((Array.isArray(data) ? data : []).filter((i) => i.path))
      })
      .catch((err) => {
        if (!cancelled) {
          setImageOptions([])
          const msg = formatUserError(err)
          setImagesError(msg)
          toastFailure(toast, 'Could not load disk images', err)
        }
      })
      .finally(() => {
        if (!cancelled) setImagesLoading(false)
      })
    return () => { cancelled = true }
  }, [wizardStep, imagesReload, toast])

  const memoryPresets = [
    { label: '512 MB', value: 512 },
    { label: '1 GB', value: 1024 },
    { label: '2 GB', value: 2048 },
    { label: '4 GB', value: 4096 },
    { label: '8 GB', value: 8192 },
    { label: '16 GB', value: 16384 },
  ]

  const validateStep = (step: number): string | null => {
    if (step === 0) {
      if (!name.trim()) return 'VM name is required'
      if (!VM_NAME_REGEX.test(name)) {
        return 'VM name must start with a letter or number, use only letters, numbers, dots, hyphens, underscores, and be 1–64 characters'
      }
      if (!image.trim()) return 'Image path is required'
    }
    if (step === 1) {
      if (cpus < 1 || cpus > 32) return 'vCPUs must be between 1 and 32'
      if (memory < 256) return 'Memory must be at least 256 MB'
      const hostPorts = new Set<string>()
      for (const row of networkMode === 'nat' ? portForwards : []) {
        const h = parseInt(row.hostPort)
        const g = parseInt(row.guestPort)
        if (!row.hostPort || !Number.isInteger(h) || h < 1 || h > 65535) {
          return 'Each port forward needs a host port between 1 and 65535'
        }
        if (!row.guestPort || !Number.isInteger(g) || g < 1 || g > 65535) {
          return 'Each port forward needs a guest port between 1 and 65535'
        }
        if (hostPorts.has(row.hostPort)) {
          return `Host port ${row.hostPort} is used by more than one port forward`
        }
        hostPorts.add(row.hostPort)
      }
    }
    return null
  }

  const goNext = () => {
    const msg = validateStep(wizardStep)
    if (msg) {
      setValidationError(msg)
      return
    }
    setValidationError('')
    setWizardStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1))
  }

  const goBack = () => {
    setValidationError('')
    setWizardStep((s) => Math.max(s - 1, 0))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const msg = validateStep(0) || validateStep(1)
    if (msg) {
      setValidationError(msg)
      return
    }

    setLoading(true)
    setValidationError('')
    setSubmitError(null)

    try {
      const port_forwards: PortForwardSpec[] = networkMode === 'nat'
        ? portForwards.map((row) => ({
            host_port: parseInt(row.hostPort),
            guest_port: parseInt(row.guestPort),
            protocol: row.protocol,
          }))
        : []
      await createVM({
        name, image, cpus, memory, disk: diskGb,
        network_tap: networkMode === 'bridged',
        network_static_ip: networkMode === 'bridged' && staticIp,
        ...(port_forwards.length ? { port_forwards } : {}),
      })
      if (showAdvanced) {
        try {
          await applyCreateAdvancedOptions(name, advanced)
        } catch (advErr) {
          toastFailure(toast, 'VM created but advanced options could not be applied', advErr)
          navigate(`/vms/${name}`)
          return
        }
      }
      toast.success(`VM '${name}' created`)
      navigate(`/vms/${name}`)
    } catch (err) {
      const msg = formatUserError(err)
      setSubmitError(msg)
      toastFailure(toast, 'Failed to create VM', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={() => navigate('/vms')}
        className="flex items-center gap-2 mb-6 text-slate-500 hover:text-slate-300 transition-colors text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to VMs
      </button>

      <div className="max-w-2xl">
        <PageHeader
          title="Create Virtual Machine"
          description="Configure and launch a new VM"
        />

        <WizardStepper
          steps={WIZARD_STEPS}
          current={wizardStep}
          onStep={(step) => {
            if (step < wizardStep) {
              setWizardStep(step)
              setValidationError('')
            }
          }}
        />

        {imagesError && wizardStep === 0 && (
          <ErrorBanner
            title="Could not load disk images"
            headline={imagesError}
            hints={hintsForError(imagesError, 'storage')}
            onRetry={() => setImagesReload((n) => n + 1)}
          />
        )}

        {submitError && (
          <ErrorBanner
            title="Could not create virtual machine"
            headline={submitError}
            hints={hintsForError(submitError, 'vm')}
          />
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {validationError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {validationError}
            </div>
          )}

          {wizardStep === 0 && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 space-y-5">
              <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Basic Configuration</h2>

              <div>
                <label htmlFor="vm-name" className="block text-sm font-medium text-slate-300 mb-1.5">
                  VM Name
                </label>
                <input
                  id="vm-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-virtual-machine"
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors text-sm"
                  required
                  autoFocus
                />
              </div>

            <div>
              <label htmlFor="vm-image" className="block text-sm font-medium text-slate-300 mb-1.5">
                Disk image
              </label>
              {imageOptions.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    const opt = imageOptions.find((o) => o.path === e.target.value)
                    if (opt) setImage(opt.path)
                  }}
                  className="w-full mb-2 px-3.5 py-2.5 bg-slate-800 border border-slate-700/50 rounded-lg text-slate-300 text-sm"
                >
                  <option value="">{imagesLoading ? 'Loading images…' : 'Pick from catalog…'}</option>
                  {imageOptions.map((opt) => (
                    <option key={opt.path} value={opt.path}>
                      {opt.name} — {opt.path}
                    </option>
                  ))}
                </select>
              )}
              <input
                id="vm-image"
                type="text"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="/var/lib/zyvor-fabricd/images/ubuntu-24.04.qcow2"
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors text-sm font-mono"
                required
              />
              <p className="text-xs text-slate-500 mt-1">Choose from the catalog or enter a path on the host.</p>
            </div>
            </div>
          )}

          {wizardStep === 1 && (
            <>
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 space-y-5">
                <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Resources</h2>

                <div>
                  <label htmlFor="vm-cpus" className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                    <Cpu className="w-4 h-4 text-slate-500" />
                    vCPUs
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="vm-cpus"
                      type="range"
                      min={1}
                      max={32}
                      value={cpus}
                      onChange={(e) => setCpus(parseInt(e.target.value))}
                      className="flex-1 accent-blue-500"
                    />
                    <div className="w-16 text-center">
                      <input
                        type="number"
                        value={cpus}
                        onChange={(e) => setCpus(Math.max(1, Math.min(32, parseInt(e.target.value) || 1)))}
                        min={1}
                        max={32}
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700/50 rounded-md text-center text-sm text-white focus:outline-none focus:border-blue-500/50"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                    <HardDrive className="w-4 h-4 text-slate-500" />
                    Memory
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
                    {memoryPresets.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setMemory(preset.value)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          memory === preset.value
                            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                            : 'bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="vm-memory"
                      type="number"
                      value={memory}
                      onChange={(e) => setMemory(parseInt(e.target.value) || 512)}
                      min={256}
                      step={256}
                      className="w-28 px-3 py-1.5 bg-slate-800 border border-slate-700/50 rounded-md text-sm text-white focus:outline-none focus:border-blue-500/50"
                    />
                    <span className="text-sm text-slate-500">MB</span>
                    <span className="text-sm text-slate-600 ml-2">
                      ({(memory / 1024).toFixed(1)} GB)
                    </span>
                  </div>
                </div>
              </div>

              <div>
              <label htmlFor="vm-disk" className="block text-sm font-medium text-slate-300 mb-1.5">
                Root disk (GB)
              </label>
              <input
                id="vm-disk"
                type="number"
                min={1}
                max={2048}
                value={diskGb}
                onChange={(e) => setDiskGb(Math.max(1, parseInt(e.target.value) || 20))}
                className="w-28 px-3 py-1.5 bg-slate-800 border border-slate-700/50 rounded-md text-sm text-white"
              />
            </div>

              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-6 py-4 text-sm font-medium text-slate-400 hover:text-slate-300 transition-colors"
            >
              <span className="uppercase tracking-wider">Advanced Options</span>
                  {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

            {showAdvanced && (
              <div className="px-6 pb-6 space-y-5 border-t border-slate-700/50 pt-5">
                <p className="text-xs text-slate-500 bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2">
                  Applied after the VM is created (boot, display, CPU mode, and UEFI settings).
                </p>
                <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                        <Shield className="w-4 h-4 text-slate-500" />
                        Firmware
                      </label>
                      <div className="flex gap-2">
                        {(['bios', 'uefi'] as const).map((fw) => (
                          <button
                            key={fw}
                            type="button"
                            onClick={() =>
                              setAdvanced({
                                ...advanced,
                                firmware: fw,
                                secureBoot: fw === 'bios' ? false : advanced.secureBoot,
                              })
                            }
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                              advanced.firmware === fw
                                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                : 'bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-slate-300'
                            }`}
                          >
                            {fw.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                        <Monitor className="w-4 h-4 text-slate-500" />
                        Display Protocol
                      </label>
                      <div className="flex gap-2">
                        {(['vnc', 'spice'] as const).map((dt) => (
                          <button
                            key={dt}
                            type="button"
                            onClick={() => setAdvanced({ ...advanced, displayType: dt })}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                              advanced.displayType === dt
                                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                : 'bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-slate-300'
                            }`}
                          >
                            {dt.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                        <Network className="w-4 h-4 text-slate-500" />
                        Networking
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setNetworkMode('nat')}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            networkMode === 'nat'
                              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                              : 'bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-slate-300'
                          }`}
                        >
                          NAT (default)
                        </button>
                        <button
                          type="button"
                          onClick={() => setNetworkMode('bridged')}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            networkMode === 'bridged'
                              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                              : 'bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-slate-300'
                          }`}
                        >
                          Bridged (DHCP)
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        {networkMode === 'nat'
                          ? 'No host-routable IP — reach anything inside this VM (like SSH) by forwarding a port below.'
                          : 'This VM gets its own real IP (visible on its Network tab once booted) — no port forwards needed.'}
                      </p>
                      {networkMode === 'bridged' && (
                        <label className="flex items-center gap-2 mt-3 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            checked={staticIp}
                            onChange={(e) => setStaticIp(e.target.checked)}
                            className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/50"
                          />
                          Assign the IP statically via cloud-init
                        </label>
                      )}
                      <p className="text-xs text-slate-500 mt-1">
                        {networkMode === 'bridged' && staticIp
                          ? 'The address is configured directly at boot — no dependency on the guest running a working DHCP client, but the image must support cloud-init.'
                          : networkMode === 'bridged'
                            ? "The guest's own DHCP client requests the address — works without cloud-init, but only if the image actually runs one automatically on boot."
                            : ''}
                      </p>
                    </div>

                    {networkMode === 'nat' && (
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                        <Network className="w-4 h-4 text-slate-500" />
                        Expose ports (host port → guest port)
                      </label>
                      <p className="text-xs text-slate-500 mb-2">
                        This VM uses NAT networking with no host-routable IP — a port must be forwarded here to
                        reach anything inside it (like SSH) from outside the host.
                      </p>
                      {portForwards.length === 0 && (
                        <button
                          type="button"
                          onClick={() => addPortForwardRow('22')}
                          className="mb-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700/50 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
                        >
                          + Expose SSH (22)
                        </button>
                      )}
                      <div className="space-y-2">
                        {portForwards.map((row, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="number"
                              value={row.hostPort}
                              onChange={(e) => updatePortForwardRow(i, { hostPort: e.target.value })}
                              placeholder="Host port"
                              min={1}
                              max={65535}
                              className="w-28 px-2.5 py-1.5 bg-slate-800 border border-slate-700/50 rounded-md text-sm text-white focus:outline-none focus:border-blue-500/50"
                            />
                            <span className="text-slate-500 text-sm">→</span>
                            <input
                              type="number"
                              value={row.guestPort}
                              onChange={(e) => updatePortForwardRow(i, { guestPort: e.target.value })}
                              placeholder="Guest port"
                              min={1}
                              max={65535}
                              className="w-28 px-2.5 py-1.5 bg-slate-800 border border-slate-700/50 rounded-md text-sm text-white focus:outline-none focus:border-blue-500/50"
                            />
                            <select
                              value={row.protocol}
                              onChange={(e) => updatePortForwardRow(i, { protocol: e.target.value as 'tcp' | 'udp' })}
                              className="px-2 py-1.5 bg-slate-800 border border-slate-700/50 rounded-md text-sm text-slate-300"
                            >
                              <option value="tcp">TCP</option>
                              <option value="udp">UDP</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => removePortForwardRow(i)}
                              className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                              title="Remove"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => addPortForwardRow()}
                        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700/50 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add port forward
                      </button>
                    </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {wizardStep === 2 && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 space-y-4">
              <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Review</h2>
              <dl className="grid grid-cols-1 gap-3 text-sm">
                <div className="flex justify-between gap-4 border-b border-slate-700/40 pb-2">
                  <dt className="text-slate-500">Name</dt>
                  <dd className="text-white font-medium">{name}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-700/40 pb-2">
                  <dt className="text-slate-500">Image</dt>
                  <dd className="text-slate-300 font-mono text-xs text-right break-all">{image}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-700/40 pb-2">
                  <dt className="text-slate-500">vCPUs</dt>
                  <dd className="text-white">{cpus}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-700/40 pb-2">
                  <dt className="text-slate-500">Memory</dt>
                  <dd className="text-white">
                    {memory} MB ({(memory / 1024).toFixed(1)} GB)
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-700/40 pb-2">
                  <dt className="text-slate-500">Root disk</dt>
                  <dd className="text-white">{diskGb} GB</dd>
                </div>
                <div className={`flex justify-between gap-4 ${networkMode === 'nat' && portForwards.length ? 'border-b border-slate-700/40 pb-2' : ''}`}>
                  <dt className="text-slate-500">Networking</dt>
                  <dd className="text-white">
                    {networkMode === 'nat' ? 'NAT' : staticIp ? 'Bridged (static IP)' : 'Bridged (DHCP)'}
                  </dd>
                </div>
                {networkMode === 'nat' && portForwards.length > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Exposed ports</dt>
                    <dd className="text-white text-right">
                      {portForwards.map((row, i) => (
                        <div key={i} className="font-mono text-xs">
                          {row.hostPort} → {row.guestPort}/{row.protocol}
                        </div>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {wizardStep > 0 && (
              <button
                type="button"
                onClick={goBack}
                className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700/50 hover:border-slate-600 rounded-xl font-medium text-sm text-slate-300 transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
            {wizardStep < WIZARD_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading || !name || !image}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:shadow-none"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Virtual Machine'
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
