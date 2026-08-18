// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useEffect, useState } from 'react'
import { Plus, Trash2, Copy, Layers } from 'lucide-react'
import {
  listTemplates as fetchTemplates,
  deleteTemplate as removeTemplate,
  deployTemplate,
  createTemplate,
  VMTemplate,
} from '../api/templates'
import { listVMs, VM } from '../api/vm'
import { useToastContext } from '../contexts/ToastContext'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import { useNavigate } from 'react-router'
import { PageHeader, EmptyState } from '../components/ui'
import ErrorBanner from '../components/ErrorBanner'
import { formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'

export default function Templates() {
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<VMTemplate[]>([])
  const [vms, setVMs] = useState<VM[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    setLoadError(null)
    try {
      const [data, vmList] = await Promise.all([fetchTemplates(), listVMs()])
      setTemplates(data)
      setVMs(vmList)
    } catch (error) {
      const msg = formatUserError(error)
      setLoadError(msg)
      toastFailure(toast, 'Failed to load templates', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm('Delete Template', `Delete template '${name}'? This cannot be undone.`, { variant: 'danger', confirmLabel: 'Delete' })
    if (!ok) return

    try {
      await removeTemplate(id)
      toast.success(`Template '${name}' deleted successfully`)
      loadTemplates()
    } catch (_error) {
      toastFailure(toast, `Failed to delete template '${name}'`, _error)
    }
  }

  const handleInstantiate = (templateId: string) => {
    setSelectedTemplate(templateId)
    setShowCreateDialog(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <ErrorBanner
          title="Could not load templates"
          headline={loadError}
          hints={hintsForError(loadError)}
          onRetry={loadTemplates}
        />
      )}
      <PageHeader
        title="VM Templates"
        actions={
          <button
            onClick={() => setShowSaveTemplate(true)}
            disabled={vms.length === 0}
            title={vms.length === 0 ? 'No VMs to create a template from' : undefined}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Create from VM
          </button>
        }
      />

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-sm text-blue-400">
        <p>
          Templates allow you to quickly create new VMs from pre-configured images.
          Create a template from an existing VM to save its configuration.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
          <EmptyState
            icon={<Layers className="w-16 h-16" />}
            title="No templates yet"
            description="Create a template from an existing VM to get started"
            action={
              <button
                onClick={() => vms.length === 0 ? navigate('/vms') : setShowSaveTemplate(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                {vms.length === 0 ? 'Go to VMs' : 'Create from VM'}
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onDelete={() => handleDelete(template.id, template.name)}
              onInstantiate={() => handleInstantiate(template.id)}
            />
          ))}
        </div>
      )}

      {showCreateDialog && selectedTemplate && (
        <CreateVMFromTemplateDialog
          templateId={selectedTemplate}
          onClose={() => {
            setShowCreateDialog(false)
            setSelectedTemplate(null)
          }}
          onSuccess={() => {
            toast.success('VM created from template successfully')
            navigate('/vms')
          }}
        />
      )}

      {showSaveTemplate && (
        <SaveTemplateDialog
          vms={vms}
          onClose={() => setShowSaveTemplate(false)}
          onSuccess={() => {
            toast.success('Template saved')
            setShowSaveTemplate(false)
            loadTemplates()
          }}
        />
      )}

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

function TemplateCard({
  template,
  onDelete,
  onInstantiate,
}: {
  template: VMTemplate
  onDelete: () => void
  onInstantiate: () => void
}) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50 hover:border-slate-700/50 transition">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold mb-2">{template.name}</h3>
          <p className="text-sm text-slate-400">{template.description || 'No description'}</p>
        </div>
      </div>

      <div className="space-y-2 mb-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">CPUs</span>
          <span className="font-medium">{template.cpus}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Memory</span>
          <span className="font-medium">{template.memory} MB</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Disk Size</span>
          <span className="font-medium">{template.disk} GB</span>
        </div>
        {template.tags.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Tags</span>
            <span className="font-medium text-xs">{template.tags.join(', ')}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Created</span>
          <span className="font-medium text-xs">{new Date(template.created).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onInstantiate}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
        >
          <Copy className="w-4 h-4" />
          Create VM
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function CreateVMFromTemplateDialog({
  templateId,
  onClose,
  onSuccess,
}: {
  templateId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const toast = useToastContext()
  const [vmName, setVmName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async () => {
    if (!vmName.trim()) {
      toast.error('Please enter a VM name')
      return
    }

    setIsCreating(true)
    try {
      await deployTemplate(templateId, vmName)
      onSuccess()
      onClose()
    } catch (error) {
      toastFailure(toast, 'Failed to create VM from template', error)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800/50 rounded-lg shadow-2xl border border-slate-700/50 w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
          <h2 className="text-xl font-bold">Create VM from Template</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/[0.03] rounded transition">
            <span className="text-2xl">&times;</span>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">VM Name</label>
            <input
              type="text"
              value={vmName}
              onChange={(e) => setVmName(e.target.value)}
              placeholder="Enter VM name"
              className="w-full bg-slate-800 border border-slate-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-6 border-t border-slate-700/50">
          <button
            onClick={onClose}
            disabled={isCreating}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-600 text-white rounded-lg transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create VM'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SaveTemplateDialog({ vms, onClose, onSuccess }: { vms: VM[]; onClose: () => void; onSuccess: () => void }) {
  const toast = useToastContext()
  const [vmName, setVmName] = useState(vms[0]?.name || '')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      // cpus/memory/disk/image are required by the API shape but ignored by
      // the backend whenever from_vm is set -- it pulls the real config from
      // that VM instead.
      await createTemplate({
        name,
        description: description || undefined,
        from_vm: vmName,
        cpus: 1,
        memory: 0,
        disk: 0,
        image: '',
      })
      onSuccess()
    } catch (error) {
      toastFailure(toast, 'Failed to save template', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800/50 rounded-lg shadow-2xl border border-slate-700/50 w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
          <h2 className="text-xl font-bold">Create Template from VM</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/[0.03] rounded transition">
            <span className="text-2xl">&times;</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Source VM</label>
            <select value={vmName} onChange={e => setVmName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500">
              {vms.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
            <p className="text-xs text-slate-500 mt-1">The template captures this VM's CPU, memory, disk size, image, and tags.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Template Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. web-server-baseline"
              className="w-full bg-slate-800 border border-slate-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500" required autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={submitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-600 text-white rounded-lg transition disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={submitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50">{submitting ? 'Saving...' : 'Save Template'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
