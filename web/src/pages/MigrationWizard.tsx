import { useState } from 'react'
import { ArrowRight, ArrowLeft, Check, Loader2 } from 'lucide-react'
import { apiFetch } from '../api/client'

type WizardStep = 'source' | 'configure' | 'review'

export default function MigrationWizard() {
  const [step, setStep] = useState<WizardStep>('source')
  const [sourceType, setSourceType] = useState<'local' | 'remote'>('local')
  const [sourcePath, setSourcePath] = useState('')
  const [remoteHost, setRemoteHost] = useState('')
  const [vmName, setVmName] = useState('')
  const [targetFormat, setTargetFormat] = useState('qcow2')
  const [outputDir, setOutputDir] = useState('/var/lib/vmspawnd/images')
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
      if (!res.ok) { const body = await res.json().catch(() => null); throw new Error(body?.error || `HTTP ${res.status}`) }
      setResult({ ok: true, message: 'Migration submitted successfully!' })
    } catch (err: any) { setResult({ ok: false, message: err.message }) } finally { setSubmitting(false) }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Migration Wizard</h1><p className="text-sm text-slate-400 mt-1">Step-by-step VM migration</p></div>

      {/* Progress */}
      <div className="flex items-center gap-0">
        {steps.map((s, idx) => (
          <div key={s.key} className="flex items-center flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${idx < currentIdx ? 'bg-green-500 text-white' : idx === currentIdx ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
              {idx < currentIdx ? <Check className="w-4 h-4" /> : idx + 1}
            </div>
            <span className={`ml-2 text-xs font-medium ${idx <= currentIdx ? 'text-white' : 'text-slate-500'}`}>{s.label}</span>
            {idx < steps.length - 1 && <div className={`flex-1 h-0.5 mx-3 ${idx < currentIdx ? 'bg-green-500' : 'bg-slate-700'}`} />}
          </div>
        ))}
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        {step === 'source' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Select Source</h2>
            <div className="flex gap-3">
              {(['local', 'remote'] as const).map(t => (
                <button key={t} onClick={() => setSourceType(t)} className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors capitalize ${sourceType === t ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>{t} {t === 'local' ? 'File' : 'Host'}</button>
              ))}
            </div>
            {sourceType === 'local' ? (
              <div><label className="block text-xs text-slate-400 mb-1">Disk Image Path</label><input type="text" value={sourcePath} onChange={e => setSourcePath(e.target.value)} placeholder="/path/to/disk.vmdk" aria-label="Source path" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500" /></div>
            ) : (
              <div><label className="block text-xs text-slate-400 mb-1">Remote Host</label><input type="text" value={remoteHost} onChange={e => setRemoteHost(e.target.value)} placeholder="user@hostname:/path" aria-label="Remote host" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500" /></div>
            )}
          </div>
        )}

        {step === 'configure' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Configure VM</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-slate-400 mb-1">VM Name</label><input type="text" value={vmName} onChange={e => setVmName(e.target.value)} placeholder="my-vm" aria-label="VM name" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500" /></div>
              <div><label className="block text-xs text-slate-400 mb-1">Target Format</label><select value={targetFormat} onChange={e => setTargetFormat(e.target.value)} aria-label="Target format" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"><option value="qcow2">QCOW2</option><option value="raw">RAW</option><option value="vmdk">VMDK</option></select></div>
              <div><label className="block text-xs text-slate-400 mb-1">vCPUs</label><input type="number" value={cpus} onChange={e => setCpus(Number(e.target.value))} min={1} max={64} aria-label="vCPUs" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" /></div>
              <div><label className="block text-xs text-slate-400 mb-1">Memory (MB)</label><input type="number" value={memory} onChange={e => setMemory(Number(e.target.value))} min={256} step={256} aria-label="Memory" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" /></div>
            </div>
            <div><label className="block text-xs text-slate-400 mb-1">Output Directory</label><input type="text" value={outputDir} onChange={e => setOutputDir(e.target.value)} aria-label="Output directory" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500" /></div>
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={autoStart} onChange={e => setAutoStart(e.target.checked)} className="rounded border-slate-600 bg-slate-700 text-blue-500" /><span className="text-sm text-slate-300">Auto-start after migration</span></label>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Review & Submit</h2>
            <div className="bg-slate-900/50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Source</span><span className="text-slate-200 font-mono">{sourceType === 'local' ? sourcePath : remoteHost}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">VM Name</span><span className="text-slate-200">{vmName}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Format</span><span className="text-slate-200">{targetFormat.toUpperCase()}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Resources</span><span className="text-slate-200">{cpus} vCPU, {memory} MB</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Output</span><span className="text-slate-200 font-mono">{outputDir}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Auto-start</span><span className="text-slate-200">{autoStart ? 'Yes' : 'No'}</span></div>
            </div>
            {result && <div className={`p-3 rounded-lg text-sm ${result.ok ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{result.message}</div>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setStep(steps[currentIdx - 1].key)} disabled={currentIdx === 0} className="flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"><ArrowLeft className="w-4 h-4" /> Back</button>
        {step === 'review' ? (
          <button onClick={handleSubmit} disabled={submitting || result?.ok} className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-500 hover:to-emerald-500 transition-all shadow-lg shadow-green-600/20 disabled:opacity-50">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {submitting ? 'Submitting...' : 'Submit Migration'}
          </button>
        ) : (
          <button onClick={() => setStep(steps[currentIdx + 1].key)} disabled={!canNext} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed">Next <ArrowRight className="w-4 h-4" /></button>
        )}
      </div>
    </div>
  )
}
