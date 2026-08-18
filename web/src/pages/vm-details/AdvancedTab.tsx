// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Save, Plus, ShieldCheck } from 'lucide-react'
import type { VM } from '../../api/vm'
import {
  getBootConfig,
  updateBootConfig,
  getDisplay,
  updateDisplay,
  getCPUConfig,
  updateCPUConfig,
  listCPUModels,
  getWatchdog,
  setWatchdog,
  listSerials,
  addSerial,
  type BootConfig,
  type DisplayConfig,
  type CPUModelConfig,
  type CPUModel,
  type WatchdogConfig,
  type SerialConfig,
} from '../../api/devices'
import {
  getFirmwareStatus,
  enableUefi,
  enableSecureBoot,
  disableSecureBoot,
  resetNvram,
  type FirmwareStatus,
} from '../../api/firmware'
import ErrorBanner from '../../components/ErrorBanner'
import { formatUserError } from '../../utils/apiError'
import { toastFailure } from '../../utils/toastError'
import { useToastContext } from '../../contexts/ToastContext'
import { usePermissions } from '../../hooks/usePermissions'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-700/50">
        <h3 className="text-sm font-medium text-slate-300">{title}</h3>
      </div>
      <div className="p-5 space-y-3">{children}</div>
    </div>
  )
}

const inputCls = 'w-full bg-slate-900 border border-slate-700/50 rounded px-3 py-1.5 text-sm'
const labelCls = 'block text-xs font-medium text-slate-400 mb-1'

export default function AdvancedTab({ vm }: { vm: VM }) {
  const toast = useToastContext()
  const { canWrite } = usePermissions()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [boot, setBoot] = useState<BootConfig | null>(null)
  const [display, setDisplay] = useState<DisplayConfig | null>(null)
  const [cpuConfig, setCpuConfig] = useState<CPUModelConfig | null>(null)
  const [cpuModels, setCpuModels] = useState<CPUModel[]>([])
  const [watchdog, setWatchdogState] = useState<WatchdogConfig | null>(null)
  const [serials, setSerialsState] = useState<SerialConfig[]>([])
  const [firmware, setFirmware] = useState<FirmwareStatus | null>(null)

  const [savingBoot, setSavingBoot] = useState(false)
  const [savingDisplay, setSavingDisplay] = useState(false)
  const [savingCpu, setSavingCpu] = useState(false)
  const [savingWatchdog, setSavingWatchdog] = useState(false)
  const [addingSerial, setAddingSerial] = useState(false)
  const [newSerialType, setNewSerialType] = useState<SerialConfig['type']>('pty')
  const [firmwareBusy, setFirmwareBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [b, d, c, models, w, s, f] = await Promise.all([
        getBootConfig(vm.name),
        getDisplay(vm.name),
        getCPUConfig(vm.name),
        listCPUModels().catch(() => []),
        getWatchdog(vm.name).catch(() => null),
        listSerials(vm.name).catch(() => []),
        getFirmwareStatus(vm.name).catch(() => null),
      ])
      setBoot(b)
      setDisplay(d)
      setCpuConfig(c)
      setCpuModels(models)
      setWatchdogState(w)
      setSerialsState(s)
      setFirmware(f)
    } catch (e) {
      setLoadError(formatUserError(e))
    } finally {
      setLoading(false)
    }
  }, [vm.name])

  useEffect(() => {
    void load()
  }, [load])

  const saveBoot = async () => {
    if (!boot) return
    setSavingBoot(true)
    try {
      await updateBootConfig(vm.name, boot)
      toast.success('Boot configuration saved')
    } catch (e) {
      toastFailure(toast, 'Failed to save boot configuration', e)
    } finally {
      setSavingBoot(false)
    }
  }

  const saveDisplay = async () => {
    if (!display) return
    setSavingDisplay(true)
    try {
      await updateDisplay(vm.name, display)
      toast.success('Display configuration saved')
    } catch (e) {
      toastFailure(toast, 'Failed to save display configuration', e)
    } finally {
      setSavingDisplay(false)
    }
  }

  const saveCpu = async () => {
    if (!cpuConfig) return
    setSavingCpu(true)
    try {
      await updateCPUConfig(vm.name, cpuConfig)
      toast.success('CPU configuration saved')
    } catch (e) {
      toastFailure(toast, 'Failed to save CPU configuration', e)
    } finally {
      setSavingCpu(false)
    }
  }

  const saveWatchdog = async (model: WatchdogConfig['model'], action: WatchdogConfig['action']) => {
    setSavingWatchdog(true)
    try {
      await setWatchdog(vm.name, { model, action })
      setWatchdogState({ model, action })
      toast.success('Watchdog configured')
    } catch (e) {
      toastFailure(toast, 'Failed to configure watchdog', e)
    } finally {
      setSavingWatchdog(false)
    }
  }

  const submitSerial = async () => {
    setAddingSerial(true)
    try {
      await addSerial(vm.name, { type: newSerialType })
      toast.success('Serial console added')
      const s = await listSerials(vm.name)
      setSerialsState(s)
    } catch (e) {
      toastFailure(toast, 'Failed to add serial console', e)
    } finally {
      setAddingSerial(false)
    }
  }

  const refreshFirmware = async () => {
    setFirmware(await getFirmwareStatus(vm.name).catch(() => null))
  }

  const handleEnableUefi = async () => {
    setFirmwareBusy(true)
    try {
      await enableUefi(vm.name, { secure_boot: false })
      toast.success('UEFI enabled')
      await refreshFirmware()
    } catch (e) {
      toastFailure(toast, 'Failed to enable UEFI', e)
    } finally {
      setFirmwareBusy(false)
    }
  }

  const handleToggleSecureBoot = async () => {
    setFirmwareBusy(true)
    try {
      if (firmware?.secure_boot_enabled) {
        await disableSecureBoot(vm.name)
        toast.success('Secure Boot disabled')
      } else {
        await enableSecureBoot(vm.name)
        toast.success('Secure Boot enabled')
      }
      await refreshFirmware()
    } catch (e) {
      toastFailure(toast, 'Failed to change Secure Boot', e)
    } finally {
      setFirmwareBusy(false)
    }
  }

  const handleResetNvram = async () => {
    setFirmwareBusy(true)
    try {
      await resetNvram(vm.name)
      toast.success('NVRAM reset to defaults')
      await refreshFirmware()
    } catch (e) {
      toastFailure(toast, 'Failed to reset NVRAM', e)
    } finally {
      setFirmwareBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
        <Loader2 className="w-6 h-6 text-slate-500 mx-auto mb-2 animate-spin" />
        <p className="text-slate-500 text-sm">Loading advanced configuration...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-slate-300 text-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {loadError && (
        <ErrorBanner title="Could not load advanced configuration" headline={loadError} onRetry={() => void load()} />
      )}

      {!canWrite && (
        <p className="text-sm text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          Viewer accounts cannot change advanced configuration.
        </p>
      )}

      <Section title="Firmware">
        {firmware ? (
          <>
            <p className="text-sm text-slate-300">
              <span className="font-mono">{firmware.firmware_type}</span>
              {firmware.tpm_enabled && <span className="text-slate-400"> · TPM {firmware.tpm_version}</span>}
            </p>
            <p className="text-sm">
              Secure Boot: <span className={firmware.secure_boot_enabled ? 'text-green-400' : 'text-slate-500'}>{firmware.secure_boot_enabled ? 'Enabled' : 'Disabled'}</span>
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-500">UEFI is not enabled for this VM (currently BIOS boot).</p>
        )}
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {!firmware && (
              <button onClick={() => void handleEnableUefi()} disabled={firmwareBusy} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm disabled:opacity-50">
                <ShieldCheck className="w-3.5 h-3.5" />{firmwareBusy ? 'Working…' : 'Enable UEFI'}
              </button>
            )}
            {firmware && (
              <>
                <button onClick={() => void handleToggleSecureBoot()} disabled={firmwareBusy} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm disabled:opacity-50">
                  <ShieldCheck className="w-3.5 h-3.5" />{firmwareBusy ? 'Working…' : firmware.secure_boot_enabled ? 'Disable Secure Boot' : 'Enable Secure Boot'}
                </button>
                <button onClick={() => void handleResetNvram()} disabled={firmwareBusy} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-600 rounded-lg text-sm disabled:opacity-50">
                  {firmwareBusy ? 'Working…' : 'Reset NVRAM'}
                </button>
              </>
            )}
          </div>
        )}
      </Section>

      {boot && (
        <Section title="Boot">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Firmware</label>
              <select
                disabled={!canWrite}
                value={boot.firmware}
                onChange={(e) => setBoot({ ...boot, firmware: e.target.value as BootConfig['firmware'] })}
                className={inputCls}
              >
                <option value="bios">BIOS</option>
                <option value="uefi">UEFI</option>
              </select>
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={!canWrite || boot.firmware !== 'uefi'}
                  checked={boot.secure_boot}
                  onChange={(e) => setBoot({ ...boot, secure_boot: e.target.checked })}
                />
                Secure Boot (UEFI only)
              </label>
            </div>
          </div>
          <div>
            <label className={labelCls}>Boot order (comma-separated)</label>
            <input
              disabled={!canWrite}
              className={inputCls}
              value={boot.boot_order.join(',')}
              onChange={(e) => setBoot({ ...boot, boot_order: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder="hd,cdrom,network"
            />
          </div>
          {canWrite && (
            <button onClick={() => void saveBoot()} disabled={savingBoot} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm disabled:opacity-50">
              <Save className="w-3.5 h-3.5" />{savingBoot ? 'Saving…' : 'Save Boot Config'}
            </button>
          )}
        </Section>
      )}

      {display && (
        <Section title="Display">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Protocol</label>
              <select
                disabled={!canWrite}
                value={display.type}
                onChange={(e) => setDisplay({ ...display, type: e.target.value as DisplayConfig['type'] })}
                className={inputCls}
              >
                <option value="vnc">VNC</option>
                <option value="spice">SPICE</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Keymap</label>
              <input disabled={!canWrite} className={inputCls} value={display.keymap ?? ''} onChange={(e) => setDisplay({ ...display, keymap: e.target.value || undefined })} placeholder="en-us" />
            </div>
          </div>
          {canWrite && (
            <button onClick={() => void saveDisplay()} disabled={savingDisplay} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm disabled:opacity-50">
              <Save className="w-3.5 h-3.5" />{savingDisplay ? 'Saving…' : 'Save Display Config'}
            </button>
          )}
        </Section>
      )}

      {cpuConfig && (
        <Section title="CPU Model">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Mode</label>
              <select
                disabled={!canWrite}
                value={cpuConfig.mode}
                onChange={(e) => setCpuConfig({ ...cpuConfig, mode: e.target.value as CPUModelConfig['mode'] })}
                className={inputCls}
              >
                <option value="host-model">Host model</option>
                <option value="host-passthrough">Host passthrough</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            {cpuConfig.mode === 'custom' && (
              <div>
                <label className={labelCls}>Model</label>
                <select
                  disabled={!canWrite}
                  value={cpuConfig.model}
                  onChange={(e) => setCpuConfig({ ...cpuConfig, model: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Select a model</option>
                  {cpuModels.map((m) => (
                    <option key={m.name} value={m.name}>{m.name} ({m.vendor})</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {cpuModels.length === 0 && cpuConfig.mode === 'custom' && (
            <p className="text-xs text-slate-500">No host CPU model list available — enter a model name via Custom mode only if you know it's supported by qemu on this host.</p>
          )}
          {canWrite && (
            <button onClick={() => void saveCpu()} disabled={savingCpu} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm disabled:opacity-50">
              <Save className="w-3.5 h-3.5" />{savingCpu ? 'Saving…' : 'Save CPU Config'}
            </button>
          )}
        </Section>
      )}

      <Section title="Watchdog">
        {watchdog ? (
          <p className="text-sm text-slate-300">
            <span className="font-mono">{watchdog.model}</span> — on hang: <span className="font-mono">{watchdog.action}</span>
          </p>
        ) : (
          <p className="text-sm text-slate-500">No watchdog configured.</p>
        )}
        {canWrite && (
          <div className="grid grid-cols-2 gap-3">
            <select
              disabled={savingWatchdog}
              defaultValue={watchdog?.model ?? 'i6300esb'}
              id="watchdog-model"
              className={inputCls}
            >
              <option value="i6300esb">i6300esb</option>
              <option value="ib700">ib700</option>
            </select>
            <select
              disabled={savingWatchdog}
              defaultValue={watchdog?.action ?? 'reset'}
              id="watchdog-action"
              className={inputCls}
            >
              <option value="reset">Reset</option>
              <option value="shutdown">Shutdown</option>
              <option value="poweroff">Poweroff</option>
              <option value="pause">Pause</option>
              <option value="none">None</option>
            </select>
          </div>
        )}
        {canWrite && (
          <button
            disabled={savingWatchdog}
            onClick={() => {
              const model = (document.getElementById('watchdog-model') as HTMLSelectElement).value as WatchdogConfig['model']
              const action = (document.getElementById('watchdog-action') as HTMLSelectElement).value as WatchdogConfig['action']
              void saveWatchdog(model, action)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />{savingWatchdog ? 'Saving…' : 'Set Watchdog'}
          </button>
        )}
      </Section>

      <Section title="Serial Consoles">
        {serials.length === 0 ? (
          <p className="text-sm text-slate-500">No serial consoles configured.</p>
        ) : (
          <div className="space-y-1.5">
            {serials.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm bg-slate-900/60 border border-slate-700/50 rounded px-3 py-1.5">
                <span className="font-mono">{s.type}</span>
                {s.path && <span className="text-slate-500 font-mono">{s.path}</span>}
                {s.source_host && <span className="text-slate-500 font-mono">{s.source_host}:{s.source_port}</span>}
              </div>
            ))}
          </div>
        )}
        {canWrite && (
          <div className="flex items-end gap-2">
            <div>
              <label className={labelCls}>Type</label>
              <select value={newSerialType} onChange={(e) => setNewSerialType(e.target.value as SerialConfig['type'])} className={inputCls}>
                <option value="pty">pty</option>
                <option value="unix">unix</option>
                <option value="tcp">tcp</option>
              </select>
            </div>
            <button onClick={() => void submitSerial()} disabled={addingSerial} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm disabled:opacity-50">
              <Plus className="w-3.5 h-3.5" />{addingSerial ? 'Adding…' : 'Add Serial'}
            </button>
          </div>
        )}
      </Section>
    </div>
  )
}
