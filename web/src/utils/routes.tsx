// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import type React from 'react'
import {
  Server, Home, Terminal, Network, HardDrive,
  Layers, Shield, Calendar, FileText, BarChart3, Save, Bell,
  Database, Cpu, Building2, GitBranch,
  Zap, Lock, RefreshCw, Archive, Key, Activity, PackageCheck, Camera,
  ArrowRightLeft, Package, Monitor,
  AlertTriangle, Bug, HelpCircle, Clock, Globe, DollarSign,
  HeartPulse, Container, Inbox, Star, Upload, Download, Disc, Workflow,
  CheckCircle, FileUp, Map, TrendingUp, Users, Radio,
} from 'lucide-react'

export interface NavItem {
  to: string
  icon: React.ReactNode
  label: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: 'Core',
    items: [
      { to: '/', icon: <Home className="w-4 h-4 text-blue-400" />, label: 'Dashboard' },
      { to: '/favorites', icon: <Star className="w-4 h-4 text-yellow-400" />, label: 'Favorites' },
      { to: '/vms', icon: <Server className="w-4 h-4 text-sky-400" />, label: 'Virtual Machines' },
      { to: '/machines', icon: <Monitor className="w-4 h-4 text-cyan-400" />, label: 'Machines' },
      { to: '/profiles', icon: <Layers className="w-4 h-4 text-purple-400" />, label: 'Profiles' },
      { to: '/datacenters', icon: <Building2 className="w-4 h-4 text-amber-400" />, label: 'Datacenters' },
      { to: '/vm-browser', icon: <Monitor className="w-4 h-4 text-sky-400" />, label: 'VM Browser' },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { to: '/network', icon: <Network className="w-4 h-4 text-teal-400" />, label: 'Network' },
      { to: '/network-security', icon: <Shield className="w-4 h-4 text-red-400" />, label: 'Net Security' },
      { to: '/storage', icon: <HardDrive className="w-4 h-4 text-violet-400" />, label: 'Storage' },
      { to: '/storage-pools', icon: <Database className="w-4 h-4 text-blue-400" />, label: 'Storage Pools' },
      { to: '/distributed-storage', icon: <Database className="w-4 h-4 text-indigo-400" />, label: 'Distributed Storage' },
      { to: '/resource-pools', icon: <Layers className="w-4 h-4 text-orange-400" />, label: 'Resource Pools' },
      { to: '/system', icon: <Cpu className="w-4 h-4 text-green-400" />, label: 'System' },
      { to: '/system-health', icon: <HeartPulse className="w-4 h-4 text-pink-400" />, label: 'System Health' },
      { to: '/containers', icon: <Container className="w-4 h-4 text-cyan-400" />, label: 'Containers' },
    ],
  },
  {
    label: 'Cluster',
    items: [
      { to: '/drs', icon: <GitBranch className="w-4 h-4 text-emerald-400" />, label: 'DRS' },
      { to: '/fault-tolerance', icon: <Zap className="w-4 h-4 text-yellow-400" />, label: 'Fault Tolerance' },
      { to: '/replication', icon: <RefreshCw className="w-4 h-4 text-cyan-400" />, label: 'Replication' },
      { to: '/site-recovery', icon: <Activity className="w-4 h-4 text-rose-400" />, label: 'Site Recovery' },
      { to: '/migrations', icon: <ArrowRightLeft className="w-4 h-4 text-green-400" />, label: 'Migrations' },
      { to: '/migration-readiness', icon: <CheckCircle className="w-4 h-4 text-emerald-400" />, label: 'Readiness' },
      { to: '/migration-history', icon: <Clock className="w-4 h-4 text-amber-400" />, label: 'History' },
      { to: '/migration-report', icon: <FileText className="w-4 h-4 text-blue-400" />, label: 'Report' },
      { to: '/migration-wizard', icon: <ArrowRightLeft className="w-4 h-4 text-green-400" />, label: 'Wizard' },
      { to: '/migration-templates', icon: <FileText className="w-4 h-4 text-indigo-400" />, label: 'Templates' },
      { to: '/batch-migration', icon: <Layers className="w-4 h-4 text-pink-400" />, label: 'Batch Migration' },
      { to: '/network-topology', icon: <Map className="w-4 h-4 text-teal-400" />, label: 'Network Topology' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/templates', icon: <Layers className="w-4 h-4 text-indigo-400" />, label: 'Templates' },
      { to: '/content-library', icon: <Archive className="w-4 h-4 text-purple-400" />, label: 'Content Library' },
      { to: '/image-builder', icon: <Package className="w-4 h-4 text-pink-400" />, label: 'Image Builder' },
      { to: '/schedules', icon: <Calendar className="w-4 h-4 text-teal-400" />, label: 'Schedules' },
      { to: '/snapshots', icon: <Camera className="w-4 h-4 text-violet-400" />, label: 'Snapshots' },
      { to: '/backups', icon: <Save className="w-4 h-4 text-amber-400" />, label: 'Backups' },
      { to: '/quotas', icon: <Shield className="w-4 h-4 text-orange-400" />, label: 'Quotas' },
      { to: '/lifecycle', icon: <PackageCheck className="w-4 h-4 text-lime-400" />, label: 'Lifecycle' },
      { to: '/bulk-operations', icon: <Layers className="w-4 h-4 text-blue-400" />, label: 'Bulk Operations' },
      { to: '/iso-images', icon: <Disc className="w-4 h-4 text-pink-400" />, label: 'ISO Images' },
      { to: '/upload-disk', icon: <Upload className="w-4 h-4 text-rose-400" />, label: 'Upload Disk' },
      { to: '/download-disk', icon: <Download className="w-4 h-4 text-cyan-400" />, label: 'Download Disk' },
      { to: '/pipeline', icon: <Workflow className="w-4 h-4 text-emerald-400" />, label: 'Pipeline' },
      { to: '/backup-scheduler', icon: <Calendar className="w-4 h-4 text-teal-400" />, label: 'Backup Scheduler' },
      { to: '/batch-import', icon: <FileUp className="w-4 h-4 text-amber-400" />, label: 'Batch Import' },
      { to: '/snapshot-manager', icon: <Camera className="w-4 h-4 text-purple-400" />, label: 'Snapshot Mgr' },
      { to: '/storage-manager', icon: <Database className="w-4 h-4 text-blue-400" />, label: 'Storage Mgr' },
      { to: '/disk-images', icon: <HardDrive className="w-4 h-4 text-violet-400" />, label: 'Disk Images' },
      { to: '/manifest-builder', icon: <FileText className="w-4 h-4 text-amber-400" />, label: 'Manifest Builder' },
      { to: '/job-monitor', icon: <Activity className="w-4 h-4 text-blue-400" />, label: 'Job Monitor' },
    ],
  },
  {
    label: 'Security',
    items: [
      { to: '/encryption', icon: <Lock className="w-4 h-4 text-red-400" />, label: 'Encryption' },
      { to: '/certificates', icon: <Key className="w-4 h-4 text-yellow-400" />, label: 'Certificates' },
      { to: '/compliance', icon: <Shield className="w-4 h-4 text-blue-400" />, label: 'Compliance' },
      { to: '/access-control', icon: <Users className="w-4 h-4 text-indigo-400" />, label: 'Access Control' },
      { to: '/plugins', icon: <Package className="w-4 h-4 text-pink-400" />, label: 'Plugins' },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { to: '/logs', icon: <Terminal className="w-4 h-4 text-lime-400" />, label: 'Logs' },
      { to: '/analytics', icon: <BarChart3 className="w-4 h-4 text-blue-400" />, label: 'Analytics' },
      { to: '/audit', icon: <FileText className="w-4 h-4 text-amber-400" />, label: 'Audit' },
      { to: '/notifications', icon: <Bell className="w-4 h-4 text-rose-400" />, label: 'Notifications' },
      { to: '/alerts', icon: <AlertTriangle className="w-4 h-4 text-yellow-400" />, label: 'Alerts' },
      { to: '/timeline', icon: <Clock className="w-4 h-4 text-purple-400" />, label: 'Timeline' },
    ],
  },
  {
    label: 'Observability',
    items: [
      { to: '/processes', icon: <Cpu className="w-4 h-4 text-blue-400" />, label: 'Processes' },
      { to: '/security-dashboard', icon: <Shield className="w-4 h-4 text-red-400" />, label: 'Security' },
      { to: '/kernel', icon: <Server className="w-4 h-4 text-violet-400" />, label: 'Kernel' },
      { to: '/debug', icon: <Bug className="w-4 h-4 text-emerald-400" />, label: 'Debug Tools' },
      { to: '/explain', icon: <HelpCircle className="w-4 h-4 text-orange-400" />, label: 'Explain' },
      { to: '/live-metrics', icon: <Activity className="w-4 h-4 text-green-400" />, label: 'Live Metrics' },
      { to: '/event-stream', icon: <Radio className="w-4 h-4 text-rose-400" />, label: 'Event Stream' },
      { to: '/resource-optimizer', icon: <Zap className="w-4 h-4 text-yellow-400" />, label: 'Optimizer' },
      { to: '/capacity-planning', icon: <TrendingUp className="w-4 h-4 text-emerald-400" />, label: 'Capacity' },
      { to: '/service-map', icon: <GitBranch className="w-4 h-4 text-teal-400" />, label: 'Service Map' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/webhooks', icon: <Globe className="w-4 h-4 text-orange-400" />, label: 'Webhooks' },
      { to: '/playground', icon: <Terminal className="w-4 h-4 text-green-400" />, label: 'API Playground' },
      { to: '/cost-estimator', icon: <DollarSign className="w-4 h-4 text-green-400" />, label: 'Cost Estimator' },
      { to: '/disk-converter', icon: <HardDrive className="w-4 h-4 text-teal-400" />, label: 'Disk Converter' },
      { to: '/vm-compare', icon: <ArrowRightLeft className="w-4 h-4 text-violet-400" />, label: 'VM Compare' },
      { to: '/vm-healthcheck', icon: <HeartPulse className="w-4 h-4 text-pink-400" />, label: 'VM Health Check' },
      { to: '/notification-center', icon: <Inbox className="w-4 h-4 text-rose-400" />, label: 'Notification Center' },
    ],
  },
]

export function navItemActive(item: NavItem, pathname: string, search = ''): boolean {
  const [path, query] = item.to.split('?')
  if (query) {
    if (pathname !== path) return false
    const params = new URLSearchParams(query)
    for (const [k, v] of params.entries()) {
      if (new URLSearchParams(search).get(k) !== v) return false
    }
    return true
  }
  if (path === '/') return pathname === '/'
  return pathname === path || pathname.startsWith(path + '/')
}

export function navGroupHasActive(group: NavGroup, pathname: string, search = ''): boolean {
  return group.items.some((item) => navItemActive(item, pathname, search))
}

export const routeLabels: Record<string, string> = {
  '/': 'Dashboard',
  '/vms': 'Virtual Machines',
  '/create': 'Create VM',
  '/settings': 'Settings',
  '/network': 'Network',
  '/network-security': 'Net Security',
  '/storage': 'Storage',
  '/storage-pools': 'Storage Pools',
  '/live-metrics': 'Live Metrics',
  '/backups': 'Backups',
  '/disk-images': 'Disk Images',
  '/audit': 'Audit',
  '/logs': 'Logs',
  '/machines': 'Machines',
  '/migrations': 'Migrations',
  '/migration-readiness': 'Migration Readiness',
  '/migration-history': 'Migration History',
  '/migration-report': 'Migration Report',
  '/migration-wizard': 'Migration Wizard',
  '/migration-templates': 'Migration Templates',
  '/batch-migration': 'Batch Migration',
  '/templates': 'Templates',
  '/schedules': 'Schedules',
}
