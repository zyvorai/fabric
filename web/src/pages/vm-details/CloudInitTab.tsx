// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { Cloud, Loader2 } from 'lucide-react'
import type { VM } from '../../api/vm'
import { configureCloudInit } from '../../api/cloudInit'
import ErrorBanner from '../../components/ErrorBanner'
import { formatUserError } from '../../utils/apiError'
import { toastFailure } from '../../utils/toastError'
import { useToastContext } from '../../contexts/ToastContext'
import { usePermissions } from '../../hooks/usePermissions'

// Installs GuestKit's own in-guest agent, not qemu-guest-agent -- this
// project uses GuestKit for guest/image work throughout. There's no distro
// package for it, so this curls the binary from zyvor-fabricd's own
// /vendor route (served unauthenticated, same host this dashboard is
// already talking to) instead. Only reachable if this VM's networking can
// actually route back to the host -- true for bridged VMs; NAT-mode VMs
// depend on the NAT gateway itself forwarding to the host, which this
// deployment's default slirp setup does, but isn't guaranteed for every
// networking config.
function buildDefaultUserData(): string {
  const agentUrl = `${window.location.origin}/vendor/zyvor-guest-agent`
  return `#cloud-config
users:
  - name: admin
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
write_files:
  - path: /etc/systemd/system/zyvor-guest-agent.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Zyvor VM Tools Guest Agent
      Documentation=https://zyvor.dev/guestkit
      After=network-online.target
      Wants=network-online.target
      ConditionPathExists=/dev/virtio-ports/org.qemu.guest_agent.0

      [Service]
      Type=simple
      ExecStart=/usr/local/bin/zyvor-guest-agent
      Restart=always
      RestartSec=5
      StandardOutput=journal
      StandardError=journal

      [Install]
      WantedBy=multi-user.target
runcmd:
  - curl -fsSL ${agentUrl} -o /usr/local/bin/zyvor-guest-agent
  - chmod +x /usr/local/bin/zyvor-guest-agent
  - systemctl daemon-reload
  - systemctl enable --now zyvor-guest-agent
`
}

export default function CloudInitTab({ vm }: { vm: VM }) {
  const toast = useToastContext()
  const { canWrite } = usePermissions()
  const [instanceId, setInstanceId] = useState(vm.name)
  const [hostname, setHostname] = useState(vm.name)
  const [userData, setUserData] = useState(buildDefaultUserData)
  const [networkConfig, setNetworkConfig] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canWrite) return
    setSaving(true)
    setSubmitError(null)
    try {
      await configureCloudInit(vm.name, {
        instance_id: instanceId.trim(),
        hostname: hostname.trim(),
        user_data: userData.trim() || null,
        network_config: networkConfig.trim()
          ? (JSON.parse(networkConfig) as Record<string, unknown>)
          : null,
      })
      toast.success(
        vm.state === 'running'
          ? 'Cloud-init settings saved — restart the VM to apply them'
          : 'Cloud-init settings saved — will apply on next start',
      )
    } catch (err) {
      const msg = formatUserError(err)
      setSubmitError(msg)
      toastFailure(toast, 'Failed to configure cloud-init', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      {!canWrite && (
        <p className="text-sm text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          Viewer accounts cannot configure cloud-init.
        </p>
      )}

      {submitError && (
        <ErrorBanner title="Could not configure cloud-init" headline={submitError} />
      )}

      <form onSubmit={handleSubmit} className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-[#1d1d1f]">
          <Cloud className="w-4 h-4 text-sky-400" />
          NoCloud datasource
        </div>

        <p className="text-xs text-[#6e6e73] -mt-2">
          Hostname and, from User data, any <code className="text-[#6e6e73]">ssh_authorized_keys</code>,{' '}
          <code className="text-[#6e6e73]">packages</code>, <code className="text-[#6e6e73]">runcmd</code>, and{' '}
          <code className="text-[#6e6e73]">write_files</code> are applied on this VM's next (re)start. Instance ID
          and Network config below are not currently applied to a live guest.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[#6e6e73] mb-1">Instance ID</label>
            <input
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
              disabled={!canWrite}
              className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] disabled:opacity-50"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-[#6e6e73] mb-1">Hostname</label>
            <input
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              disabled={!canWrite}
              className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] disabled:opacity-50"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-[#6e6e73] mb-1">User data (cloud-config YAML)</label>
          <textarea
            value={userData}
            onChange={(e) => setUserData(e.target.value)}
            disabled={!canWrite}
            rows={12}
            className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] font-mono disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-xs text-[#6e6e73] mb-1">Network config (JSON, optional)</label>
          <textarea
            value={networkConfig}
            onChange={(e) => setNetworkConfig(e.target.value)}
            disabled={!canWrite}
            rows={4}
            placeholder='{"version": 2, "ethernets": { ... }}'
            className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] font-mono disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={!canWrite || saving}
          className="flex items-center gap-2 px-4 py-2 bg-[#0066cc] hover:bg-[#0077ed] rounded-lg text-sm font-medium text-white disabled:opacity-50"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Generate and attach ISO
        </button>
      </form>
    </div>
  )
}
