// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

export const DEFAULT_PAGE_SIZE = 25

export type NetfileTypeFilter = 'all' | 'physical' | 'container'

export function netfileTypeOf(description?: string, matchName?: string): 'physical' | 'container' {
  if (description?.toLowerCase().includes('container')) return 'container'
  const name = matchName ?? ''
  if (name.startsWith('lxc') || name.startsWith('veth')) return 'container'
  return 'physical'
}

interface ListControlsProps {
  search: string
  onSearchChange: (v: string) => void
  searchPlaceholder?: string
  typeFilter?: NetfileTypeFilter
  onTypeFilterChange?: (v: NetfileTypeFilter) => void
  showTypeFilters?: boolean
  total: number
  filtered: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  showAll: boolean
  onShowAllChange: (v: boolean) => void
}

export function ListControls({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  typeFilter = 'all',
  onTypeFilterChange,
  showTypeFilters = false,
  total,
  filtered,
  page,
  pageSize,
  onPageChange,
  showAll,
  onShowAllChange,
}: ListControlsProps) {
  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(filtered / pageSize))
  const safePage = Math.min(page, totalPages)

  return (
    <div className="p-4 border-b border-[#d2d2d7] space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={e => {
            onSearchChange(e.target.value)
            onPageChange(1)
          }}
          placeholder={searchPlaceholder}
          className="flex-1 bg-white border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] placeholder-[#6e6e73] focus:outline-none focus:border-blue-500"
        />
        {showTypeFilters && onTypeFilterChange && (
          <div className="flex gap-1 shrink-0">
            {(['all', 'physical', 'container'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  onTypeFilterChange(t)
                  onPageChange(1)
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  typeFilter === t
                    ? 'bg-yellow-600/30 text-yellow-300 border border-yellow-500/40'
                    : 'bg-white text-[#6e6e73] border border-[#d2d2d7] hover:text-[#1d1d1f]'
                }`}
              >
                {t === 'all' ? 'All' : t === 'physical' ? 'Physical' : 'Container'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6e6e73]">
        <span>
          Showing {filtered} of {total}
          {!showAll && filtered > pageSize && (
            <> · page {safePage} of {totalPages}</>
          )}
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showAll}
              onChange={e => onShowAllChange(e.target.checked)}
              className="rounded border-[#d2d2d7]"
            />
            Show all
          </label>
          {!showAll && totalPages > 1 && (
            <>
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => onPageChange(safePage - 1)}
                className="px-2 py-1 rounded bg-white disabled:opacity-40 hover:bg-black/[0.04]"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => onPageChange(safePage + 1)}
                className="px-2 py-1 rounded bg-white disabled:opacity-40 hover:bg-black/[0.04]"
              >
                Next
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function paginateSlice<T>(items: T[], page: number, pageSize: number, showAll: boolean): T[] {
  if (showAll) return items
  const start = (page - 1) * pageSize
  return items.slice(start, start + pageSize)
}
