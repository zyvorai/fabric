// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode, UIEventHandler, Ref } from 'react'

type AppleTerminalFrameProps = {
  title: string
  live?: boolean
  trailing?: ReactNode
  /** Height / scroll container class for the body (default max-h). */
  bodyClassName?: string
  className?: string
  children?: ReactNode
  bodyRef?: Ref<HTMLDivElement>
  onBodyScroll?: UIEventHandler<HTMLDivElement>
  empty?: boolean
  emptyMessage?: string
}

/** macOS Terminal.app-style chrome: traffic lights + near-black body. */
export function AppleTerminalFrame({
  title,
  live,
  trailing,
  bodyClassName = 'max-h-[36rem] overflow-y-auto px-3 py-2',
  className = '',
  children,
  bodyRef,
  onBodyScroll,
  empty,
  emptyMessage = 'No output yet',
}: AppleTerminalFrameProps) {
  return (
    <div
      className={`rounded-xl overflow-hidden border border-black/40 shadow-lg shadow-black/20 bg-[#1c1c1e] ${className}`.trim()}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-[#2c2c2e]">
        <span className="w-3 h-3 rounded-full bg-[#ff5f57]" aria-hidden />
        <span className="w-3 h-3 rounded-full bg-[#febc2e]" aria-hidden />
        <span className="w-3 h-3 rounded-full bg-[#28c840]" aria-hidden />
        <span className="ml-3 text-xs text-white/50 font-medium truncate tracking-wide min-w-0 flex-1">
          {title}
        </span>
        {live && (
          <span className="text-[10px] uppercase tracking-wider text-[#28c840] shrink-0">Live</span>
        )}
        {trailing}
      </div>
      <div
        ref={bodyRef}
        onScroll={onBodyScroll}
        className={`font-mono text-[12px] leading-[1.45] text-[#f5f5f7] selection:bg-[#0a84ff]/40 ${bodyClassName}`}
        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
      >
        {empty ? (
          <div className="p-8 text-center text-white/40 text-sm">{emptyMessage}</div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

export const TERM_LEVEL_COLOR: Record<string, string> = {
  INFO: '#64d2ff',
  info: '#64d2ff',
  WARN: '#ffd60a',
  WARNING: '#ffd60a',
  warning: '#ffd60a',
  ERROR: '#ff453a',
  error: '#ff453a',
  CRITICAL: '#ff453a',
  DEBUG: '#8e8e93',
  debug: '#8e8e93',
}
