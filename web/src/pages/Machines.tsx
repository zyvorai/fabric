import { useEffect, useState } from 'react'
import {
  Server, Terminal, Key, Download, Power, RotateCw, XCircle,
  HardDrive, RefreshCw, Trash2,
} from 'lucide-react'
import {
  listMachines, getMachineProperties, shellMachine, getSshInfo,
  poweroffMachine, rebootMachine, terminateMachine,
  listMachineImages, pullRawImage, removeMachineImage,
  MachineInfo, MachineImage, ShellOutput, SshInfo,
} from '../api/machines'
import { useToastContext } from '../contexts/ToastContext'

export default function Machines() {
  const toast = useToastContext()
  const [machines, setMachines] = useState<MachineInfo[]>([])
  const [images, setImages] = useState<MachineImage[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'machines' | 'images'>('machines')
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null)
  const [machineProps, setMachineProps] = useState<Record<string, string>>({})
  const [shellCmd, setShellCmd] = useState('')
  const [shellOutput, setShellOutput] = useState<ShellOutput | null>(null)
  const [sshInfo, setSshInfo] = useState<SshInfo | null>(null)
  const [pullUrl, setPullUrl] = useState('')
  const [pullName, setPullName] = useState('')

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 10000)
    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    try {
      const [m, i] = await Promise.all([
        listMachines().catch(() => []),
        listMachineImages().catch(() => []),
      ])
      setMachines(m)
      setImages(i)
    } finally {
      setLoading(false)
    }
  }

  const selectMachine = async (name: string) => {
    setSelectedMachine(name)
    setShellOutput(null)
    try {
      const [props, ssh] = await Promise.all([
        getMachineProperties(name).catch(() => ({})),
        getSshInfo(name).catch(() => null),
      ])
      setMachineProps(props)
      setSshInfo(ssh)
    } catch { /* ignore */ }
  }

  const runShell = async () => {
    if (!selectedMachine || !shellCmd.trim()) return
    try {
      const out = await shellMachine(selectedMachine, shellCmd)
      setShellOutput(out)
    } catch (e) {
      toast.error(`Shell failed: ${e}`)
    }
  }

  const handlePullImage = async () => {
    if (!pullUrl || !pullName) return
    try {
      await pullRawImage(pullUrl, pullName)
      toast.success(`Pulling image '${pullName}'...`)
      setPullUrl('')
      setPullName('')
      loadData()
    } catch (e) {
      toast.error(`Pull failed: ${e}`)
    }
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Server className="w-8 h-8" />
          Machines
        </h1>
        <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-600 rounded-lg transition">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 flex gap-4">
        <button onClick={() => setActiveTab('machines')} className={`px-4 py-3 border-b-2 transition ${activeTab === 'machines' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400'}`}>
          Running Machines ({machines.length})
        </button>
        <button onClick={() => setActiveTab('images')} className={`px-4 py-3 border-b-2 transition ${activeTab === 'images' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400'}`}>
          <HardDrive className="w-4 h-4 inline mr-2" />Images ({images.length})
        </button>
      </div>

      {activeTab === 'machines' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Machine list */}
          <div className="space-y-3">
            {machines.length === 0 ? (
              <div className="text-center py-8 bg-gray-900 rounded-lg border border-gray-800">
                <Server className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                <p className="text-gray-400">No running machines</p>
              </div>
            ) : machines.map(m => (
              <button key={m.name} onClick={() => selectMachine(m.name)}
                className={`w-full text-left p-4 rounded-lg border transition ${selectedMachine === m.name ? 'bg-blue-500/10 border-blue-500/30' : 'bg-gray-900 border-gray-800 hover:border-gray-800'}`}>
                <div className="font-bold">{m.name}</div>
                <div className="text-xs text-gray-400">{m.class} / {m.service}</div>
              </button>
            ))}
          </div>

          {/* Machine detail panel */}
          {selectedMachine && (
            <div className="lg:col-span-2 space-y-4">
              {/* Actions */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-lg">{selectedMachine}</h3>
                  <div className="flex gap-2">
                    <button onClick={async () => { await rebootMachine(selectedMachine); toast.success('Rebooting...'); loadData() }}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm flex items-center gap-1"><RotateCw className="w-3 h-3" />Reboot</button>
                    <button onClick={async () => { await poweroffMachine(selectedMachine); toast.success('Powering off...'); loadData() }}
                      className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-sm flex items-center gap-1"><Power className="w-3 h-3" />Poweroff</button>
                    <button onClick={async () => { await terminateMachine(selectedMachine); toast.success('Terminated'); loadData(); setSelectedMachine(null) }}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm flex items-center gap-1"><XCircle className="w-3 h-3" />Kill</button>
                  </div>
                </div>

                {/* SSH info */}
                {sshInfo?.ssh_command && (
                  <div className="bg-gray-900 rounded p-3 mb-3">
                    <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Key className="w-3 h-3" /> SSH Command</div>
                    <code className="text-sm text-green-400 font-mono">{sshInfo.ssh_command}</code>
                  </div>
                )}

                {/* Properties */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {['State', 'Leader', 'Class', 'Service', 'VSockCID'].map(key => (
                    machineProps[key] && (
                      <div key={key}>
                        <span className="text-gray-400">{key}: </span>
                        <span className="font-mono">{machineProps[key]}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>

              {/* Shell */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
                <h4 className="font-medium mb-3 flex items-center gap-2"><Terminal className="w-4 h-4" /> Shell</h4>
                <div className="flex gap-2 mb-3">
                  <input value={shellCmd} onChange={e => setShellCmd(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && runShell()}
                    placeholder="Enter command..." className="flex-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:border-blue-500" />
                  <button onClick={runShell} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm">Run</button>
                </div>
                {shellOutput && (
                  <div className="bg-gray-900 rounded p-3 font-mono text-xs max-h-64 overflow-auto">
                    {shellOutput.stdout && <pre className="text-gray-300 whitespace-pre-wrap">{shellOutput.stdout}</pre>}
                    {shellOutput.stderr && <pre className="text-red-400 whitespace-pre-wrap">{shellOutput.stderr}</pre>}
                    <div className="text-gray-500 mt-2 border-t border-gray-800 pt-1">exit code: {shellOutput.exit_code}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'images' && (
        <div className="space-y-4">
          {/* Pull image */}
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <h3 className="font-medium mb-3 flex items-center gap-2"><Download className="w-4 h-4" /> Pull Image</h3>
            <div className="flex gap-2">
              <input value={pullUrl} onChange={e => setPullUrl(e.target.value)} placeholder="Image URL (https://...)"
                className="flex-1 bg-gray-800 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              <input value={pullName} onChange={e => setPullName(e.target.value)} placeholder="Name"
                className="w-48 bg-gray-800 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              <button onClick={handlePullImage} disabled={!pullUrl || !pullName}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm disabled:opacity-50">Pull</button>
            </div>
          </div>

          {/* Image list */}
          <div className="bg-gray-900 rounded-lg border border-gray-800">
            <table className="w-full">
              <thead className="bg-gray-800">
                <tr>
                  <th className="text-left p-4 font-medium text-gray-300">Name</th>
                  <th className="text-left p-4 font-medium text-gray-300">Type</th>
                  <th className="text-left p-4 font-medium text-gray-300">Size</th>
                  <th className="text-left p-4 font-medium text-gray-300">Read-Only</th>
                  <th className="text-left p-4 font-medium text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {images.map(img => (
                  <tr key={img.name} className="hover:bg-white/[0.03]/50">
                    <td className="p-4 font-medium">{img.name}</td>
                    <td className="p-4 text-gray-400">{img.image_type}</td>
                    <td className="p-4 font-mono text-sm">{img.size}</td>
                    <td className="p-4">{img.read_only ? 'Yes' : 'No'}</td>
                    <td className="p-4">
                      <button onClick={async () => { await removeMachineImage(img.name); toast.success(`Removed '${img.name}'`); loadData() }}
                        className="p-2 bg-red-600 hover:bg-red-700 rounded"><Trash2 className="w-3 h-3" /></button>
                    </td>
                  </tr>
                ))}
                {images.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-400">No images found in /var/lib/machines</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
