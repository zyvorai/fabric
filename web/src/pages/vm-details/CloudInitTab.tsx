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

const DEFAULT_USER_DATA = `#cloud-config
users:
  - name: admin
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
packages:
  - qemu-guest-agent
`

export default function CloudInitTab({ vm }: { vm: VM }) {
  const toast = useToastContext()
  const { canWrite } = usePermissions()
  const [instanceId, setInstanceId] = useState(vm.name)
  const [hostname, setHostname] = useState(vm.name)
  const [userData, setUserData] = useState(DEFAULT_USER_DATA)
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
      toast.success('Cloud-init ISO generated and attached')
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

      <form onSubmit={handleSubmit} className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <Cloud className="w-4 h-4 text-sky-400" />
          NoCloud datasource
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Instance ID</label>
            <input
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
              disabled={!canWrite}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Hostname</label>
            <input
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              disabled={!canWrite}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">User data (cloud-config YAML)</label>
          <textarea
            value={userData}
            onChange={(e) => setUserData(e.target.value)}
            disabled={!canWrite}
            rows={12}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Network config (JSON, optional)</label>
          <textarea
            value={networkConfig}
            onChange={(e) => setNetworkConfig(e.target.value)}
            disabled={!canWrite}
            rows={4}
            placeholder='{"version": 2, "ethernets": { ... }}'
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={!canWrite || saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white disabled:opacity-50"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Generate and attach ISO
        </button>
      </form>
    </div>
  )
}
