// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import type { LucideIcon } from 'lucide-react'
import {
  Home, Server, Monitor, Layers, Building2, Star, Network, Shield, HardDrive, Database, Cpu,
  HeartPulse, Container, GitBranch, Zap, RefreshCw, Activity, ArrowRightLeft, CheckCircle, Clock,
  FileText, Calendar, TrendingUp, Camera, Save, PackageCheck, Archive, Package, Bell, Terminal,
  BarChart3, AlertTriangle, Bug, HelpCircle, Radio, Lock, Key, Users, Settings, Globe, DollarSign,
  Upload, Download, Disc, Workflow, FileUp, Map, Inbox, Boxes, Wrench, MoreHorizontal, Code,
} from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export interface NavGroup {
  name: string
  compact: string
  barIcon: LucideIcon
  items?: NavItem[]
  sections?: NavSection[]
}

export function flattenNavGroup(g: NavGroup): NavItem[] {
  if (g.items?.length) return g.items
  if (g.sections?.length) return g.sections.flatMap((s) => s.items)
  return []
}

export function navDropdownSections(group: NavGroup): NavSection[] {
  if (group.items?.length) return [{ label: '', items: group.items }]
  return group.sections ?? []
}

/** Always-visible icon shortcuts beside the main nav cluster. */
export const TOP_BAR_QUICK_LINKS: NavItem[] = [
  { label: 'Settings', path: '/settings', icon: Settings },
  { label: 'API Playground', path: '/playground', icon: Code },
]

function dedupeNavPaths(items: NavItem[]): NavItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.path)) return false
    seen.add(item.path)
    return true
  })
}

export const NAV_GROUPS: NavGroup[] = [
  {
    name: 'Core',
    compact: 'Core',
    barIcon: Home,
    items: [
      { label: 'Dashboard', path: '/', icon: Home },
      { label: 'Favorites', path: '/favorites', icon: Star },
      { label: 'Virtual Machines', path: '/vms', icon: Server },
      { label: 'Warm Pools', path: '/vm-pools', icon: PackageCheck },
      { label: 'Machines', path: '/machines', icon: Monitor },
      { label: 'Profiles', path: '/profiles', icon: Layers },
      { label: 'Datacenters', path: '/datacenters', icon: Building2 },
      { label: 'VM Browser', path: '/vm-browser', icon: Monitor },
    ],
  },
  {
    name: 'Infrastructure',
    compact: 'Infra',
    barIcon: Boxes,
    items: [
      { label: 'Network', path: '/network', icon: Network },
      { label: 'Net Security', path: '/network-security', icon: Shield },
      { label: 'Storage', path: '/storage', icon: HardDrive },
      { label: 'Storage Pools', path: '/storage-pools', icon: Database },
      { label: 'Distributed Storage', path: '/distributed-storage', icon: Database },
      { label: 'Resource Pools', path: '/resource-pools', icon: Layers },
      { label: 'System', path: '/system', icon: Cpu },
      { label: 'System Health', path: '/system-health', icon: HeartPulse },
      { label: 'Containers', path: '/containers', icon: Container },
    ],
  },
  {
    name: 'Operations',
    compact: 'Ops',
    barIcon: Zap,
    items: [
      { label: 'DRS', path: '/drs', icon: GitBranch },
      { label: 'Fault Tolerance', path: '/fault-tolerance', icon: Zap },
      { label: 'Replication', path: '/replication', icon: RefreshCw },
      { label: 'Site Recovery', path: '/site-recovery', icon: Activity },
      { label: 'Migrations', path: '/migrations', icon: ArrowRightLeft },
      { label: 'Migration Wizard', path: '/migration-wizard', icon: ArrowRightLeft },
      { label: 'Templates', path: '/templates', icon: Layers },
      { label: 'Content Library', path: '/content-library', icon: Archive },
      { label: 'Schedules', path: '/schedules', icon: Calendar },
      { label: 'Autoscale', path: '/autoscale', icon: TrendingUp },
      { label: 'Availability Zones', path: '/zones', icon: Globe },
      { label: 'Snapshots', path: '/snapshots', icon: Camera },
      { label: 'Backups', path: '/backups', icon: Save },
      { label: 'Quotas', path: '/quotas', icon: Shield },
      { label: 'Lifecycle', path: '/lifecycle', icon: PackageCheck },
      { label: 'Bulk Operations', path: '/bulk-operations', icon: Layers },
    ],
  },
  {
    name: 'Monitoring',
    compact: 'Observe',
    barIcon: Activity,
    items: [
      { label: 'Logs', path: '/logs', icon: Terminal },
      { label: 'Analytics', path: '/analytics', icon: BarChart3 },
      { label: 'Audit', path: '/audit', icon: FileText },
      { label: 'Notifications', path: '/notifications', icon: Bell },
      { label: 'Alerts', path: '/alerts', icon: AlertTriangle },
      { label: 'Timeline', path: '/timeline', icon: Clock },
      { label: 'Processes', path: '/processes', icon: Cpu },
      { label: 'Kernel', path: '/kernel', icon: Server },
      { label: 'Debug Tools', path: '/debug', icon: Bug },
      { label: 'Explain', path: '/explain', icon: HelpCircle },
      { label: 'Live Metrics', path: '/live-metrics', icon: Activity },
      { label: 'Event Stream', path: '/event-stream', icon: Radio },
      { label: 'Optimizer', path: '/resource-optimizer', icon: Zap },
      { label: 'Capacity', path: '/capacity-planning', icon: TrendingUp },
      { label: 'Service Map', path: '/service-map', icon: GitBranch },
    ],
  },
  {
    name: 'Security',
    compact: 'Secure',
    barIcon: Shield,
    items: [
      { label: 'Security Dashboard', path: '/security-dashboard', icon: Shield },
      { label: 'Encryption', path: '/encryption', icon: Lock },
      { label: 'Certificates', path: '/certificates', icon: Key },
      { label: 'Compliance', path: '/compliance', icon: Shield },
      { label: 'Access Control', path: '/access-control', icon: Users },
      { label: 'Plugins', path: '/plugins', icon: Package },
    ],
  },
  {
    name: 'Tools',
    compact: 'Tools',
    barIcon: Wrench,
    items: [
      { label: 'Webhooks', path: '/webhooks', icon: Globe },
      { label: 'Cost Estimator', path: '/cost-estimator', icon: DollarSign },
      { label: 'VM Compare', path: '/vm-compare', icon: ArrowRightLeft },
      { label: 'VM Health Check', path: '/vm-healthcheck', icon: HeartPulse },
      { label: 'Notification Center', path: '/notification-center', icon: Inbox },
    ],
  },
  {
    name: 'More — images, migrations & managers',
    compact: 'More',
    barIcon: MoreHorizontal,
    sections: [
      {
        label: 'Migration advanced',
        items: [
          { label: 'Readiness', path: '/migration-readiness', icon: CheckCircle },
          { label: 'History', path: '/migration-history', icon: Clock },
          { label: 'Report', path: '/migration-report', icon: FileText },
          { label: 'Migration Templates', path: '/migration-templates', icon: FileText },
          { label: 'Batch Migration', path: '/batch-migration', icon: Layers },
        ],
      },
      {
        label: 'Image & disk',
        items: [
          { label: 'ISO Images', path: '/iso-images', icon: Disc },
          { label: 'Upload Disk', path: '/upload-disk', icon: Upload },
          { label: 'Download Disk', path: '/download-disk', icon: Download },
          { label: 'Pipeline', path: '/pipeline', icon: Workflow },
          { label: 'Disk Images', path: '/disk-images', icon: HardDrive },
          { label: 'Disk Converter', path: '/disk-converter', icon: HardDrive },
        ],
      },
      {
        label: 'Managers',
        items: [
          { label: 'Backup Scheduler', path: '/backup-scheduler', icon: Calendar },
          { label: 'Batch Import', path: '/batch-import', icon: FileUp },
          { label: 'Snapshot Mgr', path: '/snapshot-manager', icon: Camera },
          { label: 'Storage Mgr', path: '/storage-manager', icon: Database },
          { label: 'Manifest Builder', path: '/manifest-builder', icon: FileText },
          { label: 'Job Monitor', path: '/job-monitor', icon: Activity },
        ],
      },
      {
        label: 'Network extras',
        items: [{ label: 'Network Topology', path: '/network-topology', icon: Map }],
      },
    ],
  },
]

export const ALL_NAV_ITEMS: NavItem[] = dedupeNavPaths([
  ...NAV_GROUPS.flatMap(flattenNavGroup),
  ...TOP_BAR_QUICK_LINKS,
])

export const PAGE_TITLE_BY_PATH: Record<string, string> = Object.fromEntries(
  ALL_NAV_ITEMS.map((item) => [item.path, item.label]),
)

export const routeLabels: Record<string, string> = {
  ...PAGE_TITLE_BY_PATH,
  '/create': 'Create VM',
}
