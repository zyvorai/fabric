// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import React from 'react';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

function SkeletonBase({ className = '', style }: SkeletonProps) {
  return <div className={`skeleton rounded-lg ${className}`} style={style} />;
}

export function SkeletonLine({ className = '' }: SkeletonProps) {
  return <SkeletonBase className={`h-4 ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <SkeletonBase className="h-5 w-36" />
            <SkeletonBase className="h-3 w-24" />
          </div>
          <SkeletonBase className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex gap-4">
          <SkeletonBase className="h-4 w-20" />
          <SkeletonBase className="h-4 w-20" />
        </div>
      </div>
      <div className="px-5 py-3 border-t border-slate-700/50 flex gap-2">
        <SkeletonBase className="h-8 w-16 rounded-md" />
        <SkeletonBase className="h-8 w-16 rounded-md" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
      <div
        className="grid gap-4 p-4 border-b border-slate-700/50"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBase key={i} className="h-3" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="grid gap-4 p-4 border-b border-slate-700/50 last:border-b-0"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: cols }).map((_, col) => (
            <SkeletonBase key={col} className="h-4" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <SkeletonBase className="h-7 w-32" />
        <SkeletonBase className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <SkeletonBase className="h-8 w-8 rounded-lg mb-3" />
            <SkeletonBase className="h-7 w-16 mb-1" />
            <SkeletonBase className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <div className="flex items-center justify-between mb-4">
              <SkeletonBase className="h-4 w-28" />
              <SkeletonBase className="h-5 w-12" />
            </div>
            <div className="flex items-end gap-1.5 h-[180px]">
              {Array.from({ length: 20 }).map((_, j) => (
                <SkeletonBase
                  key={j}
                  className="flex-1 rounded-sm"
                  style={{ height: `${15 + Math.random() * 75}%` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SkeletonDashboard;
