// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { Cpu, HardDrive } from 'lucide-react';
import { useViewContext } from '../App';
import { getStatusBadgeClasses, formatMemory } from '../utils/format';
import type { VM } from '../types';

interface VMCardProps {
  vm: VM;
}

export default function VMCard({ vm }: VMCardProps) {
  const { navigateTo } = useViewContext();

  return (
    <div
      onClick={() => navigateTo('vmDetails', vm.name)}
      className="bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-slate-600/50 p-5 cursor-pointer transition-all hover:bg-slate-800/70"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-white truncate">{vm.name}</h3>
          {vm.image && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{vm.image}</p>
          )}
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(vm.state)}`}>
          {vm.state}
        </span>
      </div>

      {/* Resources */}
      <div className="flex items-center gap-4 text-sm text-slate-400">
        <div className="flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-slate-500" />
          <span>{vm.cpus} vCPU{vm.cpus !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <HardDrive className="w-3.5 h-3.5 text-slate-500" />
          <span>{formatMemory(vm.memory)}</span>
        </div>
        {vm.ip && (
          <span className="text-slate-500 font-mono text-xs ml-auto">{vm.ip}</span>
        )}
      </div>
    </div>
  );
}
