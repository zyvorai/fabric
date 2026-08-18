// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect } from 'react'
import { Plus, Trash2, Copy, Check } from 'lucide-react'
import { PageHeader } from '../components/ui'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'

interface MigrationTemplate { id: string; name: string; description: string; format: string; cpus: number; memory: number; network: string; compress: boolean; created_at: string }

const STORAGE_KEY = 'vmspawnd_migration_templates'

const BUILTIN_TEMPLATES: MigrationTemplate[] = [
  { id: 'builtin-linux-prod', name: 'Production Linux', description: 'Standard production Linux VM migration', format: 'qcow2', cpus: 4, memory: 8192, network: 'bridge', compress: true, created_at: '' },
  { id: 'builtin-linux-dev', name: 'Dev/Test Linux', description: 'Quick lightweight migration for development', format: 'qcow2', cpus: 2, memory: 2048, network: 'user', compress: false, created_at: '' },
  { id: 'builtin-windows', name: 'Windows Server', description: 'Windows Server with virtio drivers', format: 'qcow2', cpus: 4, memory: 16384, network: 'bridge', compress: true, created_at: '' },
]

function loadCustomTemplates(): MigrationTemplate[] { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] } }
function saveCustomTemplates(templates: MigrationTemplate[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(templates)) }

export default function MigrationTemplates() {
  const { confirmState, confirm, cancel } = useConfirm()
  const [custom, setCustom] = useState<MigrationTemplate[]>(loadCustomTemplates)
  const [showAdd, setShowAdd] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [newTemplate, setNewTemplate] = useState<Partial<MigrationTemplate>>({ format: 'qcow2', cpus: 2, memory: 2048, network: 'user', compress: false })

  useEffect(() => { saveCustomTemplates(custom) }, [custom])

  const allTemplates = [...BUILTIN_TEMPLATES, ...custom]

  const handleAdd = () => {
    if (!newTemplate.name) return
    const tmpl: MigrationTemplate = { id: `custom-${Date.now()}`, name: newTemplate.name || '', description: newTemplate.description || '', format: newTemplate.format || 'qcow2', cpus: newTemplate.cpus || 2, memory: newTemplate.memory || 2048, network: newTemplate.network || 'user', compress: newTemplate.compress || false, created_at: new Date().toISOString() }
    setCustom(prev => [...prev, tmpl])
    setNewTemplate({ format: 'qcow2', cpus: 2, memory: 2048, network: 'user', compress: false })
    setShowAdd(false)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!await confirm('Delete Template', `Delete migration template '${name}'?`, { variant: 'danger', confirmLabel: 'Delete' })) return
    setCustom(prev => prev.filter(t => t.id !== id))
  }
  const handleCopy = (tmpl: MigrationTemplate) => {
    const text = JSON.stringify({ name: tmpl.name, format: tmpl.format, cpus: tmpl.cpus, memory_mb: tmpl.memory, network: tmpl.network, compress: tmpl.compress }, null, 2)
    navigator.clipboard.writeText(text)
    setCopied(tmpl.id); setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Migration Templates"
        description="Reusable migration configurations"
        primaryAction={
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            title="Create new template"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> New Template
          </button>
        }
      />

      {showAdd && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-300">New Template</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs text-slate-400 mb-1">Name</label><input type="text" value={newTemplate.name || ''} onChange={e => setNewTemplate(p => ({ ...p, name: e.target.value }))} placeholder="My Template" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Description</label><input type="text" value={newTemplate.description || ''} onChange={e => setNewTemplate(p => ({ ...p, description: e.target.value }))} placeholder="Description" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Format</label><select value={newTemplate.format} onChange={e => setNewTemplate(p => ({ ...p, format: e.target.value }))} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"><option value="qcow2">QCOW2</option><option value="raw">RAW</option><option value="vmdk">VMDK</option></select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-slate-400 mb-1">vCPUs</label><input type="number" value={newTemplate.cpus} onChange={e => setNewTemplate(p => ({ ...p, cpus: Number(e.target.value) }))} min={1} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" /></div>
              <div><label className="block text-xs text-slate-400 mb-1">Memory MB</label><input type="number" value={newTemplate.memory} onChange={e => setNewTemplate(p => ({ ...p, memory: Number(e.target.value) }))} min={256} step={256} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" /></div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"><Plus className="w-4 h-4 inline mr-1" />Add</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {allTemplates.map(tmpl => {
          const isBuiltin = tmpl.id.startsWith('builtin-')
          return (
            <div key={tmpl.id} className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.01]">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-white">{tmpl.name}</h3>
                  {isBuiltin && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">Built-in</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleCopy(tmpl)} title="Copy config" className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors">{copied === tmpl.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}</button>
                  {!isBuiltin && <button onClick={() => handleDelete(tmpl.id, tmpl.name)} title="Delete template" className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              </div>
              {tmpl.description && <p className="text-xs text-slate-400 mb-3">{tmpl.description}</p>}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-900/50 rounded-lg px-2 py-1.5"><span className="text-slate-500">Format</span><div className="text-slate-200 font-medium">{tmpl.format.toUpperCase()}</div></div>
                <div className="bg-slate-900/50 rounded-lg px-2 py-1.5"><span className="text-slate-500">CPU</span><div className="text-slate-200 font-medium">{tmpl.cpus} vCPU</div></div>
                <div className="bg-slate-900/50 rounded-lg px-2 py-1.5"><span className="text-slate-500">Memory</span><div className="text-slate-200 font-medium">{tmpl.memory} MB</div></div>
                <div className="bg-slate-900/50 rounded-lg px-2 py-1.5"><span className="text-slate-500">Network</span><div className="text-slate-200 font-medium capitalize">{tmpl.network}</div></div>
              </div>
            </div>
          )
        })}
      </div>

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          variant={confirmState.variant}
          onConfirm={confirmState.onConfirm}
          onCancel={cancel}
        />
      )}
    </div>
  )
}
