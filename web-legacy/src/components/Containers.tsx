// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { Box } from 'lucide-react';

/** Containers previously listed systemd-machined class=container entries. That API is gone. */
export default function Containers() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Box className="w-7 h-7 text-cyan-400" />
          Containers
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          systemd-machined / machinectl surface removed — use Virtual Machines (FluxVM) instead.
        </p>
      </div>
      <div className="rounded-xl border border-slate-700/50 p-8 text-center text-slate-400">
        No container listing via machined. Manage VMs under the VMs view or `/api/vms`.
      </div>
    </div>
  );
}
