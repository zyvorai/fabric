import { useState } from 'react'
import { Plus, Trash2, Download, Copy, Check, ChevronDown, ChevronUp, Layers } from 'lucide-react'

interface MigrationEntry { id: number; name: string; source: string; target_format: string; cpus: number; memory: number; expanded: boolean }

let entryCounter = 0

export default function BatchMigrationBuilder() {
  const [entries, setEntries] = useState<MigrationEntry[]>([])
  const [copied, setCopied] = useState(false)

  const addEntry = () => setEntries(prev => [...prev, { id: ++entryCounter, name: '', source: '', target_format: 'qcow2', cpus: 2, memory: 2048, expanded: true }])
  const removeEntry = (id: number) => setEntries(prev => prev.filter(e => e.id !== id))
  const updateEntry = (id: number, field: string, value: string | number) => setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e))
  const toggleExpand = (id: number) => setEntries(prev => prev.map(e => e.id === id ? { ...e, expanded: !e.expanded } : e))

  const generateJSON = (): string => JSON.stringify({
    migrations: entries.map(e => ({ vm_name: e.name, source_path: e.source, target_format: e.target_format, cpus: e.cpus, memory_mb: e.memory }))
  }, null, 2)

  const json = generateJSON()
  const handleCopy = () => { navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const handleDownload = () => { const blob = new Blob([json], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'batch-migration.json'; a.click(); URL.revokeObjectURL(url) }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><Layers className="w-6 h-6 text-pink-400" /><div><h1 className="text-xl font-bold text-white">Batch Migration Builder</h1><p className="text-sm text-slate-400">Configure multiple VM migrations with JSON export</p></div></div>
        <button onClick={addEntry} className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white text-sm font-medium rounded-lg transition-colors"><Plus className="w-4 h-4" /> Add VM</button>
      </div>

      {entries.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500"><Layers className="w-10 h-10 mx-auto mb-3 opacity-50" /><p className="text-sm">No VMs added. Click "Add VM" to start.</p></div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, idx) => (
            <div key={entry.id} className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-700/30 transition-colors" onClick={() => toggleExpand(entry.id)}>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-500 bg-slate-700/50 w-6 h-6 rounded-full flex items-center justify-center">{idx + 1}</span>
                  <span className="text-sm font-medium text-white">{entry.name || `VM ${idx + 1}`}</span>
                  {entry.source && <span className="text-xs text-slate-500 font-mono truncate max-w-[200px]">{entry.source}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); removeEntry(entry.id) }} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Remove"><Trash2 className="w-4 h-4" /></button>
                  {entry.expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>
              {entry.expanded && (
                <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-slate-400 mb-1">VM Name</label><input type="text" value={entry.name} onChange={e => updateEntry(entry.id, 'name', e.target.value)} placeholder="my-vm" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500" /></div>
                  <div><label className="block text-xs text-slate-400 mb-1">Source Path</label><input type="text" value={entry.source} onChange={e => updateEntry(entry.id, 'source', e.target.value)} placeholder="/path/to/disk.vmdk" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500" /></div>
                  <div><label className="block text-xs text-slate-400 mb-1">Target Format</label><select value={entry.target_format} onChange={e => updateEntry(entry.id, 'target_format', e.target.value)} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"><option value="qcow2">QCOW2</option><option value="raw">RAW</option><option value="vmdk">VMDK</option></select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs text-slate-400 mb-1">vCPUs</label><input type="number" value={entry.cpus} onChange={e => updateEntry(entry.id, 'cpus', Number(e.target.value))} min={1} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" /></div>
                    <div><label className="block text-xs text-slate-400 mb-1">Memory MB</label><input type="number" value={entry.memory} onChange={e => updateEntry(entry.id, 'memory', Number(e.target.value))} min={256} step={256} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" /></div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">JSON Preview ({entries.length} VMs)</span>
            <div className="flex items-center gap-2">
              <button onClick={handleCopy} title="Copy JSON" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors">{copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy'}</button>
              <button onClick={handleDownload} title="Download JSON" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"><Download className="w-3.5 h-3.5" /> Download</button>
            </div>
          </div>
          <pre className="p-4 text-xs text-slate-300 font-mono bg-slate-950 max-h-64 overflow-y-auto whitespace-pre">{json}</pre>
        </div>
      )}
    </div>
  )
}
