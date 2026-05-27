// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { networkApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';

interface NetlinkIface {
  index: number;
  name: string;
  mac: string;
  mtu: number;
  state: string;
  link_type: string;
  flags: string[];
  addresses: { address: string; prefix_len: number; family: string; scope: string }[];
  master_index: number | null;
  master_name: string | null;
  kind: string | null;
  speed_mbps: number | null;
}

export default function NetworkTopology() {
  const [selected, setSelected] = useState<string | null>(null);

  const fetchLinks = useCallback(() => networkApi.listNetlinkInterfaces() as Promise<NetlinkIface[]>, []);
  const { data: links, loading, refresh } = usePolling(fetchLinks, 15000);

  const items = links || [];

  const GlobeIcon = ({ size = 40, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );

  if (loading && !links) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Network Topology</h1>
        <button onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {items.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-12 border border-slate-700/50 text-center">
          <GlobeIcon size={48} className="mx-auto text-slate-600 mb-4" />
          <p className="text-slate-400 text-sm">No network links discovered</p>
          <p className="text-slate-500 text-xs mt-1">Links will appear here once networkd reports them.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.filter(l => l.name !== 'lo').map((link) => {
            const isSelected = selected === link.name;
            const kindLabel = link.kind || link.link_type;
            const ipv4 = link.addresses.filter(a => a.family === 'inet');
            return (
              <button key={link.name} onClick={() => setSelected(isSelected ? null : link.name)}
                className={`bg-slate-800/50 rounded-xl p-5 border text-left transition-all ${
                  isSelected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-700/50 hover:border-slate-600'
                }`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                    <GlobeIcon size={20} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">{link.name}</div>
                    <div className="text-xs text-slate-400">{kindLabel}{link.speed_mbps ? ` — ${link.speed_mbps} Mbps` : ''}</div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    link.state === 'up' ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${link.state === 'up' ? 'bg-green-500' : 'bg-slate-500'}`} />
                    {link.state}
                  </span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">MAC</span>
                    <span className="text-slate-300 font-mono">{link.mac || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">MTU</span>
                    <span className="text-slate-300">{link.mtu}</span>
                  </div>
                  {ipv4.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">IPv4</span>
                      <span className="text-slate-300 font-mono">{ipv4.map(a => `${a.address}/${a.prefix_len}`).join(', ')}</span>
                    </div>
                  )}
                  {link.master_name && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Master</span>
                      <span className="text-blue-400">{link.master_name}</span>
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {link.flags.map(f => (
                    <span key={f} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700/50 text-slate-400">{f}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-base font-semibold text-white mb-3">Link Details: {selected}</h3>
          {(() => {
            const link = items.find(l => l.name === selected);
            if (!link) return <p className="text-slate-400 text-sm">Not found</p>;
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Index', value: link.index },
                    { label: 'Type', value: link.kind || link.link_type },
                    { label: 'State', value: link.state },
                    { label: 'MTU', value: link.mtu },
                    { label: 'MAC', value: link.mac || '-' },
                    { label: 'Speed', value: link.speed_mbps ? `${link.speed_mbps} Mbps` : '-' },
                    { label: 'Master', value: link.master_name || '-' },
                    { label: 'Flags', value: link.flags.join(', ') },
                  ].map(item => (
                    <div key={item.label} className="bg-slate-900/50 rounded-lg p-3">
                      <div className="text-xs text-slate-500 mb-1">{item.label}</div>
                      <div className="text-sm text-white font-mono truncate">{item.value}</div>
                    </div>
                  ))}
                </div>
                {link.addresses.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-300 mb-2">Addresses</h4>
                    <div className="space-y-1">
                      {link.addresses.map((addr, i) => (
                        <div key={i} className="flex items-center gap-3 text-sm bg-slate-900/50 rounded-lg px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${addr.family === 'inet' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>{addr.family}</span>
                          <span className="text-white font-mono">{addr.address}/{addr.prefix_len}</span>
                          <span className="text-slate-500 text-xs">{addr.scope}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
