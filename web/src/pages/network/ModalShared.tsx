// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { Trash2, X } from 'lucide-react'
import { formatUserError } from '../../utils/apiError'

export function ModalWrapper({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/[0.03] rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

export function InputField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
      />
    </div>
  )
}

export function HostBadge() {
  return (
    <span className="ml-2 px-2 py-0.5 rounded text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30">
      Host
    </span>
  )
}

export function isHostManaged(item: { id?: string; managed?: boolean }): boolean {
  return item.managed === false || (item.id?.startsWith('host:') ?? false)
}

export function HostManagedActions({
  item,
  onDelete,
  onAdopt,
  stateLabel,
  adoptLabel = 'Adopt',
  readOnly = false,
}: {
  item: { id: string; managed?: boolean; operational_state?: string }
  onDelete: () => void
  onAdopt?: () => void
  stateLabel?: string
  adoptLabel?: string
  readOnly?: boolean
}) {
  if (readOnly) {
    if (isHostManaged(item)) {
      return (
        <span className="text-xs text-slate-500" title="Managed outside vmspawnd">
          {stateLabel ?? item.operational_state ?? 'external'}
        </span>
      )
    }
    return null
  }
  if (isHostManaged(item)) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500" title="Managed outside vmspawnd">
          {stateLabel ?? item.operational_state ?? 'external'}
        </span>
        {onAdopt && (
          <button
            type="button"
            onClick={onAdopt}
            className="px-2 py-1 text-xs rounded bg-amber-600/20 text-amber-300 border border-amber-500/30 hover:bg-amber-600/40 transition"
            title="Import into vmspawnd and write systemd-networkd config"
          >
            {adoptLabel}
          </button>
        )}
      </div>
    )
  }
  return (
    <button onClick={onDelete} className="p-2 hover:bg-red-600 rounded transition" type="button">
      <Trash2 className="w-4 h-4" />
    </button>
  )
}

export function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded bg-slate-800 border-slate-700/50" />
      <span className="text-sm text-slate-300">{label}</span>
    </label>
  )
}

/** User-facing message for network modal submit failures (shared with Network page). */
export function extractErrorMessage(e: unknown): string {
  return formatUserError(e)
}
