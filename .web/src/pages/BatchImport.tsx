import { useState, useCallback, useRef } from 'react'
import { FileUp, Upload, Download, Eye, Send, CheckCircle, XCircle, Clock, Loader2, FileText } from 'lucide-react'
import { apiFetch } from '../api/client'

interface VMEntry { name: string; cpus: number; memory: string; image: string }
type VMStatus = 'pending' | 'submitting' | 'submitted' | 'error'
interface VMImportItem extends VMEntry { status: VMStatus; error?: string }

const exampleYAML = `vms:
  - name: web-01
    cpus: 2
    memory: 2G
    image: /var/lib/libvirt/images/web-01.qcow2
  - name: db-01
    cpus: 4
    memory: 8G
    image: /var/lib/libvirt/images/db-01.qcow2
  - name: app-01
    cpus: 2
    memory: 4G
    image: /var/lib/libvirt/images/app-01.qcow2`

function parseInput(text: string): VMEntry[] {
  const trimmed = text.trim()
  try { const parsed = JSON.parse(trimmed); const list = parsed.vms || parsed; if (Array.isArray(list)) return list.map((v: any) => ({ name: v.name || '', cpus: v.cpus || 2, memory: v.memory || '2G', image: v.image || '' })) } catch { /* not JSON */ }
  const vms: VMEntry[] = []; let current: Partial<VMEntry> | null = null
  for (const line of trimmed.split('\n')) {
    const s = line.trim()
    if (s.startsWith('- name:')) { if (current && current.name) vms.push(current as VMEntry); current = { name: s.replace('- name:', '').trim(), cpus: 2, memory: '2G', image: '' } }
    else if (s.startsWith('cpus:') && current) current.cpus = parseInt(s.replace('cpus:', '').trim(), 10) || 2
    else if (s.startsWith('memory:') && current) current.memory = s.replace('memory:', '').trim()
    else if (s.startsWith('image:') && current) current.image = s.replace('image:', '').trim()
  }
  if (current && current.name) vms.push(current as VMEntry)
  return vms
}

export default function BatchImport() {
  const [inputText, setInputText] = useState('')
  const [items, setItems] = useState<VMImportItem[]>([])
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [parseError, setParseError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handlePreview = useCallback(() => {
    setParseError('')
    try {
      const entries = parseInput(inputText)
      if (entries.length === 0) { setParseError('No VMs found. Check your YAML/JSON format.'); return }
      const invalid = entries.filter((e) => !e.name || !e.image)
      if (invalid.length > 0) { setParseError(`${invalid.length} entries are missing name or image fields.`); return }
      setItems(entries.map((e) => ({ ...e, status: 'pending' }))); setPreviewing(true)
    } catch { setParseError('Failed to parse input.') }
  }, [inputText])

  const handleSubmitAll = useCallback(async () => {
    setSubmitting(true)
    for (let i = 0; i < items.length; i++) {
      setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: 'submitting' } : it))
      try {
        const res = await apiFetch('/api/vms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: items[i].name, cpus: items[i].cpus, memory: items[i].memory, image: items[i].image }) })
        if (!res.ok) { const body = await res.json().catch(() => ({ error: 'Request failed' })); throw new Error(body.error || `HTTP ${res.status}`) }
        setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: 'submitted' } : it))
      } catch (err) { setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' } : it)) }
    }
    setSubmitting(false)
  }, [items])

  const handleFileDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) { const reader = new FileReader(); reader.onload = (ev) => setInputText(ev.target?.result as string); reader.readAsText(file) } }, [])
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = (ev) => setInputText(ev.target?.result as string); reader.readAsText(file) } }, [])
  const handleDownloadTemplate = useCallback(() => { const blob = new Blob([exampleYAML], { type: 'text/yaml' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'batch-import-template.yaml'; a.click(); URL.revokeObjectURL(url) }, [])

  const statusIcon = (status: VMStatus) => { switch (status) { case 'pending': return <Clock className="w-4 h-4 text-slate-400" />; case 'submitting': return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />; case 'submitted': return <CheckCircle className="w-4 h-4 text-green-400" />; case 'error': return <XCircle className="w-4 h-4 text-red-400" /> } }
  const submitted = items.filter((i) => i.status === 'submitted').length
  const errors = items.filter((i) => i.status === 'error').length

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><FileUp className="w-6 h-6 text-amber-400" /><h2 className="text-xl font-bold text-white">Batch Import</h2></div>
        <button onClick={handleDownloadTemplate} className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"><Download className="w-4 h-4" /> Download Template</button>
      </div>

      {!previewing ? (
        <div className="space-y-4">
          <div onDragOver={(e) => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={handleFileDrop} onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-amber-400 bg-amber-400/5' : 'border-slate-700 hover:border-slate-500 bg-slate-900/50'}`}>
            <Upload className="w-8 h-8 text-slate-500 mx-auto mb-3" />
            <p className="text-sm text-slate-400">Drag & drop a <span className="text-amber-400 font-medium">.yaml</span> or <span className="text-amber-400 font-medium">.json</span> file, or click to browse</p>
            <input ref={fileRef} type="file" accept=".yaml,.yml,.json" className="hidden" onChange={handleFileSelect} />
          </div>
          <div><label className="block text-sm font-medium text-slate-400 mb-2">Or paste YAML/JSON directly</label>
            <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} rows={12} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-y" placeholder={exampleYAML} />
          </div>
          {parseError && <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400"><XCircle className="w-4 h-4 flex-shrink-0" />{parseError}</div>}
          <button onClick={handlePreview} disabled={!inputText.trim()} className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg transition-colors"><Eye className="w-4 h-4" /> Preview</button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-3 bg-slate-800/50 border border-slate-700 rounded-lg text-sm">
            <span className="text-slate-400"><FileText className="w-4 h-4 inline mr-1" />{items.length} VMs</span>
            {submitted > 0 && <span className="text-green-400"><CheckCircle className="w-4 h-4 inline mr-1" />{submitted} submitted</span>}
            {errors > 0 && <span className="text-red-400"><XCircle className="w-4 h-4 inline mr-1" />{errors} failed</span>}
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm"><thead><tr className="border-b border-slate-700 bg-slate-800/50"><th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">VM Name</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">CPUs</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Memory</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Image</th></tr></thead>
            <tbody>{items.map((item, idx) => (
              <tr key={idx} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30">
                <td className="px-4 py-3"><div className="flex items-center gap-2">{statusIcon(item.status)}<span className="text-xs text-slate-500 capitalize">{item.status}</span></div></td>
                <td className="px-4 py-3 text-slate-200 font-medium">{item.name}</td>
                <td className="px-4 py-3 text-slate-400">{item.cpus}</td>
                <td className="px-4 py-3 text-slate-400">{item.memory}</td>
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{item.image}{item.error && <p className="text-red-400 mt-1">{item.error}</p>}</td>
              </tr>
            ))}</tbody></table>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSubmitAll} disabled={submitting || items.every((i) => i.status === 'submitted')} className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg transition-colors">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{submitting ? 'Submitting...' : 'Submit All'}</button>
            <button onClick={() => { setPreviewing(false); setItems([]) }} disabled={submitting} className="px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">Back to Editor</button>
          </div>
        </div>
      )}
    </div>
  )
}
