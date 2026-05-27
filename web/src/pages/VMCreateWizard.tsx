// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { Plus, ArrowRight, ArrowLeft, Check, Loader2, Copy } from 'lucide-react'
import { apiFetch } from '../api/client'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'

type Step = 'name' | 'resources' | 'install' | 'network' | 'review'

export default function VMCreateWizard() {
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')
  const [cpus, setCpus] = useState(2)
  const [memory, setMemory] = useState(2048)
  const [diskSize, setDiskSize] = useState(20)
  const [diskFormat, setDiskFormat] = useState('qcow2')
  const [bootSource, setBootSource] = useState<'iso' | 'disk' | 'pxe'>('disk')
  const [isoPath, setIsoPath] = useState('')
  const [diskPath, setDiskPath] = useState('')
  const [networkType, setNetworkType] = useState('user')
  const [bridge, setBridge] = useState('')
  const [firmware, setFirmware] = useState('uefi')
  const [autoStart, setAutoStart] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const steps: { key: Step; label: string }[] = [
    { key: 'name', label: 'Name & OS' },
    { key: 'resources', label: 'Resources' },
    { key: 'install', label: 'Installation' },
    { key: 'network', label: 'Network' },
    { key: 'review', label: 'Review' },
  ]
  const currentIdx = steps.findIndex(s => s.key === step)
  const canNext = step === 'name' ? !!name : step === 'install' ? (bootSource !== 'iso' || !!isoPath) && (bootSource !== 'disk' || !!diskPath) : true

  const generateCommand = (): string => {
    const parts = [`vmctl create --name "${name}"`, `--cpus ${cpus}`, `--memory ${memory}M`, `--disk-size ${diskSize}G`, `--disk-format ${diskFormat}`, `--firmware ${firmware}`, `--network ${networkType}`]
    if (networkType === 'bridge' && bridge) parts.push(`--bridge ${bridge}`)
    if (bootSource === 'iso' && isoPath) parts.push(`--iso "${isoPath}"`)
    if (bootSource === 'disk' && diskPath) parts.push(`--image "${diskPath}"`)
    if (bootSource === 'pxe') parts.push('--pxe')
    if (autoStart) parts.push('--auto-start')
    return parts.join(' \\\n  ')
  }

  const handleSubmit = async () => {
    setSubmitting(true); setResult(null)
    try {
      const res = await apiFetch('/api/vms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, cpus, memory: `${memory}M`, disk_size: `${diskSize}G`, disk_format: diskFormat, firmware, network: networkType, bridge: networkType === 'bridge' ? bridge : undefined, iso: bootSource === 'iso' ? isoPath : undefined, image: bootSource === 'disk' ? diskPath : undefined, pxe: bootSource === 'pxe', auto_start: autoStart }) })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || formatHttpErrorBody(res.status, res.statusText, ''))
      }
      setResult({ ok: true, message: `VM "${name}" created successfully!` })
    } catch (err) {
      setResult({ ok: false, message: formatUserError(err) })
    } finally { setSubmitting(false) }
  }

  const handleCopyCommand = () => { navigator.clipboard.writeText(generateCommand()); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div><h1 className="text-2xl font-bold text-white flex items-center gap-3"><Plus className="w-6 h-6 text-green-400" /> VM Create Wizard</h1><p className="text-sm text-slate-400 mt-1">Step-by-step virtual machine creation</p></div>

      <div className="flex items-center gap-0">
        {steps.map((s, idx) => (
          <div key={s.key} className="flex items-center flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${idx < currentIdx ? 'bg-green-500 text-white' : idx === currentIdx ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'}`}>{idx < currentIdx ? <Check className="w-3.5 h-3.5" /> : idx + 1}</div>
            <span className={`ml-1.5 text-[10px] font-medium ${idx <= currentIdx ? 'text-white' : 'text-slate-500'} hidden sm:block`}>{s.label}</span>
            {idx < steps.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${idx < currentIdx ? 'bg-green-500' : 'bg-slate-700'}`} />}
          </div>
        ))}
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 space-y-4">
        {step === 'name' && (<>
          <h2 className="text-lg font-semibold text-white">Name & OS</h2>
          <div><label className="block text-xs text-slate-400 mb-1">VM Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="my-vm" aria-label="VM name" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Firmware</label><div className="flex gap-2">{['uefi', 'bios'].map(f => <button key={f} onClick={() => setFirmware(f)} className={`px-4 py-2 rounded-lg text-sm font-medium uppercase transition-colors ${firmware === f ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>{f}</button>)}</div></div>
        </>)}
        {step === 'resources' && (<>
          <h2 className="text-lg font-semibold text-white">Resources</h2>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-xs text-slate-400 mb-1">vCPUs</label><input type="number" value={cpus} onChange={e => setCpus(Number(e.target.value))} min={1} max={64} aria-label="vCPUs" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Memory (MB)</label><input type="number" value={memory} onChange={e => setMemory(Number(e.target.value))} min={256} step={256} aria-label="Memory" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Disk (GB)</label><input type="number" value={diskSize} onChange={e => setDiskSize(Number(e.target.value))} min={1} aria-label="Disk size" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" /></div>
          </div>
          <div><label className="block text-xs text-slate-400 mb-1">Disk Format</label><select value={diskFormat} onChange={e => setDiskFormat(e.target.value)} aria-label="Disk format" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"><option value="qcow2">QCOW2</option><option value="raw">RAW</option></select></div>
        </>)}
        {step === 'install' && (<>
          <h2 className="text-lg font-semibold text-white">Installation Source</h2>
          <div className="flex gap-3">{(['disk', 'iso', 'pxe'] as const).map(t => <button key={t} onClick={() => setBootSource(t)} className={`px-4 py-2.5 rounded-lg text-sm font-medium capitalize transition-colors ${bootSource === t ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>{t === 'disk' ? 'Disk Image' : t.toUpperCase()}</button>)}</div>
          {bootSource === 'iso' && <div><label className="block text-xs text-slate-400 mb-1">ISO Path</label><input type="text" value={isoPath} onChange={e => setIsoPath(e.target.value)} placeholder="/path/to/install.iso" aria-label="ISO path" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500" /></div>}
          {bootSource === 'disk' && <div><label className="block text-xs text-slate-400 mb-1">Disk Image Path</label><input type="text" value={diskPath} onChange={e => setDiskPath(e.target.value)} placeholder="/var/lib/vmspawnd/images/disk.qcow2" aria-label="Disk image path" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500" /></div>}
          {bootSource === 'pxe' && <p className="text-xs text-slate-500">VM will boot from network PXE server.</p>}
        </>)}
        {step === 'network' && (<>
          <h2 className="text-lg font-semibold text-white">Network</h2>
          <div><label className="block text-xs text-slate-400 mb-1">Network Type</label><div className="flex gap-2">{['user', 'bridge', 'tap'].map(t => <button key={t} onClick={() => setNetworkType(t)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${networkType === t ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>{t}</button>)}</div></div>
          {networkType === 'bridge' && <div><label className="block text-xs text-slate-400 mb-1">Bridge Name</label><input type="text" value={bridge} onChange={e => setBridge(e.target.value)} placeholder="br0" aria-label="Bridge name" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500" /></div>}
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={autoStart} onChange={e => setAutoStart(e.target.checked)} className="rounded border-slate-600 bg-slate-700 text-blue-500" /><span className="text-sm text-slate-300">Auto-start on host boot</span></label>
        </>)}
        {step === 'review' && (<>
          <h2 className="text-lg font-semibold text-white">Review</h2>
          <div className="bg-slate-900/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Name</span><span className="text-slate-200">{name}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Resources</span><span className="text-slate-200">{cpus} vCPU, {memory} MB, {diskSize} GB {diskFormat}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Boot</span><span className="text-slate-200 capitalize">{bootSource}{bootSource === 'iso' ? `: ${isoPath}` : bootSource === 'disk' ? `: ${diskPath}` : ''}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Network</span><span className="text-slate-200 capitalize">{networkType}{bridge ? ` (${bridge})` : ''}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Firmware</span><span className="text-slate-200 uppercase">{firmware}</span></div>
          </div>
          <div className="bg-slate-950 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2"><span className="text-xs text-slate-500">CLI Command</span><button onClick={handleCopyCommand} title="Copy command" className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1">{copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />} {copied ? 'Copied' : 'Copy'}</button></div>
            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{generateCommand()}</pre>
          </div>
          {result && <div className={`p-3 rounded-lg text-sm ${result.ok ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{result.message}</div>}
        </>)}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setStep(steps[currentIdx - 1].key)} disabled={currentIdx === 0} title="Go back" className="flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-30"><ArrowLeft className="w-4 h-4" /> Back</button>
        {step === 'review' ? (
          <button onClick={handleSubmit} disabled={submitting || result?.ok} title="Create virtual machine" className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-500 hover:to-emerald-500 transition-all shadow-lg shadow-green-600/20 disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {submitting ? 'Creating...' : 'Create VM'}</button>
        ) : (
          <button onClick={() => setStep(steps[currentIdx + 1].key)} disabled={!canNext} title="Next step" className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-30">Next <ArrowRight className="w-4 h-4" /></button>
        )}
      </div>
    </div>
  )
}
