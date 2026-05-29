// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import React, { useState, useEffect, useRef, Suspense, createContext, useContext } from 'react';
import {
  ChevronDown, LogOut, User,
  Sun, Moon, X, Menu,
  LayoutDashboard, Star, Monitor, Server, UserCircle, Building2, Globe2, Wand2,
  Network, Shield, HardDrive, Database, Boxes, Layers, HeartPulse, Container, Plus, Camera, Disc,
  Zap, ShieldCheck, Copy, LifeBuoy, Route, CheckCircle, History, FileText, GitBranch, FileStack, GitMerge, Share2,
  Library, Image, CalendarClock, Archive, Gauge, Recycle, ArrowUpDown, Upload, Download, Activity, Clock, Package, Hammer, Eye,
  Lock, Award, ClipboardCheck, KeyRound, Puzzle,
  ScrollText, BarChart3, FileSearch, Bell, AlertTriangle, Timer,
  Cpu, ShieldAlert, Terminal, Bug, HelpCircle, Radio, TrendingUp, Map, Compass,
  Webhook, Code2, DollarSign, RefreshCw, GitCompare, Stethoscope, BellRing, Settings,
} from 'lucide-react';
import { Login } from './components/Login';
import { auth } from './utils/api';

// ─── AppView type union (83 views) ──────────────────────────────────────────

export type AppView =
  | 'dashboard' | 'vmList' | 'vmDetails' | 'createVM' | 'console'
  | 'snapshots' | 'logs' | 'network' | 'networkSecurity' | 'storage'
  | 'storagePools' | 'machines' | 'containers' | 'profiles' | 'templates'
  | 'systemHealth' | 'processes' | 'alerts' | 'liveMetrics' | 'kernel'
  | 'debug' | 'explain' | 'analytics' | 'auditLogs' | 'timeline'
  | 'eventStream' | 'resourceOptimizer' | 'capacityPlanning' | 'serviceMap'
  | 'backups' | 'backupScheduler' | 'bulkOperations' | 'settings'
  | 'notifications' | 'notificationCenter' | 'schedules' | 'quotas'
  | 'isoImages' | 'diskImages' | 'uploadDisk' | 'downloadDisk' | 'diskConverter'
  | 'snapshotManager' | 'storageManager' | 'imageBuilder' | 'batchImport'
  | 'pipelineMonitor' | 'jobMonitor' | 'manifestBuilder' | 'drs'
  | 'migrations' | 'migrationWizard' | 'migrationReadiness' | 'migrationHistory'
  | 'migrationReport' | 'migrationTemplates' | 'batchMigration'
  | 'replication' | 'siteRecovery' | 'faultTolerance' | 'encryption'
  | 'certificates' | 'contentLibrary' | 'lifecycleManager' | 'datacenters'
  | 'resourcePools' | 'distributedStorage' | 'networkTopology'
  | 'securityDashboard' | 'complianceDashboard' | 'accessControl'
  | 'pluginManager' | 'favoriteVMs' | 'vmBrowser' | 'vmCompare'
  | 'vmHealthCheck' | 'vmCreateWizard' | 'costEstimator' | 'apiPlayground'
  | 'webhooks' | 'systemResources';

// ─── ViewContext ─────────────────────────────────────────────────────────────

interface ViewContextValue {
  currentView: AppView;
  navigateTo: (view: AppView, vmId?: string) => void;
  selectedVM: string | null;
}

export const ViewContext = createContext<ViewContextValue>({
  currentView: 'dashboard',
  navigateTo: () => {},
  selectedVM: null,
});

export const useViewContext = () => useContext(ViewContext);

// ─── React.lazy imports (all from ./components/) ────────────────────────────

const Dashboard = React.lazy(() => import('./components/Dashboard'));
const VMList = React.lazy(() => import('./components/VMList'));
const VMDetails = React.lazy(() => import('./components/VMDetails'));
const CreateVM = React.lazy(() => import('./components/CreateVM'));
const Console = React.lazy(() => import('./components/Console'));
const Snapshots = React.lazy(() => import('./components/Snapshots'));
const Logs = React.lazy(() => import('./components/Logs'));
const NetworkPage = React.lazy(() => import('./components/Network'));
const NetworkSecurity = React.lazy(() => import('./components/NetworkSecurity'));
const Storage = React.lazy(() => import('./components/Storage'));
const StoragePools = React.lazy(() => import('./components/StoragePools'));
const Machines = React.lazy(() => import('./components/Machines'));
const Containers = React.lazy(() => import('./components/Containers'));
const Profiles = React.lazy(() => import('./components/Profiles'));
const Templates = React.lazy(() => import('./components/Templates'));
const SystemHealth = React.lazy(() => import('./components/SystemHealth'));
const Processes = React.lazy(() => import('./components/Processes'));
const Alerts = React.lazy(() => import('./components/Alerts'));
const LiveMetrics = React.lazy(() => import('./components/LiveMetrics'));
const Kernel = React.lazy(() => import('./components/Kernel'));
const Debug = React.lazy(() => import('./components/Debug'));
const Explain = React.lazy(() => import('./components/Explain'));
const Analytics = React.lazy(() => import('./components/Analytics'));
const AuditLogs = React.lazy(() => import('./components/AuditLogs'));
const Timeline = React.lazy(() => import('./components/Timeline'));
const EventStream = React.lazy(() => import('./components/EventStream'));
const ResourceOptimizer = React.lazy(() => import('./components/ResourceOptimizer'));
const CapacityPlanning = React.lazy(() => import('./components/CapacityPlanning'));
const ServiceMap = React.lazy(() => import('./components/ServiceMap'));
const Backups = React.lazy(() => import('./components/Backups'));
const BackupScheduler = React.lazy(() => import('./components/BackupScheduler'));
const BulkOperations = React.lazy(() => import('./components/BulkOperations'));
const SettingsPage = React.lazy(() => import('./components/Settings'));
const Notifications = React.lazy(() => import('./components/Notifications'));
const NotificationCenter = React.lazy(() => import('./components/NotificationCenter'));
const Schedules = React.lazy(() => import('./components/Schedules'));
const Quotas = React.lazy(() => import('./components/Quotas'));
const ISOImages = React.lazy(() => import('./components/ISOImages'));
const DiskImages = React.lazy(() => import('./components/DiskImages'));
const UploadDisk = React.lazy(() => import('./components/UploadDisk'));
const DownloadDisk = React.lazy(() => import('./components/DownloadDisk'));
const DiskConverter = React.lazy(() => import('./components/DiskConverter'));
const SnapshotManager = React.lazy(() => import('./components/SnapshotManager'));
const StorageManager = React.lazy(() => import('./components/StorageManager'));
const ImageBuilder = React.lazy(() => import('./components/ImageBuilder'));
const BatchImport = React.lazy(() => import('./components/BatchImport'));
const PipelineMonitor = React.lazy(() => import('./components/PipelineMonitor'));
const JobMonitor = React.lazy(() => import('./components/JobMonitor'));
const ManifestBuilder = React.lazy(() => import('./components/ManifestBuilder'));
const DRS = React.lazy(() => import('./components/DRS'));
const Migrations = React.lazy(() => import('./components/Migrations'));
const MigrationWizard = React.lazy(() => import('./components/MigrationWizard'));
const MigrationReadiness = React.lazy(() => import('./components/MigrationReadiness'));
const MigrationHistory = React.lazy(() => import('./components/MigrationHistory'));
const MigrationReport = React.lazy(() => import('./components/MigrationReport'));
const MigrationTemplates = React.lazy(() => import('./components/MigrationTemplates'));
const BatchMigration = React.lazy(() => import('./components/BatchMigration'));
const Replication = React.lazy(() => import('./components/Replication'));
const SiteRecovery = React.lazy(() => import('./components/SiteRecovery'));
const FaultTolerance = React.lazy(() => import('./components/FaultTolerance'));
const Encryption = React.lazy(() => import('./components/Encryption'));
const Certificates = React.lazy(() => import('./components/Certificates'));
const ContentLibrary = React.lazy(() => import('./components/ContentLibrary'));
const LifecycleManager = React.lazy(() => import('./components/LifecycleManager'));
const Datacenters = React.lazy(() => import('./components/Datacenters'));
const ResourcePools = React.lazy(() => import('./components/ResourcePools'));
const DistributedStorage = React.lazy(() => import('./components/DistributedStorage'));
const NetworkTopology = React.lazy(() => import('./components/NetworkTopology'));
const SecurityDashboard = React.lazy(() => import('./components/SecurityDashboard'));
const ComplianceDashboard = React.lazy(() => import('./components/ComplianceDashboard'));
const AccessControl = React.lazy(() => import('./components/AccessControl'));
const PluginManager = React.lazy(() => import('./components/PluginManager'));
const FavoriteVMs = React.lazy(() => import('./components/FavoriteVMs'));
const VMBrowser = React.lazy(() => import('./components/VMBrowser'));
const VMCompare = React.lazy(() => import('./components/VMCompare'));
const VMHealthCheck = React.lazy(() => import('./components/VMHealthCheck'));
const VMCreateWizard = React.lazy(() => import('./components/VMCreateWizard'));
const CostEstimator = React.lazy(() => import('./components/CostEstimator'));
const APIPlayground = React.lazy(() => import('./components/APIPlayground'));
const Webhooks = React.lazy(() => import('./components/Webhooks'));
const SystemResources = React.lazy(() => import('./components/SystemResources'));
const CommandPalette = React.lazy(() => import('./components/CommandPalette'));

// ─── View registry ──────────────────────────────────────────────────────────

const viewRegistry: Record<AppView, React.LazyExoticComponent<any>> = {
  dashboard: Dashboard,
  vmList: VMList,
  vmDetails: VMDetails,
  createVM: CreateVM,
  console: Console,
  snapshots: Snapshots,
  logs: Logs,
  network: NetworkPage,
  networkSecurity: NetworkSecurity,
  storage: Storage,
  storagePools: StoragePools,
  machines: Machines,
  containers: Containers,
  profiles: Profiles,
  templates: Templates,
  systemHealth: SystemHealth,
  processes: Processes,
  alerts: Alerts,
  liveMetrics: LiveMetrics,
  kernel: Kernel,
  debug: Debug,
  explain: Explain,
  analytics: Analytics,
  auditLogs: AuditLogs,
  timeline: Timeline,
  eventStream: EventStream,
  resourceOptimizer: ResourceOptimizer,
  capacityPlanning: CapacityPlanning,
  serviceMap: ServiceMap,
  backups: Backups,
  backupScheduler: BackupScheduler,
  bulkOperations: BulkOperations,
  settings: SettingsPage,
  notifications: Notifications,
  notificationCenter: NotificationCenter,
  schedules: Schedules,
  quotas: Quotas,
  isoImages: ISOImages,
  diskImages: DiskImages,
  uploadDisk: UploadDisk,
  downloadDisk: DownloadDisk,
  diskConverter: DiskConverter,
  snapshotManager: SnapshotManager,
  storageManager: StorageManager,
  imageBuilder: ImageBuilder,
  batchImport: BatchImport,
  pipelineMonitor: PipelineMonitor,
  jobMonitor: JobMonitor,
  manifestBuilder: ManifestBuilder,
  drs: DRS,
  migrations: Migrations,
  migrationWizard: MigrationWizard,
  migrationReadiness: MigrationReadiness,
  migrationHistory: MigrationHistory,
  migrationReport: MigrationReport,
  migrationTemplates: MigrationTemplates,
  batchMigration: BatchMigration,
  replication: Replication,
  siteRecovery: SiteRecovery,
  faultTolerance: FaultTolerance,
  encryption: Encryption,
  certificates: Certificates,
  contentLibrary: ContentLibrary,
  lifecycleManager: LifecycleManager,
  datacenters: Datacenters,
  resourcePools: ResourcePools,
  distributedStorage: DistributedStorage,
  networkTopology: NetworkTopology,
  securityDashboard: SecurityDashboard,
  complianceDashboard: ComplianceDashboard,
  accessControl: AccessControl,
  pluginManager: PluginManager,
  favoriteVMs: FavoriteVMs,
  vmBrowser: VMBrowser,
  vmCompare: VMCompare,
  vmHealthCheck: VMHealthCheck,
  vmCreateWizard: VMCreateWizard,
  costEstimator: CostEstimator,
  apiPlayground: APIPlayground,
  webhooks: Webhooks,
  systemResources: SystemResources,
};

// ─── Navigation groups (8 groups) ───────────────────────────────────────────

interface NavItem {
  id: AppView;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Core',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4 text-blue-400" /> },
      { id: 'favoriteVMs', label: 'Favorites', icon: <Star className="w-4 h-4 text-yellow-400" /> },
      { id: 'vmList', label: 'VMs', icon: <Monitor className="w-4 h-4 text-blue-400" /> },
      { id: 'machines', label: 'Machines', icon: <Server className="w-4 h-4 text-slate-400" /> },
      { id: 'profiles', label: 'Profiles', icon: <UserCircle className="w-4 h-4 text-purple-400" /> },
      { id: 'datacenters', label: 'Datacenters', icon: <Building2 className="w-4 h-4 text-emerald-400" /> },
      { id: 'vmBrowser', label: 'VM Browser', icon: <Globe2 className="w-4 h-4 text-cyan-400" /> },
      { id: 'vmCreateWizard', label: 'VM Wizard', icon: <Wand2 className="w-4 h-4 text-indigo-400" /> },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { id: 'network', label: 'Network', icon: <Network className="w-4 h-4 text-blue-400" /> },
      { id: 'networkSecurity', label: 'Net Security', icon: <Shield className="w-4 h-4 text-red-400" /> },
      { id: 'storage', label: 'Storage', icon: <HardDrive className="w-4 h-4 text-amber-400" /> },
      { id: 'storagePools', label: 'Storage Pools', icon: <Database className="w-4 h-4 text-emerald-400" /> },
      { id: 'distributedStorage', label: 'Distributed Storage', icon: <Boxes className="w-4 h-4 text-violet-400" /> },
      { id: 'resourcePools', label: 'Resource Pools', icon: <Layers className="w-4 h-4 text-cyan-400" /> },
      { id: 'systemHealth', label: 'System Health', icon: <HeartPulse className="w-4 h-4 text-green-400" /> },
      { id: 'containers', label: 'Containers', icon: <Container className="w-4 h-4 text-sky-400" /> },
      { id: 'createVM', label: 'Create VM', icon: <Plus className="w-4 h-4 text-blue-400" /> },
      { id: 'snapshots', label: 'Snapshots', icon: <Camera className="w-4 h-4 text-purple-400" /> },
      { id: 'isoImages', label: 'ISOs', icon: <Disc className="w-4 h-4 text-orange-400" /> },
      { id: 'systemResources', label: 'System Resources', icon: <Cpu className="w-4 h-4 text-teal-400" /> },
    ],
  },
  {
    label: 'Cluster',
    items: [
      { id: 'drs', label: 'DRS', icon: <Zap className="w-4 h-4 text-yellow-400" /> },
      { id: 'faultTolerance', label: 'Fault Tolerance', icon: <ShieldCheck className="w-4 h-4 text-green-400" /> },
      { id: 'replication', label: 'Replication', icon: <Copy className="w-4 h-4 text-blue-400" /> },
      { id: 'siteRecovery', label: 'Site Recovery', icon: <LifeBuoy className="w-4 h-4 text-red-400" /> },
      { id: 'migrations', label: 'Migrations', icon: <Route className="w-4 h-4 text-indigo-400" /> },
      { id: 'migrationReadiness', label: 'Readiness', icon: <CheckCircle className="w-4 h-4 text-emerald-400" /> },
      { id: 'migrationHistory', label: 'History', icon: <History className="w-4 h-4 text-slate-400" /> },
      { id: 'migrationReport', label: 'Report', icon: <FileText className="w-4 h-4 text-cyan-400" /> },
      { id: 'migrationWizard', label: 'Wizard', icon: <GitBranch className="w-4 h-4 text-purple-400" /> },
      { id: 'migrationTemplates', label: 'Templates', icon: <FileStack className="w-4 h-4 text-amber-400" /> },
      { id: 'batchMigration', label: 'Batch Migration', icon: <GitMerge className="w-4 h-4 text-pink-400" /> },
      { id: 'networkTopology', label: 'Network Topology', icon: <Share2 className="w-4 h-4 text-sky-400" /> },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'templates', label: 'Templates', icon: <FileStack className="w-4 h-4 text-blue-400" /> },
      { id: 'contentLibrary', label: 'Content Library', icon: <Library className="w-4 h-4 text-purple-400" /> },
      { id: 'imageBuilder', label: 'Image Builder', icon: <Image className="w-4 h-4 text-cyan-400" /> },
      { id: 'schedules', label: 'Schedules', icon: <CalendarClock className="w-4 h-4 text-green-400" /> },
      { id: 'backups', label: 'Backups', icon: <Archive className="w-4 h-4 text-amber-400" /> },
      { id: 'quotas', label: 'Quotas', icon: <Gauge className="w-4 h-4 text-red-400" /> },
      { id: 'lifecycleManager', label: 'Lifecycle', icon: <Recycle className="w-4 h-4 text-emerald-400" /> },
      { id: 'bulkOperations', label: 'Bulk Ops', icon: <ArrowUpDown className="w-4 h-4 text-indigo-400" /> },
      { id: 'uploadDisk', label: 'Upload Disk', icon: <Upload className="w-4 h-4 text-sky-400" /> },
      { id: 'downloadDisk', label: 'Download Disk', icon: <Download className="w-4 h-4 text-sky-400" /> },
      { id: 'pipelineMonitor', label: 'Pipeline', icon: <Activity className="w-4 h-4 text-violet-400" /> },
      { id: 'backupScheduler', label: 'Backup Scheduler', icon: <Clock className="w-4 h-4 text-orange-400" /> },
      { id: 'batchImport', label: 'Batch Import', icon: <Package className="w-4 h-4 text-teal-400" /> },
      { id: 'snapshotManager', label: 'Snapshot Mgr', icon: <Camera className="w-4 h-4 text-purple-400" /> },
      { id: 'storageManager', label: 'Storage Mgr', icon: <HardDrive className="w-4 h-4 text-amber-400" /> },
      { id: 'diskImages', label: 'Disk Images', icon: <Disc className="w-4 h-4 text-slate-400" /> },
      { id: 'manifestBuilder', label: 'Manifest Builder', icon: <Hammer className="w-4 h-4 text-rose-400" /> },
      { id: 'jobMonitor', label: 'Job Monitor', icon: <Eye className="w-4 h-4 text-blue-400" /> },
    ],
  },
  {
    label: 'Security',
    items: [
      { id: 'encryption', label: 'Encryption', icon: <Lock className="w-4 h-4 text-yellow-400" /> },
      { id: 'certificates', label: 'Certificates', icon: <Award className="w-4 h-4 text-green-400" /> },
      { id: 'complianceDashboard', label: 'Compliance', icon: <ClipboardCheck className="w-4 h-4 text-blue-400" /> },
      { id: 'accessControl', label: 'Access Control', icon: <KeyRound className="w-4 h-4 text-red-400" /> },
      { id: 'pluginManager', label: 'Plugins', icon: <Puzzle className="w-4 h-4 text-purple-400" /> },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { id: 'logs', label: 'Logs', icon: <ScrollText className="w-4 h-4 text-slate-400" /> },
      { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4 text-blue-400" /> },
      { id: 'auditLogs', label: 'Audit', icon: <FileSearch className="w-4 h-4 text-amber-400" /> },
      { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4 text-cyan-400" /> },
      { id: 'alerts', label: 'Alerts', icon: <AlertTriangle className="w-4 h-4 text-red-400" /> },
      { id: 'timeline', label: 'Timeline', icon: <Timer className="w-4 h-4 text-purple-400" /> },
    ],
  },
  {
    label: 'Observability',
    items: [
      { id: 'processes', label: 'Processes', icon: <Cpu className="w-4 h-4 text-blue-400" /> },
      { id: 'securityDashboard', label: 'Security Dashboard', icon: <ShieldAlert className="w-4 h-4 text-red-400" /> },
      { id: 'kernel', label: 'Kernel', icon: <Terminal className="w-4 h-4 text-green-400" /> },
      { id: 'debug', label: 'Debug', icon: <Bug className="w-4 h-4 text-amber-400" /> },
      { id: 'explain', label: 'Explain', icon: <HelpCircle className="w-4 h-4 text-cyan-400" /> },
      { id: 'liveMetrics', label: 'Live Metrics', icon: <Activity className="w-4 h-4 text-emerald-400" /> },
      { id: 'eventStream', label: 'Event Stream', icon: <Radio className="w-4 h-4 text-violet-400" /> },
      { id: 'resourceOptimizer', label: 'Optimizer', icon: <TrendingUp className="w-4 h-4 text-indigo-400" /> },
      { id: 'capacityPlanning', label: 'Capacity', icon: <Map className="w-4 h-4 text-sky-400" /> },
      { id: 'serviceMap', label: 'Service Map', icon: <Compass className="w-4 h-4 text-purple-400" /> },
    ],
  },
  {
    label: 'Tools',
    items: [
      { id: 'webhooks', label: 'Webhooks', icon: <Webhook className="w-4 h-4 text-blue-400" /> },
      { id: 'apiPlayground', label: 'API Playground', icon: <Code2 className="w-4 h-4 text-green-400" /> },
      { id: 'costEstimator', label: 'Cost Estimator', icon: <DollarSign className="w-4 h-4 text-yellow-400" /> },
      { id: 'diskConverter', label: 'Disk Converter', icon: <RefreshCw className="w-4 h-4 text-cyan-400" /> },
      { id: 'vmCompare', label: 'VM Compare', icon: <GitCompare className="w-4 h-4 text-purple-400" /> },
      { id: 'vmHealthCheck', label: 'VM Health Check', icon: <Stethoscope className="w-4 h-4 text-emerald-400" /> },
      { id: 'notificationCenter', label: 'Notification Center', icon: <BellRing className="w-4 h-4 text-amber-400" /> },
      { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4 text-slate-400" /> },
    ],
  },
];

// ─── App Component ──────────────────────────────────────────────────────────

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [selectedVM, setSelectedVM] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('vmspawnd_theme') !== 'light');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [displayUsername, setDisplayUsername] = useState('admin');
  const dropdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigateTo = (view: AppView, vmId?: string) => {
    setCurrentView(view);
    if (vmId !== undefined) setSelectedVM(vmId);
    setOpenDropdown(null);
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    const loggedIn = sessionStorage.getItem('vmspawnd_authenticated') === 'true';
    const hasToken = !!sessionStorage.getItem('vmspawnd_token');
    const savedUsername = localStorage.getItem('vmspawnd_username') || sessionStorage.getItem('vmspawnd_username');
    if (loggedIn && hasToken && savedUsername) {
      setIsAuthenticated(true);
      setDisplayUsername(savedUsername);
    }
    setIsCheckingAuth(false);
  }, []);

  useEffect(() => {
    const checkHealth = () => {
      fetch('/api/v1/health')
        .then((res) => setWsConnected(res.ok))
        .catch(() => setWsConnected(false));
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('light-theme', !darkMode);
    localStorage.setItem('vmspawnd_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    const handleClickOutside = () => setOpenDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleLogin = async (username: string, password: string) => {
    if (!username || !password) {
      throw new Error('Please enter username and password');
    }
    const result = await auth.login(username, password);
    if (result.token) {
      sessionStorage.setItem('vmspawnd_token', result.token);
    }
    setIsAuthenticated(true);
    setDisplayUsername(result.username || username);
    sessionStorage.setItem('vmspawnd_authenticated', 'true');
    sessionStorage.setItem('vmspawnd_username', result.username || username);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('vmspawnd_token');
    sessionStorage.removeItem('vmspawnd_authenticated');
    sessionStorage.removeItem('vmspawnd_username');
    setCurrentView('dashboard');
    setSelectedVM(null);
    localStorage.removeItem('vmspawnd_username');
    localStorage.removeItem('vmspawnd_remember');
    setDisplayUsername('admin');
  };

  const handleNavClick = (view: AppView) => {
    navigateTo(view);
  };

  const handleDropdownEnter = (label: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
      dropdownTimeoutRef.current = null;
    }
    setOpenDropdown(label);
  };

  const handleDropdownLeave = () => {
    dropdownTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 150);
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-300 tracking-wide">
            Loading Zyvor Fabric...
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  const isViewActive = (view: AppView) => currentView === view;
  const isGroupActive = (group: NavGroup) =>
    group.items.some((item) => item.id === currentView);

  const renderContent = () => {
    const Component = viewRegistry[currentView];
    if (!Component) return null;
    return (
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-slate-400">Loading...</span>
            </div>
          </div>
        }
      >
        {currentView === 'dashboard' ? (
          <Dashboard wsConnected={wsConnected} />
        ) : (
          <Component />
        )}
      </Suspense>
    );
  };

  return (
    <ViewContext.Provider value={{ currentView, navigateTo, selectedVM }}>
      <div className="h-screen flex flex-col bg-slate-950">
        {/* Top Navbar */}
        <header className="sticky top-0 z-50 navbar-gradient border-b border-slate-700/50 flex-shrink-0">
          <div className="flex items-center h-14 px-4">
            {/* Left: Logo */}
            <button
              onClick={() => handleNavClick('dashboard')}
              className="flex items-center gap-2 mr-8 flex-shrink-0"
            >
              <h1 className="text-xl font-bold text-gradient-blue">
                Zyvor Fabric
              </h1>
            </button>

            {/* Desktop Navigation Groups */}
            <nav className="hidden md:flex items-center gap-1 flex-1">
              {navGroups.map((group) => (
                <div
                  key={group.label}
                  className="relative"
                  onMouseEnter={(e) => handleDropdownEnter(group.label, e)}
                  onMouseLeave={handleDropdownLeave}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenDropdown(
                        openDropdown === group.label ? null : group.label
                      );
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isGroupActive(group)
                        ? 'bg-blue-600/20 text-blue-400'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    {group.label}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>

                  {openDropdown === group.label && (
                    <div
                      className={`absolute top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-2 z-50 ${
                        group.items.length > 8
                          ? 'grid grid-cols-2 min-w-[400px]'
                          : 'min-w-[200px]'
                      }`}
                    >
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleNavClick(item.id)}
                          className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                            isViewActive(item.id)
                              ? 'bg-blue-600/20 text-blue-400'
                              : 'text-slate-300 hover:bg-slate-700/50 hover:text-slate-100'
                          }`}
                        >
                          {item.icon}
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>

            {/* Right side controls */}
            <div className="flex items-center gap-3 ml-auto">
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="h-8 w-8 rounded-lg hover:bg-slate-800 flex items-center justify-center transition-colors text-slate-400 hover:text-slate-200"
                title={darkMode ? 'Light mode' : 'Dark mode'}
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-700">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">{displayUsername}</span>
                </span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-400 text-slate-400 transition-colors text-xs"
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>

              <div className="relative group">
                <span className={`block w-2.5 h-2.5 rounded-full ${
                  wsConnected
                    ? 'bg-green-400 shadow-green-400/50 shadow-sm'
                    : 'bg-red-400 shadow-red-400/50 shadow-sm'
                }`} />
                <div className="absolute right-0 top-full mt-1 px-2 py-1 bg-slate-900 text-xs text-white rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  {wsConnected ? 'Connected' : 'Disconnected'}
                </div>
              </div>

              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="h-8 w-8 rounded-lg hover:bg-slate-800 flex md:hidden items-center justify-center transition-colors text-slate-400"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </header>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
            <div className="absolute top-14 left-0 right-0 bg-slate-900 border-b border-slate-700 shadow-2xl max-h-[80vh] overflow-y-auto z-50">
              {navGroups.map((group) => (
                <div key={group.label} className="px-4 py-3">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{group.label}</h3>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleNavClick(item.id)}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          isViewActive(item.id)
                            ? 'bg-blue-600/20 text-blue-400'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                        }`}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="px-4 py-3 border-t border-slate-700">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-slate-800 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-auto px-6 py-6 page-bg">
          <div className="animate-fade-in">
            {renderContent()}
          </div>
        </main>

        {/* Command Palette (Ctrl+K) */}
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      </div>
    </ViewContext.Provider>
  );
}

export default App;
