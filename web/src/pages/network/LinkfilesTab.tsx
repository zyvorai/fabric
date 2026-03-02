import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import * as api from '../../api/networkd'
import type { LinkFileConfig, CreateLinkFileRequest } from '../../api/networkd'
import { ModalWrapper, InputField, extractErrorMessage } from './ModalShared'

interface LinkfilesTabProps {
  linkfiles: LinkFileConfig[]
  onDelete: (id: string) => void
  onCreate: () => void
}

function LinkfilesTabContent({ linkfiles, onDelete, onCreate }: LinkfilesTabProps) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <div className="p-6 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Link Configuration (.link)</h2>
        <button onClick={onCreate} className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white py-2 px-4 rounded-lg transition text-sm">
          <Plus className="w-4 h-4" /> Create Link File
        </button>
      </div>
      {linkfiles.length === 0 ? (
        <div className="p-12 text-center text-gray-400">No link files configured. Use these to rename interfaces, set MTU, MAC, or Wake-on-LAN.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4 font-medium text-gray-300">Match</th>
                <th className="text-left p-4 font-medium text-gray-300">Rename To</th>
                <th className="text-left p-4 font-medium text-gray-300">MTU</th>
                <th className="text-left p-4 font-medium text-gray-300">MAC Override</th>
                <th className="text-left p-4 font-medium text-gray-300">WoL</th>
                <th className="text-left p-4 font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {linkfiles.map(l => (
                <tr key={l.id} className="hover:bg-gray-700 transition">
                  <td className="p-4 font-mono text-sm text-gray-400">
                    {l.match_mac ?? l.match_original_name ?? l.match_driver ?? l.match_path ?? '-'}
                  </td>
                  <td className="p-4 font-medium">{l.name ?? '-'}</td>
                  <td className="p-4 text-gray-400">{l.mtu ?? '-'}</td>
                  <td className="p-4 text-gray-400 font-mono text-sm">{l.mac_address ?? '-'}</td>
                  <td className="p-4 text-gray-400">{l.wake_on_lan ?? '-'}</td>
                  <td className="p-4">
                    <button onClick={() => onDelete(l.id)} className="p-2 hover:bg-red-600 rounded transition">
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

export function CreateLinkfileModal({ onClose, onCreated }: { onClose: () => void; onCreated: (l: LinkFileConfig) => void }) {
  const [matchMac, setMatchMac] = useState('')
  const [matchOrigName, setMatchOrigName] = useState('')
  const [name, setName] = useState('')
  const [mtu, setMtu] = useState('')
  const [macAddress, setMacAddress] = useState('')
  const [wol, setWol] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!matchMac.trim() && !matchOrigName.trim()) { setErr('At least one match criterion is required (MAC or original name)'); return }
    setSubmitting(true)
    setErr('')
    try {
      const req: CreateLinkFileRequest = {
        match_mac: matchMac.trim() || undefined,
        match_original_name: matchOrigName.trim() || undefined,
        name: name.trim() || undefined,
        mtu: mtu ? parseInt(mtu) : undefined,
        mac_address: macAddress.trim() || undefined,
        wake_on_lan: wol.trim() || undefined,
      }
      const linkfile = await api.createLinkFile(req)
      onCreated(linkfile)
    } catch (e: unknown) {
      setErr(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title="Create Link File" onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Match MAC Address" value={matchMac} onChange={setMatchMac} placeholder="00:11:22:33:44:55" />
        <InputField label="Match Original Name" value={matchOrigName} onChange={setMatchOrigName} placeholder="en*" />
        <InputField label="Rename To" value={name} onChange={setName} placeholder="lan0" />
        <InputField label="MTU" value={mtu} onChange={setMtu} placeholder="9000" type="number" />
        <InputField label="Override MAC Address" value={macAddress} onChange={setMacAddress} placeholder="52:54:00:aa:bb:cc" />
        <InputField label="Wake-on-LAN" value={wol} onChange={setWol} placeholder="magic" />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg transition">
          {submitting ? 'Creating...' : 'Create Link File'}
        </button>
      </div>
    </ModalWrapper>
  )
}

export default LinkfilesTabContent
