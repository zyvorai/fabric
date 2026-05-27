// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react';
import { Code2, Send, ChevronRight } from 'lucide-react';

const PRESETS = [
  { method: 'GET', url: '/api/vms', label: 'List VMs' },
  { method: 'GET', url: '/api/machines', label: 'List Machines' },
  { method: 'GET', url: '/api/storage/pools', label: 'Storage Pools' },
  { method: 'GET', url: '/api/networkd/links', label: 'Network Links' },
  { method: 'GET', url: '/api/networkd/bridges', label: 'Network Bridges' },
  { method: 'GET', url: '/api/snapshots', label: 'Snapshots' },
  { method: 'GET', url: '/api/audit/logs', label: 'Audit Logs' },
  { method: 'GET', url: '/api/plugins', label: 'Plugins' },
  { method: 'GET', url: '/api/schedules', label: 'Schedules' },
  { method: 'GET', url: '/api/system/capacity', label: 'System Capacity' },
  { method: 'POST', url: '/api/vms', label: 'Create VM' },
  { method: 'GET', url: '/health', label: 'Health Check' },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-500/20 text-green-400',
  POST: 'bg-blue-500/20 text-blue-400',
  PUT: 'bg-yellow-500/20 text-yellow-400',
  DELETE: 'bg-red-500/20 text-red-400',
};

export default function APIPlayground() {
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('/api/vms');
  const [body, setBody] = useState('');
  const [response, setResponse] = useState<{ status: number; body: string } | null>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const token = sessionStorage.getItem('vmspawnd_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (body && (method === 'POST' || method === 'PUT')) headers['Content-Type'] = 'application/json';

      const res = await fetch(url, {
        method,
        headers,
        body: (method === 'POST' || method === 'PUT') && body ? body : undefined,
      });
      const text = await res.text();
      let formatted = text;
      try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not json */ }
      setResponse({ status: res.status, body: formatted });
    } catch (err) {
      setResponse({ status: 0, body: String(err) });
    } finally {
      setSending(false);
    }
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setMethod(preset.method);
    setUrl(preset.url);
    setBody('');
    setResponse(null);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">API Playground</h1>

      <div className="grid grid-cols-12 gap-4">
        {/* Sidebar */}
        <div className="col-span-12 lg:col-span-3">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50">
              <h3 className="text-sm font-semibold text-white">Presets</h3>
            </div>
            <div className="p-2 space-y-0.5 max-h-96 overflow-y-auto">
              {PRESETS.map((p, i) => (
                <button key={i} onClick={() => applyPreset(p)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-700/50 transition-colors text-left">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${METHOD_COLORS[p.method]}`}>{p.method}</span>
                  <span className="text-xs text-slate-300 truncate flex-1">{p.label}</span>
                  <ChevronRight className="w-3 h-3 text-slate-500" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main area */}
        <div className="col-span-12 lg:col-span-9 space-y-4">
          {/* Request */}
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 space-y-4">
            <div className="flex gap-2">
              <select value={method} onChange={e => setMethod(e.target.value)}
                className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option>
              </select>
              <input value={url} onChange={e => setUrl(e.target.value)}
                className="flex-1 bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono" />
              <button onClick={send} disabled={sending}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
                <Send className="w-4 h-4" /> {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
            {(method === 'POST' || method === 'PUT') && (
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Request Body (JSON)</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={5}
                  placeholder='{"name": "my-vm", "cpus": 2, "memory": 2048}'
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y" />
              </div>
            )}
          </div>

          {/* Response */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Code2 className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-semibold text-white">Response</span>
              </div>
              {response && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  response.status >= 200 && response.status < 300 ? 'bg-green-500/20 text-green-400' :
                  response.status >= 400 ? 'bg-red-500/20 text-red-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {response.status || 'ERR'}
                </span>
              )}
            </div>
            <div className="bg-slate-900 p-4 max-h-96 overflow-auto">
              {response ? (
                <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-words">{response.body}</pre>
              ) : (
                <p className="text-sm text-slate-500 text-center py-8">Send a request to see the response</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
