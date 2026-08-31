// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react'
import { ArrowRight, ArrowLeft, Check, Loader2 } from 'lucide-react'
import { apiFetch } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'
import { hintsForError } from '../utils/daemonHints'

type WizardStep = 'source' | 'configure' | 'review'

export default function MigrationWizard() {
  const [step, setStep] = useState<WizardStep>('source')
  const [sourceType, setSourceType] = useState<'local' | 'remote'>('local')
  const [sourcePath, setSourcePath] = useState('')
  const [remoteHost, setRemoteHost] = useState('')
  const [vmName, setVmName] = useState('')
  const [targetFormat, setTargetFormat] = useState('qcow2')
  const [outputDir, setOutputDir] = useState('/var/lib/zyvor-fabricd/images')
  const [cpus, setCpus] = useState(2)
  const [memory, setMemory] = useState(2048)
  const [autoStart, setAutoStart] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const steps: { key: WizardStep; label: string }[] = [
    { key: 'source', label: 'Source' },
    { key: 'configure', label: 'Configure' },
    { key: 'review', label: 'Review & Submit' },
  ]

  const currentIdx = steps.findIndex(s => s.key === step)
  const canNext = step === 'source' ? (sourceType === 'local' ? !!sourcePath : !!remoteHost) : step === 'configure' ? !!vmName : true

  const handleSubmit = async () => {
    setSubmitting(true); setResult(null)
    try {
      const res = await apiFetch('/api/migrations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_type: sourceType, source_path: sourcePath, remote_host: remoteHost, vm_name: vmName, target_format: targetFormat, output_dir: outputDir, cpus, memory, auto_start: autoStart }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || formatHttpErrorBody(res.status, res.statusText, ''))
      }
      setResult({ ok: true, message: 'Migration submitted successfully!' })
    } catch (err) {
      setResult({ ok: false, message: formatUserError(err) })
    } finally { setSubmitting(false) }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div><h1 className="text-2xl font-bold text-[#1d1d1f]">Migration Wizard</h1><p className="text-sm text-[#6e6e73] mt-1">Step-by-step VM migration</p></div>

      {/* Progress */}
      <div className="flex items-center gap-0">
        {steps.map((s, idx) => (
          <div key={s.key} className="flex items-center flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${idx < currentIdx ? 'bg-green-500 text-white' : idx === currentIdx ? 'bg-blue-500 text-[#1d1d1f]' : 'bg-[#e8e8ed] text-[#6e6e73]'}`}>
              {idx < currentIdx ? <Check className="w-4 h-4" /> : idx + 1}
            </div>
            <span className={`ml-2 text-xs font-medium ${idx <= currentIdx ? 'text-[#1d1d1f]' : 'text-[#6e6e73]'}`}>{s.label}</span>
            {idx < steps.length - 1 && <div className={`flex-1 h-0.5 mx-3 ${idx < currentIdx ? 'bg-green-500' : 'bg-[#e8e8ed]'}`} />}
          </div>
        ))}
      </div>

      <div className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] p-6">
        {step === 'source' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-[#1d1d1f]">Select Source</h2>
            <div className="flex gap-3">
              {(['local', 'remote'] as const).map(t => (
                <button key={t} onClick={() => setSourceType(t)} className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors capitalize ${sourceType === t ? 'bg-[#0066cc] text-white' : 'bg-[#e8e8ed] text-[#1d1d1f] hover:bg-[#d2d2d7]'}`}>{t} {t === 'local' ? 'File' : 'Host'}</button>
              ))}
            </div>
            {sourceType === 'local' ? (
              <div><label className="block text-xs text-[#6e6e73] mb-1">Disk Image Path</label><input type="text" value={sourcePath} onChange={e => setSourcePath(e.target.value)} placeholder="/path/to/disk.vmdk" aria-label="Source path" className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] placeholder-[#6e6e73] focus:outline-none focus:border-blue-500" /></div>
            ) : (
              <div><label className="block text-xs text-[#6e6e73] mb-1">Remote Host</label><input type="text" value={remoteHost} onChange={e => setRemoteHost(e.target.value)} placeholder="user@hostname:/path" aria-label="Remote host" className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] placeholder-[#6e6e73] focus:outline-none focus:border-blue-500" /></div>
            )}
          </div>
        )}

        {step === 'configure' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-[#1d1d1f]">Configure VM</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-[#6e6e73] mb-1">VM Name</label><input type="text" value={vmName} onChange={e => setVmName(e.target.value)} placeholder="my-vm" aria-label="VM name" className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] placeholder-[#6e6e73] focus:outline-none focus:border-blue-500" /></div>
              <div><label className="block text-xs text-[#6e6e73] mb-1">Target Format</label><select value={targetFormat} onChange={e => setTargetFormat(e.target.value)} aria-label="Target format" className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:outline-none focus:border-blue-500"><option value="qcow2">QCOW2</option><option value="raw">RAW</option><option value="vmdk">VMDK</option></select></div>
              <div><label className="block text-xs text-[#6e6e73] mb-1">vCPUs</label><input type="number" value={cpus} onChange={e => setCpus(Number(e.target.value))} min={1} max={64} aria-label="vCPUs" className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:outline-none focus:border-blue-500" /></div>
              <div><label className="block text-xs text-[#6e6e73] mb-1">Memory (MB)</label><input type="number" value={memory} onChange={e => setMemory(Number(e.target.value))} min={256} step={256} aria-label="Memory" className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:outline-none focus:border-blue-500" /></div>
            </div>
            <div><label className="block text-xs text-[#6e6e73] mb-1">Output Directory</label><input type="text" value={outputDir} onChange={e => setOutputDir(e.target.value)} aria-label="Output directory" className="w-full bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] font-mono focus:outline-none focus:border-blue-500" /></div>
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={autoStart} onChange={e => setAutoStart(e.target.checked)} className="rounded border-[#d2d2d7] bg-[#e8e8ed] text-blue-500" /><span className="text-sm text-[#1d1d1f]">Auto-start after migration</span></label>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-[#1d1d1f]">Review & Submit</h2>
            <div className="bg-white rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[#6e6e73]">Source</span><span className="text-[#1d1d1f] font-mono">{sourceType === 'local' ? sourcePath : remoteHost}</span></div>
              <div className="flex justify-between"><span className="text-[#6e6e73]">VM Name</span><span className="text-[#1d1d1f]">{vmName}</span></div>
              <div className="flex justify-between"><span className="text-[#6e6e73]">Format</span><span className="text-[#1d1d1f]">{targetFormat.toUpperCase()}</span></div>
              <div className="flex justify-between"><span className="text-[#6e6e73]">Resources</span><span className="text-[#1d1d1f]">{cpus} vCPU, {memory} MB</span></div>
              <div className="flex justify-between"><span className="text-[#6e6e73]">Output</span><span className="text-[#1d1d1f] font-mono">{outputDir}</span></div>
              <div className="flex justify-between"><span className="text-[#6e6e73]">Auto-start</span><span className="text-[#1d1d1f]">{autoStart ? 'Yes' : 'No'}</span></div>
            </div>
            {result?.ok && (
              <div className="p-3 rounded-lg text-sm bg-green-500/10 border border-green-500/30 text-emerald-600">{result.message}</div>
            )}
            {result && !result.ok && (
              <ErrorBanner title="Migration failed" headline={result.message} hints={hintsForError(result.message)} />
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setStep(steps[currentIdx - 1].key)} disabled={currentIdx === 0} title="Go back" className="flex items-center gap-2 px-4 py-2 text-sm text-[#6e6e73] hover:text-[#1d1d1f] bg-white hover:bg-black/[0.04] rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"><ArrowLeft className="w-4 h-4" /> Back</button>
        {step === 'review' ? (
          <button onClick={handleSubmit} disabled={submitting || result?.ok} title="Submit migration" className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-500 hover:to-emerald-500 transition-all shadow-lg shadow-green-600/20 disabled:opacity-50">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {submitting ? 'Submitting...' : 'Submit Migration'}
          </button>
        ) : (
          <button onClick={() => setStep(steps[currentIdx + 1].key)} disabled={!canNext} title="Next step" className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#0066cc] hover:bg-[#0077ed] text-white rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed">Next <ArrowRight className="w-4 h-4" /></button>
        )}
      </div>
    </div>
  )
}
