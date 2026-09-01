// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react'
import { Cpu, MemoryStick, HardDrive, Network, Loader2, AlertCircle } from 'lucide-react'
import type { VM } from '../../api/vm'
import {
  hotplugCpu,
  hotplugMemory,
  hotplugDisk,
  hotplugNic,
  hotremoveDisk,
  hotremoveNic,
} from '../../api/hotplug'
import { useToastContext } from '../../contexts/ToastContext'
import { toastFailure } from '../../utils/toastError'
import { usePermissions } from '../../hooks/usePermissions'

export default function HotplugTab({ vm }: { vm: VM }) {
  const toast = useToastContext()
  const { canWrite } = usePermissions()
  const [cpuCount, setCpuCount] = useState(vm.cpus + 1)
  const [memMb, setMemMb] = useState(512)
  const [diskPath, setDiskPath] = useState('')
  const [nicBridge, setNicBridge] = useState('br0')
  const [diskDeviceId, setDiskDeviceId] = useState('')
  const [nicDeviceId, setNicDeviceId] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const running = vm.state === 'running'

  const run = async (key: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(key)
    try {
      await fn()
      toast.success(success)
    } catch (e) {
      toastFailure(toast, 'Hotplug failed', e)
    } finally {
      setBusy(null)
    }
  }

  if (!running) {
    return (
      <div className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] p-8 text-center">
        <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
        <p className="text-[#1d1d1f] font-medium mb-1">VM must be running</p>
        <p className="text-[#6e6e73] text-sm">Start the VM to hotplug CPU, memory, disks, or NICs.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {!canWrite && (
        <p className="text-sm text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          Viewer accounts cannot change live resources.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section icon={Cpu} title="CPU">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs text-[#6e6e73] mb-1">Target vCPU count</label>
              <input
                type="number"
                min={1}
                max={256}
                value={cpuCount}
                onChange={(e) => setCpuCount(parseInt(e.target.value) || 1)}
                disabled={!canWrite}
                className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] disabled:opacity-50"
              />
            </div>
            <ActionButton
              disabled={!canWrite || busy !== null}
              loading={busy === 'cpu'}
              onClick={() => run('cpu', () => hotplugCpu(vm.name, { count: cpuCount }), `CPU count set to ${cpuCount}`)}
              label="Apply"
            />
          </div>
        </Section>

        <Section icon={MemoryStick} title="Memory">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs text-[#6e6e73] mb-1">Add memory (MB)</label>
              <input
                type="number"
                min={128}
                step={128}
                value={memMb}
                onChange={(e) => setMemMb(parseInt(e.target.value) || 128)}
                disabled={!canWrite}
                className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] disabled:opacity-50"
              />
            </div>
            <ActionButton
              disabled={!canWrite || busy !== null}
              loading={busy === 'mem'}
              onClick={() => run('mem', () => hotplugMemory(vm.name, { size_mb: memMb }), `Added ${memMb} MB memory`)}
              label="Add"
            />
          </div>
        </Section>

        <Section icon={HardDrive} title="Disk">
          <div className="space-y-2">
            <input
              type="text"
              placeholder="/path/to/disk.qcow2"
              value={diskPath}
              onChange={(e) => setDiskPath(e.target.value)}
              disabled={!canWrite}
              className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] font-mono disabled:opacity-50"
            />
            <ActionButton
              disabled={!canWrite || busy !== null || !diskPath.trim()}
              loading={busy === 'disk'}
              onClick={() => run('disk', () => hotplugDisk(vm.name, { path: diskPath.trim() }), 'Disk attached')}
              label="Attach disk"
            />
            <div className="flex gap-2 items-end pt-1">
              <input
                type="text"
                placeholder="Device ID to remove"
                value={diskDeviceId}
                onChange={(e) => setDiskDeviceId(e.target.value)}
                disabled={!canWrite}
                className="flex-1 bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] font-mono disabled:opacity-50"
              />
              <ActionButton
                disabled={!canWrite || busy !== null || !diskDeviceId.trim()}
                loading={busy === 'disk-rm'}
                onClick={() => run('disk-rm', () => hotremoveDisk(vm.name, diskDeviceId.trim()), 'Disk removed')}
                label="Remove"
                variant="danger"
              />
            </div>
          </div>
        </Section>

        <Section icon={Network} title="Network">
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Bridge name (e.g. br0)"
              value={nicBridge}
              onChange={(e) => setNicBridge(e.target.value)}
              disabled={!canWrite}
              className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] disabled:opacity-50"
            />
            <ActionButton
              disabled={!canWrite || busy !== null || !nicBridge.trim()}
              loading={busy === 'nic'}
              onClick={() => run('nic', () => hotplugNic(vm.name, { bridge: nicBridge.trim() }), 'NIC attached')}
              label="Attach NIC"
            />
            <div className="flex gap-2 items-end pt-1">
              <input
                type="text"
                placeholder="NIC device ID to remove"
                value={nicDeviceId}
                onChange={(e) => setNicDeviceId(e.target.value)}
                disabled={!canWrite}
                className="flex-1 bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] font-mono disabled:opacity-50"
              />
              <ActionButton
                disabled={!canWrite || busy !== null || !nicDeviceId.trim()}
                loading={busy === 'nic-rm'}
                onClick={() => run('nic-rm', () => hotremoveNic(vm.name, nicDeviceId.trim()), 'NIC removed')}
                label="Remove"
                variant="danger"
              />
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, children }: { icon: typeof Cpu; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] p-5">
      <h3 className="flex items-center gap-2 text-sm font-medium text-[#1d1d1f] mb-4">
        <Icon className="w-4 h-4 text-[#0066cc]" />
        {title}
      </h3>
      {children}
    </div>
  )
}

function ActionButton({
  onClick,
  label,
  disabled,
  loading,
  variant = 'primary',
}: {
  onClick: () => void
  label: string
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'danger'
}) {
  const cls =
    variant === 'danger'
      ? 'bg-red-600/80 hover:bg-red-600 text-white'
      : 'bg-[#0066cc] hover:bg-[#0077ed] text-white'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5 ${cls}`}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {label}
    </button>
  )
}
