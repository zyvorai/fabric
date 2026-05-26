// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { createVM } from '../api/vm'
import { ArrowLeft, Server, Cpu, HardDrive, ChevronDown, ChevronUp, Shield, Monitor } from 'lucide-react'

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

export default function CreateVM() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [cpus, setCpus] = useState(2)
  const [memory, setMemory] = useState(2048)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [advanced, setAdvanced] = useState<AdvancedOptions>(defaultAdvanced)

  const memoryPresets = [
    { label: '512 MB', value: 512 },
    { label: '1 GB', value: 1024 },
    { label: '2 GB', value: 2048 },
    { label: '4 GB', value: 4096 },
    { label: '8 GB', value: 8192 },
    { label: '16 GB', value: 16384 },
  ]

  const VM_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!VM_NAME_REGEX.test(name)) {
      setError('VM name must start with a letter or number, contain only letters, numbers, dots, hyphens, underscores, and be 1-64 characters')
      setLoading(false)
      return
    }

    if (memory < 256) {
      setError('Memory must be at least 256 MB')
      setLoading(false)
      return
    }

    try {
      await createVM({ name, image, cpus, memory })
      navigate('/vms')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create VM')
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
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-blue-500/10">
            <Server className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Create Virtual Machine</h1>
            <p className="text-sm text-slate-500">Configure and launch a new VM</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Basic section */}
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
                Image Path
              </label>
              <input
                id="vm-image"
                type="text"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="/var/lib/vmspawnd/images/ubuntu-24.04.qcow2"
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors text-sm font-mono"
                required
              />
            </div>
          </div>

          {/* Resources section */}
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
              <div className="flex justify-between text-[11px] text-slate-600 mt-1 px-1">
                <span>1</span>
                <span>8</span>
                <span>16</span>
                <span>24</span>
                <span>32</span>
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

          {/* Advanced Options */}
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
                {/* Firmware */}
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
                        onClick={() => setAdvanced({ ...advanced, firmware: fw, secureBoot: fw === 'bios' ? false : advanced.secureBoot })}
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
                  {advanced.firmware === 'uefi' && (
                    <label className="flex items-center gap-2 mt-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={advanced.secureBoot}
                        onChange={(e) => setAdvanced({ ...advanced, secureBoot: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500/20"
                      />
                      <span className="text-sm text-slate-400">Enable Secure Boot</span>
                    </label>
                  )}
                </div>

                {/* CPU Mode */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                    <Cpu className="w-4 h-4 text-slate-500" />
                    CPU Mode
                  </label>
                  <select
                    value={advanced.cpuMode}
                    onChange={(e) => setAdvanced({ ...advanced, cpuMode: e.target.value as AdvancedOptions['cpuMode'] })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700/50 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="host-passthrough">Host Passthrough (best performance)</option>
                    <option value="host-model">Host Model (migration compatible)</option>
                    <option value="custom">Custom CPU Model</option>
                  </select>
                </div>

                {/* Machine Type */}
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-2 block">Machine Type</label>
                  <div className="flex gap-2">
                    {['q35', 'pc', 'virt'].map((mt) => (
                      <button
                        key={mt}
                        type="button"
                        onClick={() => setAdvanced({ ...advanced, machineType: mt })}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          advanced.machineType === mt
                            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                            : 'bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        {mt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Display */}
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

                {/* Memory Balloon */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advanced.enableBalloon}
                    onChange={(e) => setAdvanced({ ...advanced, enableBalloon: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500/20"
                  />
                  <span className="text-sm text-slate-400">Enable Memory Ballooning</span>
                </label>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !name || !image}
            className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 disabled:shadow-none"
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
        </form>
      </div>
    </div>
  )
}
