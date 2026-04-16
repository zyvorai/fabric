import { useState } from 'react'
import { Plus, X } from 'lucide-react'

/** Cilium-style label selector: key=value tag editor */
export function LabelSelectorInput({
  labels,
  onChange,
}: {
  labels: Record<string, string>
  onChange: (labels: Record<string, string>) => void
}) {
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')

  const handleAdd = () => {
    const k = key.trim()
    const v = value.trim()
    if (!k) return
    onChange({ ...labels, [k]: v })
    setKey('')
    setValue('')
  }

  const handleRemove = (k: string) => {
    const next = { ...labels }
    delete next[k]
    onChange(next)
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">Label Selectors</label>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder="key"
          className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
        />
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="value"
          className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition text-sm"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
      {Object.keys(labels).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(labels).map(([k, v]) => (
            <span
              key={k}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30"
            >
              {k}={v}
              <button type="button" onClick={() => handleRemove(k)} className="hover:text-red-400 transition">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Colored status badge */
export function StatusBadge({ status, color }: { status: string; color?: string }) {
  const colorMap: Record<string, string> = {
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    gray: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  }
  const c = colorMap[color ?? 'blue'] ?? colorMap.blue
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium border ${c}`}>
      {status}
    </span>
  )
}

/** Render label tags inline */
export function LabelTags({ labels }: { labels: Record<string, string> }) {
  const entries = Object.entries(labels)
  if (entries.length === 0) return <span className="text-slate-500 text-sm">none</span>
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <span
          key={k}
          className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30"
        >
          {k}={v}
        </span>
      ))}
    </div>
  )
}
