// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useMemo } from 'react';
import { BookOpen, Search, FileText } from 'lucide-react';

const UNIT_EXPLANATIONS: Record<string, { description: string; type: string; docs: string }> = {
  'sshd.service': {
    description: 'OpenSSH server daemon. Provides secure remote login via SSH protocol.',
    type: 'Service',
    docs: 'Listens on port 22 for incoming SSH connections. Managed by systemd.',
  },
  'nginx.service': {
    description: 'Nginx HTTP and reverse proxy server.',
    type: 'Service',
    docs: 'High-performance web server commonly used for serving static content and reverse proxying.',
  },
  'systemd-networkd.service': {
    description: 'Network configuration manager from systemd.',
    type: 'Service',
    docs: 'Manages network interfaces, bridges, VLANs, and other network devices using .network files.',
  },
  'systemd-resolved.service': {
    description: 'Network name resolution manager.',
    type: 'Service',
    docs: 'Provides DNS resolution, LLMNR, and mDNS. Manages /etc/resolv.conf.',
  },
  'systemd-machined.service': {
    description: 'Virtual machine and container registration manager.',
    type: 'Service',
    docs: 'Tracks running VMs and containers. Used by machinectl and systemd-vmspawn.',
  },
  'firewalld.service': {
    description: 'Dynamic firewall daemon.',
    type: 'Service',
    docs: 'Manages firewall rules using zones and services. Supports nftables and iptables backends.',
  },
};

const COMMAND_EXPLANATIONS: Record<string, { description: string; usage: string }> = {
  'systemctl': {
    description: 'Control the systemd system and service manager.',
    usage: 'systemctl [start|stop|restart|status|enable|disable] <unit>',
  },
  'machinectl': {
    description: 'Control the systemd machine manager.',
    usage: 'machinectl [list|show|start|poweroff|login|shell] <machine>',
  },
  'systemd-vmspawn': {
    description: 'Spawn a virtual machine using systemd-machined.',
    usage: 'systemd-vmspawn --image=<image> [--cpus=N] [--ram=SIZE]',
  },
  'journalctl': {
    description: 'Query the systemd journal.',
    usage: 'journalctl [-u unit] [-f] [--since=TIME] [--until=TIME]',
  },
  'networkctl': {
    description: 'Query the status of network links.',
    usage: 'networkctl [list|status|up|down] [LINK]',
  },
};

export default function Explain() {
  const [input, setInput] = useState('');

  const result = useMemo(() => {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return null;

    // Check unit names
    for (const [name, info] of Object.entries(UNIT_EXPLANATIONS)) {
      if (trimmed === name.toLowerCase() || trimmed === name.replace('.service', '').toLowerCase()) {
        return { kind: 'unit' as const, name, ...info };
      }
    }

    // Check commands
    for (const [cmd, info] of Object.entries(COMMAND_EXPLANATIONS)) {
      if (trimmed === cmd.toLowerCase() || trimmed.startsWith(cmd.toLowerCase() + ' ')) {
        return { kind: 'command' as const, name: cmd, ...info };
      }
    }

    // Generic .service pattern
    if (trimmed.endsWith('.service') || trimmed.endsWith('.timer') || trimmed.endsWith('.socket') || trimmed.endsWith('.mount')) {
      const parts = trimmed.split('.');
      const unitType = parts[parts.length - 1];
      return {
        kind: 'unit' as const,
        name: trimmed,
        description: `A systemd ${unitType} unit.`,
        type: unitType.charAt(0).toUpperCase() + unitType.slice(1),
        docs: `This is a systemd ${unitType} unit. Use 'systemctl status ${trimmed}' to check its status.`,
      };
    }

    return { kind: 'unknown' as const, name: trimmed };
  }, [input]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Explain</h1>
        <p className="text-sm text-slate-400 mt-1">Get explanations for systemd units and commands</p>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <label className="block text-sm text-slate-400 mb-2">Enter a systemd unit name or command</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full pl-10 pr-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
            placeholder="e.g. sshd.service, systemctl, machinectl..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {['sshd.service', 'systemd-machined.service', 'systemctl', 'machinectl', 'systemd-vmspawn'].map((ex) => (
            <button
              key={ex}
              onClick={() => setInput(ex)}
              className="px-3 py-1 bg-slate-700/50 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-slate-600/50 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {result && result.kind === 'unit' && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-blue-400" />
            <h3 className="text-white font-medium font-mono">{result.name}</h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
              {'type' in result ? result.type : 'Unit'}
            </span>
          </div>
          <p className="text-slate-300 text-sm mb-3">{'description' in result ? result.description : ''}</p>
          <div className="bg-slate-900/50 rounded-lg p-3">
            <span className="text-xs text-slate-400 uppercase">Documentation</span>
            <p className="text-sm text-slate-300 mt-1">{'docs' in result ? result.docs : ''}</p>
          </div>
        </div>
      )}

      {result && result.kind === 'command' && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-green-400" />
            <h3 className="text-white font-medium font-mono">{result.name}</h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
              Command
            </span>
          </div>
          <p className="text-slate-300 text-sm mb-3">{'description' in result ? result.description : ''}</p>
          <div className="bg-slate-900/50 rounded-lg p-3">
            <span className="text-xs text-slate-400 uppercase">Usage</span>
            <p className="text-sm text-slate-300 mt-1 font-mono">{'usage' in result ? result.usage : ''}</p>
          </div>
        </div>
      )}

      {result && result.kind === 'unknown' && (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          No explanation found for "{result.name}". Try a systemd unit name (e.g. sshd.service) or command (e.g. systemctl).
        </div>
      )}

      {!result && (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          Enter a unit name or command above to see its explanation
        </div>
      )}
    </div>
  );
}
