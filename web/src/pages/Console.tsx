import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { ArrowLeft, Terminal as TerminalIcon, Monitor } from 'lucide-react'
import Terminal from '../components/Terminal'
import VNCViewer from '../components/VNCViewer'

export default function Console() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'terminal' | 'vnc'>('terminal')

  if (!name) return null

  return (
    <div>
      <button
        onClick={() => navigate(`/vms/${name}`)}
        className="flex items-center gap-2 mb-6 text-slate-400 hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to VM Details
      </button>

      <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
          <h1 className="text-2xl font-bold">Console: {name}</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('terminal')}
              className={`flex items-center gap-2 px-4 py-2 rounded transition ${
                mode === 'terminal'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <TerminalIcon className="w-4 h-4" />
              Terminal
            </button>
            <button
              onClick={() => setMode('vnc')}
              className={`flex items-center gap-2 px-4 py-2 rounded transition ${
                mode === 'vnc'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <Monitor className="w-4 h-4" />
              VNC
            </button>
          </div>
        </div>

        <div className="p-6">
          {mode === 'terminal' ? <Terminal vmName={name} /> : <VNCViewer vmName={name} />}
        </div>
      </div>
    </div>
  )
}
