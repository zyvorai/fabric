// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback, useRef } from 'react'
import { FileUp, Upload, Download, Eye, Send, CheckCircle, XCircle, Clock, Loader2, FileText } from 'lucide-react'
import { apiFetch } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'

interface VMEntry { name: string; cpus: number; memory: string; image: string }
type VMStatus = 'pending' | 'submitting' | 'submitted' | 'error'
interface VMImportItem extends VMEntry { status: VMStatus; error?: string }

const exampleYAML = `vms:
  - name: web-01
    cpus: 2
    memory: 2G
    image: /var/lib/ephemera/images/web-01.qcow2
  - name: db-01
    cpus: 4
    memory: 8G
    image: /var/lib/ephemera/images/db-01.qcow2
  - name: app-01
    cpus: 2
    memory: 4G
    image: /var/lib/ephemera/images/app-01.qcow2`

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
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Request failed' }))
          throw new Error(body.error || formatHttpErrorBody(res.status, res.statusText, ''))
        }
        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: 'submitted' } : it)))
      } catch (err) {
        const msg = formatUserError(err)
        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: 'error', error: msg } : it)))
      }
    }
    setSubmitting(false)
  }, [items])

  const handleFileDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) { const reader = new FileReader(); reader.onload = (ev) => setInputText(ev.target?.result as string); reader.readAsText(file) } }, [])
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = (ev) => setInputText(ev.target?.result as string); reader.readAsText(file) } }, [])
  const handleDownloadTemplate = useCallback(() => { const blob = new Blob([exampleYAML], { type: 'text/yaml' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'batch-import-template.yaml'; a.click(); URL.revokeObjectURL(url) }, [])

  const statusIcon = (status: VMStatus) => { switch (status) { case 'pending': return <Clock className="w-4 h-4 text-[#6e6e73]" />; case 'submitting': return <Loader2 className="w-4 h-4 text-[#0066cc] animate-spin" />; case 'submitted': return <CheckCircle className="w-4 h-4 text-emerald-600" />; case 'error': return <XCircle className="w-4 h-4 text-red-600" /> } }
  const submitted = items.filter((i) => i.status === 'submitted').length
  const errors = items.filter((i) => i.status === 'error').length

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><FileUp className="w-6 h-6 text-amber-400" /><h2 className="text-xl font-bold text-[#1d1d1f]">Batch Import</h2></div>
        <button onClick={handleDownloadTemplate} className="flex items-center gap-2 px-3 py-2 text-sm bg-white hover:bg-black/[0.04] text-[#1d1d1f] rounded-lg transition-colors border border-[#d2d2d7]"><Download className="w-4 h-4" /> Download Template</button>
      </div>

      {!previewing ? (
        <div className="space-y-4">
          <div onDragOver={(e) => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={handleFileDrop} onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-amber-400 bg-amber-400/5' : 'border-[#d2d2d7] hover:border-[#6e6e73] bg-white'}`}>
            <Upload className="w-8 h-8 text-[#6e6e73] mx-auto mb-3" />
            <p className="text-sm text-[#6e6e73]">Drag & drop a <span className="text-amber-400 font-medium">.yaml</span> or <span className="text-amber-400 font-medium">.json</span> file, or click to browse</p>
            <input ref={fileRef} type="file" accept=".yaml,.yml,.json" className="hidden" onChange={handleFileSelect} />
          </div>
          <div><label className="block text-sm font-medium text-[#6e6e73] mb-2">Or paste YAML/JSON directly</label>
            <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} rows={12} className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg p-4 text-sm text-[#1d1d1f] font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-y" placeholder={exampleYAML} />
          </div>
          {parseError && (
            <ErrorBanner title="Could not parse input" headline={parseError} />
          )}
          <button onClick={handlePreview} disabled={!inputText.trim()} className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-[#e8e8ed] disabled:text-[#6e6e73] text-[#1d1d1f] font-medium rounded-lg transition-colors"><Eye className="w-4 h-4" /> Preview</button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-3 bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg text-sm">
            <span className="text-[#6e6e73]"><FileText className="w-4 h-4 inline mr-1" />{items.length} VMs</span>
            {submitted > 0 && <span className="text-emerald-600"><CheckCircle className="w-4 h-4 inline mr-1" />{submitted} submitted</span>}
            {errors > 0 && <span className="text-red-600"><XCircle className="w-4 h-4 inline mr-1" />{errors} failed</span>}
          </div>
          <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl overflow-hidden">
            <table className="w-full text-sm"><thead><tr className="border-b border-[#d2d2d7] bg-[#f5f5f7]"><th className="px-4 py-3 text-left text-xs font-medium text-[#6e6e73] uppercase">Status</th><th className="px-4 py-3 text-left text-xs font-medium text-[#6e6e73] uppercase">VM Name</th><th className="px-4 py-3 text-left text-xs font-medium text-[#6e6e73] uppercase">CPUs</th><th className="px-4 py-3 text-left text-xs font-medium text-[#6e6e73] uppercase">Memory</th><th className="px-4 py-3 text-left text-xs font-medium text-[#6e6e73] uppercase">Image</th></tr></thead>
            <tbody>{items.map((item, idx) => (
              <tr key={idx} className="border-b border-[#d2d2d7] last:border-0 hover:bg-[#f5f5f7]">
                <td className="px-4 py-3"><div className="flex items-center gap-2">{statusIcon(item.status)}<span className="text-xs text-[#6e6e73] capitalize">{item.status}</span></div></td>
                <td className="px-4 py-3 text-[#1d1d1f] font-medium">{item.name}</td>
                <td className="px-4 py-3 text-[#6e6e73]">{item.cpus}</td>
                <td className="px-4 py-3 text-[#6e6e73]">{item.memory}</td>
                <td className="px-4 py-3 text-[#6e6e73] font-mono text-xs">{item.image}{item.error && <p className="text-red-600 mt-1">{item.error}</p>}</td>
              </tr>
            ))}</tbody></table>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSubmitAll} disabled={submitting || items.every((i) => i.status === 'submitted')} className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-[#e8e8ed] disabled:text-[#6e6e73] text-white font-medium rounded-lg transition-colors">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{submitting ? 'Submitting...' : 'Submit All'}</button>
            <button onClick={() => { setPreviewing(false); setItems([]) }} disabled={submitting} className="px-4 py-2.5 text-sm text-[#6e6e73] hover:text-[#1d1d1f] bg-white hover:bg-black/[0.04] rounded-lg transition-colors">Back to Editor</button>
          </div>
        </div>
      )}
    </div>
  )
}
