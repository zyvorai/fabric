import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { useViewContext, type AppView } from '../App';

interface Command {
  id: string;
  label: string;
  category: string;
  view: AppView;
  keywords?: string[];
}

const commands: Command[] = [
  // Core
  { id: 'dashboard', label: 'Dashboard', category: 'Core', view: 'dashboard', keywords: ['home', 'overview'] },
  { id: 'favoriteVMs', label: 'Favorites', category: 'Core', view: 'favoriteVMs', keywords: ['starred'] },
  { id: 'vmList', label: 'VMs', category: 'Core', view: 'vmList', keywords: ['virtual machines', 'list'] },
  { id: 'machines', label: 'Machines', category: 'Core', view: 'machines', keywords: ['hosts'] },
  { id: 'profiles', label: 'Profiles', category: 'Core', view: 'profiles' },
  { id: 'datacenters', label: 'Datacenters', category: 'Core', view: 'datacenters' },
  { id: 'vmBrowser', label: 'VM Browser', category: 'Core', view: 'vmBrowser' },
  { id: 'vmCreateWizard', label: 'VM Wizard', category: 'Core', view: 'vmCreateWizard', keywords: ['create', 'new'] },
  // Infrastructure
  { id: 'network', label: 'Network', category: 'Infrastructure', view: 'network', keywords: ['bridge', 'vlan'] },
  { id: 'networkSecurity', label: 'Net Security', category: 'Infrastructure', view: 'networkSecurity', keywords: ['firewall'] },
  { id: 'storage', label: 'Storage', category: 'Infrastructure', view: 'storage', keywords: ['disk', 'volume'] },
  { id: 'storagePools', label: 'Storage Pools', category: 'Infrastructure', view: 'storagePools' },
  { id: 'distributedStorage', label: 'Distributed Storage', category: 'Infrastructure', view: 'distributedStorage' },
  { id: 'resourcePools', label: 'Resource Pools', category: 'Infrastructure', view: 'resourcePools' },
  { id: 'systemHealth', label: 'System Health', category: 'Infrastructure', view: 'systemHealth' },
  { id: 'containers', label: 'Containers', category: 'Infrastructure', view: 'containers' },
  { id: 'createVM', label: 'Create VM', category: 'Infrastructure', view: 'createVM', keywords: ['new', 'add', 'launch'] },
  { id: 'snapshots', label: 'Snapshots', category: 'Infrastructure', view: 'snapshots' },
  { id: 'isoImages', label: 'ISOs', category: 'Infrastructure', view: 'isoImages' },
  // Cluster
  { id: 'drs', label: 'DRS', category: 'Cluster', view: 'drs', keywords: ['scheduler'] },
  { id: 'faultTolerance', label: 'Fault Tolerance', category: 'Cluster', view: 'faultTolerance' },
  { id: 'replication', label: 'Replication', category: 'Cluster', view: 'replication' },
  { id: 'siteRecovery', label: 'Site Recovery', category: 'Cluster', view: 'siteRecovery' },
  { id: 'migrations', label: 'Migrations', category: 'Cluster', view: 'migrations' },
  { id: 'migrationWizard', label: 'Migration Wizard', category: 'Cluster', view: 'migrationWizard' },
  { id: 'batchMigration', label: 'Batch Migration', category: 'Cluster', view: 'batchMigration' },
  // Operations
  { id: 'templates', label: 'Templates', category: 'Operations', view: 'templates' },
  { id: 'contentLibrary', label: 'Content Library', category: 'Operations', view: 'contentLibrary' },
  { id: 'imageBuilder', label: 'Image Builder', category: 'Operations', view: 'imageBuilder' },
  { id: 'schedules', label: 'Schedules', category: 'Operations', view: 'schedules', keywords: ['cron'] },
  { id: 'backups', label: 'Backups', category: 'Operations', view: 'backups' },
  { id: 'bulkOperations', label: 'Bulk Ops', category: 'Operations', view: 'bulkOperations' },
  { id: 'uploadDisk', label: 'Upload Disk', category: 'Operations', view: 'uploadDisk' },
  { id: 'downloadDisk', label: 'Download Disk', category: 'Operations', view: 'downloadDisk' },
  { id: 'jobMonitor', label: 'Job Monitor', category: 'Operations', view: 'jobMonitor' },
  // Security
  { id: 'encryption', label: 'Encryption', category: 'Security', view: 'encryption' },
  { id: 'certificates', label: 'Certificates', category: 'Security', view: 'certificates' },
  { id: 'complianceDashboard', label: 'Compliance', category: 'Security', view: 'complianceDashboard' },
  { id: 'accessControl', label: 'Access Control', category: 'Security', view: 'accessControl' },
  // Monitoring
  { id: 'logs', label: 'Logs', category: 'Monitoring', view: 'logs', keywords: ['journal', 'events'] },
  { id: 'analytics', label: 'Analytics', category: 'Monitoring', view: 'analytics', keywords: ['metrics'] },
  { id: 'alerts', label: 'Alerts', category: 'Monitoring', view: 'alerts' },
  { id: 'notifications', label: 'Notifications', category: 'Monitoring', view: 'notifications' },
  { id: 'timeline', label: 'Timeline', category: 'Monitoring', view: 'timeline' },
  // Observability
  { id: 'processes', label: 'Processes', category: 'Observability', view: 'processes' },
  { id: 'kernel', label: 'Kernel', category: 'Observability', view: 'kernel' },
  { id: 'debug', label: 'Debug', category: 'Observability', view: 'debug' },
  { id: 'liveMetrics', label: 'Live Metrics', category: 'Observability', view: 'liveMetrics' },
  { id: 'eventStream', label: 'Event Stream', category: 'Observability', view: 'eventStream' },
  { id: 'resourceOptimizer', label: 'Optimizer', category: 'Observability', view: 'resourceOptimizer' },
  { id: 'capacityPlanning', label: 'Capacity Planning', category: 'Observability', view: 'capacityPlanning' },
  { id: 'serviceMap', label: 'Service Map', category: 'Observability', view: 'serviceMap' },
  // Tools
  { id: 'webhooks', label: 'Webhooks', category: 'Tools', view: 'webhooks' },
  { id: 'apiPlayground', label: 'API Playground', category: 'Tools', view: 'apiPlayground' },
  { id: 'costEstimator', label: 'Cost Estimator', category: 'Tools', view: 'costEstimator' },
  { id: 'settings', label: 'Settings', category: 'Tools', view: 'settings', keywords: ['config', 'preferences'] },
];

export default function CommandPalette() {
  const { navigateTo } = useViewContext();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const fuzzyMatch = (text: string, pattern: string): number => {
    const t = text.toLowerCase();
    const p = pattern.toLowerCase();
    if (t.includes(p)) return 100;
    let score = 0, pi = 0, consecutive = 0;
    for (let ti = 0; ti < t.length && pi < p.length; ti++) {
      if (t[ti] === p[pi]) {
        score += 10;
        consecutive++;
        score += consecutive * 5;
        if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '-') score += 15;
        pi++;
      } else {
        consecutive = 0;
      }
    }
    return pi === p.length ? score : 0;
  };

  const filtered = query
    ? commands
        .map((cmd) => {
          const q = query.toLowerCase();
          const labelScore = fuzzyMatch(cmd.label, q);
          const kwScore = Math.max(...(cmd.keywords?.map((k) => fuzzyMatch(k, q)) || [0]));
          return { cmd, score: Math.max(labelScore, kwScore) };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ cmd }) => cmd)
    : commands;

  const grouped = filtered.reduce<Record<string, Command[]>>((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  const execute = (cmd: Command) => {
    navigateTo(cmd.view);
    close();
  };

  // Keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        setQuery('');
        setSelectedIndex(0);
        return;
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        close();
        return;
      }
      if (!isOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) execute(filtered[selectedIndex]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, filtered, selectedIndex]);

  // Reset selection on query change
  useEffect(() => { setSelectedIndex(0); }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen]);

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  let cmdIndex = 0;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-lg mx-auto mt-[20vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/50">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands, pages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-slate-500"
            autoFocus
          />
          <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] text-slate-500 font-mono shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto max-h-[320px]">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-slate-500">No results for "{query}"</p>
            </div>
          ) : (
            Object.entries(grouped).map(([category, cmds]) => (
              <div key={category}>
                <div className="px-4 py-1.5 text-[10px] font-semibold text-slate-600 uppercase tracking-wider sticky top-0 bg-slate-800">
                  {category}
                </div>
                {cmds.map((cmd) => {
                  const isSelected = cmdIndex === selectedIndex;
                  const currentIdx = cmdIndex;
                  cmdIndex++;
                  return (
                    <button
                      key={cmd.id}
                      data-selected={isSelected}
                      onClick={() => execute(cmd)}
                      onMouseEnter={() => setSelectedIndex(currentIdx)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                        isSelected ? 'bg-blue-600/10 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{cmd.label}</div>
                      </div>
                      {isSelected && <ArrowRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-700/50 text-[10px] text-slate-600">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-slate-900 border border-slate-700 rounded font-mono">&#8593;&#8595;</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-slate-900 border border-slate-700 rounded font-mono">&#8629;</kbd>
            select
          </span>
          <span className="ml-auto">{filtered.length} results</span>
        </div>
      </div>
    </div>
  );
}
