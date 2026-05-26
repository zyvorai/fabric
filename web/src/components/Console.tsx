// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Terminal, Wifi, WifiOff, Send } from 'lucide-react';
import { useViewContext } from '../App';

export default function Console() {
  const { navigateTo, selectedVM } = useViewContext();
  const vmName = selectedVM || '';
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  const connect = useCallback(() => {
    if (!vmName) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/console/${vmName}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setMessages((prev) => [...prev, `--- Connected to ${vmName} ---`]);
    };

    ws.onmessage = (event) => {
      setMessages((prev) => [...prev, event.data]);
    };

    ws.onerror = () => {
      setMessages((prev) => [...prev, '--- Connection error ---']);
    };

    ws.onclose = () => {
      setConnected(false);
      setMessages((prev) => [...prev, '--- Disconnected ---']);
    };
  }, [vmName]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(input);
    setMessages((prev) => [...prev, `> ${input}`]);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  if (!vmName) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
        <Terminal className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="text-lg font-medium">No VM selected</p>
        <p className="text-sm mt-1">Select a VM to open its console</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigateTo('vmDetails', vmName)}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to VM Details
      </button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{vmName}</h1>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
            connected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {connected ? (
              <><Wifi className="w-3 h-3" /> Connected</>
            ) : (
              <><WifiOff className="w-3 h-3" /> Disconnected</>
            )}
          </span>
        </div>
        {!connected && (
          <button
            onClick={connect}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Reconnect
          </button>
        )}
      </div>

      {/* Terminal */}
      <div className="bg-slate-900 rounded-xl border border-slate-700/50 overflow-hidden">
        <div
          ref={terminalRef}
          className="p-4 font-mono text-sm text-green-400 h-[600px] overflow-auto"
        >
          {messages.length === 0 ? (
            <span className="text-slate-600">Waiting for output...</span>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className="whitespace-pre-wrap break-all leading-relaxed">
                {msg}
              </div>
            ))
          )}
        </div>

        {/* Input bar */}
        <div className="border-t border-slate-700/50 flex items-center gap-2 px-4 py-3 bg-slate-900/80">
          <span className="text-green-400 font-mono text-sm select-none">$</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connected ? 'Type a command...' : 'Not connected'}
            disabled={!connected}
            className="flex-1 bg-transparent border-none text-sm text-green-400 font-mono placeholder-slate-600 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!connected || !input.trim()}
            className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-green-400 transition-colors disabled:opacity-30"
            title="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
