// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import { Webhook, Plus, Trash2, Send, RefreshCw } from 'lucide-react';
import { webhookApi } from '../utils/api';
import { formatRelativeTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';

interface Delivery {
  id?: string;
  url?: string;
  event?: string;
  status?: number;
  timestamp?: string;
  response_time_ms?: number;
}

interface WebhookConfig {
  url: string;
  secret: string;
  events: string[];
}

const EVENTS = [
  'vm.created', 'vm.deleted', 'vm.started', 'vm.stopped',
  'snapshot.created', 'backup.completed', 'alert.triggered',
  'migration.started', 'migration.completed',
];

const WEBHOOKS_KEY = 'vmspawnd_webhooks';

function loadWebhooks(): WebhookConfig[] {
  try { return JSON.parse(localStorage.getItem(WEBHOOKS_KEY) || '[]'); } catch { return []; }
}

function saveWebhooks(configs: WebhookConfig[]) {
  localStorage.setItem(WEBHOOKS_KEY, JSON.stringify(configs));
}

export default function Webhooks() {
  const [showForm, setShowForm] = useState(false);
  const [config, setConfig] = useState<WebhookConfig>({ url: '', secret: '', events: [] });
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>(loadWebhooks);
  const [testing, setTesting] = useState<number | null>(null);

  const fetchDeliveries = useCallback(() => webhookApi.listDeliveries() as Promise<Delivery[]>, []);
  const { data: deliveries, loading, refresh } = usePolling(fetchDeliveries, 15000);

  const items = deliveries || [];

  const toggleEvent = (evt: string) => {
    setConfig({
      ...config,
      events: config.events.includes(evt)
        ? config.events.filter(e => e !== evt)
        : [...config.events, evt],
    });
  };

  const addWebhook = () => {
    if (!config.url) return;
    const next = [...webhooks, config];
    setWebhooks(next);
    saveWebhooks(next);
    setConfig({ url: '', secret: '', events: [] });
    setShowForm(false);
  };

  const removeWebhook = (i: number) => {
    const next = webhooks.filter((_, idx) => idx !== i);
    setWebhooks(next);
    saveWebhooks(next);
  };

  const testWebhook = async (i: number) => {
    setTesting(i);
    try {
      await fetch(webhooks[i].url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test', timestamp: new Date().toISOString() }),
      });
    } catch { /* ignore */ }
    setTimeout(() => setTesting(null), 1000);
  };

  if (loading && !deliveries) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Webhooks</h1>
        <div className="flex gap-2">
          <button onClick={refresh}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Add Webhook
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 space-y-4">
          <h3 className="text-base font-semibold text-white">New Webhook</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input value={config.url} onChange={e => setConfig({ ...config, url: e.target.value })}
              placeholder="https://example.com/webhook"
              className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            <input value={config.secret} onChange={e => setConfig({ ...config, secret: e.target.value })}
              placeholder="Secret (optional)" type="password"
              className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-2">Events</label>
            <div className="flex flex-wrap gap-2">
              {EVENTS.map(evt => (
                <button key={evt} onClick={() => toggleEvent(evt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    config.events.includes(evt)
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-900/50 text-slate-400 border border-slate-600 hover:border-slate-500'
                  }`}>{evt}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addWebhook} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">Add</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {webhooks.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-3">
            <Webhook className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-white">Configured Webhooks</h3>
          </div>
          <div className="divide-y divide-slate-700/30">
            {webhooks.map((wh, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm text-white font-mono">{wh.url}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{wh.events.length} events</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => testWebhook(i)} disabled={testing === i}
                    className="p-1.5 text-blue-400 hover:bg-slate-700 rounded transition-colors">
                    <Send className="w-4 h-4" />
                  </button>
                  <button onClick={() => removeWebhook(i)}
                    className="p-1.5 text-red-400 hover:bg-slate-700 rounded transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Webhook className="w-4 h-4 text-white" />
          </div>
          <h3 className="text-lg font-semibold text-white">Delivery History</h3>
          <span className="ml-auto text-xs font-medium text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">{items.length}</span>
        </div>
        {items.length === 0 ? (
          <div className="p-10 text-center">
            <Webhook className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No webhook deliveries recorded</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">URL</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Event</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {items.slice(0, 20).map((d, i) => (
                  <tr key={d.id || i} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-3 text-white font-mono text-xs max-w-xs truncate">{d.url || '-'}</td>
                    <td className="px-4 py-3 text-slate-400">{d.event || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        (d.status || 0) >= 200 && (d.status || 0) < 300 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>{d.status || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{d.timestamp ? formatRelativeTime(d.timestamp) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
