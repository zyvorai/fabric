import { useState } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import * as api from '../../api/network-security'
import type { Service, CreateServiceRequest, LoadBalancerAlgorithm } from '../../api/network-security'
import { ModalWrapper, InputField, extractErrorMessage } from '../network/ModalShared'
import { LabelSelectorInput, LabelTags, StatusBadge } from './ModalShared'

interface ServicesTabProps {
  services: Service[]
  onDelete: (id: string) => void
  onCreate: () => void
  onSync: () => void
}

function ServicesTabContent({ services, onDelete, onCreate, onSync }: ServicesTabProps) {
  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Service Mesh</h2>
        <div className="flex gap-2">
          <button onClick={onSync} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition text-sm">
            <RefreshCw className="w-4 h-4" /> Sync
          </button>
          <button onClick={onCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition text-sm">
            <Plus className="w-4 h-4" /> Add Service
          </button>
        </div>
      </div>
      {services.length === 0 ? (
        <div className="p-12 text-center text-slate-400">No services configured. Create one to define virtual IP load-balanced services.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-left p-4 font-medium text-slate-300">Name</th>
                <th className="text-left p-4 font-medium text-slate-300">Virtual IP</th>
                <th className="text-left p-4 font-medium text-slate-300">Port</th>
                <th className="text-left p-4 font-medium text-slate-300">Algorithm</th>
                <th className="text-left p-4 font-medium text-slate-300">Backends</th>
                <th className="text-left p-4 font-medium text-slate-300">Labels</th>
                <th className="text-left p-4 font-medium text-slate-300">Status</th>
                <th className="text-left p-4 font-medium text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {services.map(s => (
                <tr key={s.id} className="hover:bg-white/[0.03] transition">
                  <td className="p-4">
                    <div className="font-medium">{s.name}</div>
                    {s.description && <div className="text-xs text-slate-500 mt-1">{s.description}</div>}
                  </td>
                  <td className="p-4 font-mono text-sm text-blue-400">{s.virtual_ip}</td>
                  <td className="p-4 font-mono text-sm">{s.port}/{s.protocol}</td>
                  <td className="p-4">
                    <StatusBadge status={s.algorithm} color="blue" />
                  </td>
                  <td className="p-4 font-medium text-cyan-400">{s.backends.length}</td>
                  <td className="p-4"><LabelTags labels={s.labels} /></td>
                  <td className="p-4">
                    <StatusBadge status={s.enabled ? 'active' : 'disabled'} color={s.enabled ? 'green' : 'gray'} />
                  </td>
                  <td className="p-4">
                    <button onClick={() => onDelete(s.id)} className="p-2 hover:bg-red-600 rounded transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function CreateServiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: Service) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [virtualIp, setVirtualIp] = useState('')
  const [port, setPort] = useState('')
  const [protocol, setProtocol] = useState('tcp')
  const [algorithm, setAlgorithm] = useState<LoadBalancerAlgorithm>('round-robin')
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!name.trim() || !virtualIp.trim() || !port) { setErr('Name, Virtual IP, and Port are required'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateServiceRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        virtual_ip: virtualIp.trim(),
        port: parseInt(port),
        protocol,
        algorithm,
        labels: Object.keys(labels).length > 0 ? labels : undefined,
      }
      const s = await api.createService(req)
      onCreated(s)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create Service" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Name" value={name} onChange={setName} placeholder="web-frontend" />
        <InputField label="Description" value={description} onChange={setDescription} placeholder="Web frontend service" />
        <InputField label="Virtual IP" value={virtualIp} onChange={setVirtualIp} placeholder="10.0.0.100" />
        <div className="grid grid-cols-2 gap-2">
          <InputField label="Port" value={port} onChange={setPort} placeholder="80" type="number" />
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Protocol</label>
            <select value={protocol} onChange={e => setProtocol(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Algorithm</label>
          <select value={algorithm} onChange={e => setAlgorithm(e.target.value as LoadBalancerAlgorithm)} className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
            <option value="round-robin">Round Robin</option>
            <option value="least-conn">Least Connections</option>
            <option value="random">Random</option>
            <option value="ip-hash">IP Hash</option>
          </select>
        </div>
        <LabelSelectorInput labels={labels} onChange={setLabels} />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create Service'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export default ServicesTabContent
