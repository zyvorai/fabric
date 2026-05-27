// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

// VM Types
export interface VM {
  name: string;
  state: string;
  cpus: number;
  memory: number;
  disk: number;
  image: string;
  ip?: string;
  pid?: number;
  mac_address?: string;
  hostname?: string;
  tags?: string[];
  vnc_port?: number;
  created: string;
  last_error?: string;
}

export interface CreateVMRequest {
  name: string;
  image: string;
  cpus: number;
  memory: number;
  disk: number;
  hostname?: string;
  tags?: string[];
}

export interface CloudInitConfig {
  user_data?: string;
  meta_data?: string;
  network_config?: string;
}

export interface VMMetrics {
  cpu_usage: number;
  memory_usage: number;
  disk_read: number;
  disk_write: number;
  net_rx: number;
  net_tx: number;
}

// Snapshot Types
export interface VMSnapshot {
  id: string;
  name: string;
  vm_name: string;
  created_at: string;
  size?: number;
  description?: string;
  parent?: string;
}

export interface CreateSnapshotRequest {
  name: string;
  description?: string;
}

// Storage Types
export interface StoragePool {
  name: string;
  state: string;
  type: string;
  capacity: number;
  allocation: number;
  available: number;
  path?: string;
}

export interface Volume {
  name: string;
  path: string;
  capacity: number;
  allocation: number;
  format: string;
  pool?: string;
}

export interface CreateLocalPoolRequest {
  name: string;
  path: string;
}

export interface CreateNfsPoolRequest {
  name: string;
  host: string;
  path: string;
}

export interface CreateVolumeRequest {
  name: string;
  capacity: number;
  format?: string;
}

// Network Types
export interface BridgeConfig {
  id: string;
  name: string;
  description?: string;
  addresses?: string[];
  dhcp?: boolean;
  members?: string[];
}

export interface VlanConfig {
  id: string;
  name: string;
  vlan_id: number;
  parent: string;
  addresses?: string[];
}

export interface MacvtapConfig {
  id: string;
  name: string;
  parent: string;
  mode?: string;
}

export interface TapConfig {
  id: string;
  name: string;
  user?: string;
  group?: string;
}

export interface BondConfig {
  id: string;
  name: string;
  mode: string;
  members: string[];
  addresses?: string[];
}

export interface PortForward {
  id: string;
  protocol: string;
  host_port: number;
  guest_ip: string;
  guest_port: number;
  vm_name?: string;
}

export interface LinkStatus {
  name: string;
  type: string;
  state: string;
  address?: string;
  mtu?: number;
  mac?: string;
  speed?: string;
}

// Network Security Types
export interface NetworkPolicy {
  id: string;
  name: string;
  description?: string;
  rules: FirewallRule[];
  enabled: boolean;
}

export interface FirewallRule {
  id: string;
  direction: string;
  action: string;
  protocol?: string;
  port?: number;
  source?: string;
  destination?: string;
  priority: number;
}

export interface QoSPolicy {
  id: string;
  name: string;
  bandwidth_limit?: number;
  burst_limit?: number;
  priority?: number;
}

// Machine Types (systemd-machined)
export interface Machine {
  name: string;
  class: string;
  service: string;
  os?: string;
  leader?: number;
  state?: string;
  addresses?: string[];
}

export interface MachineImage {
  name: string;
  type: string;
  size: number;
  created: string;
  read_only: boolean;
  usage?: number;
}

// System Types
export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  state: string;
  user: string;
  command: string;
}

export interface CpuTopology {
  total_cpus: number;
  sockets: number;
  cores_per_socket: number;
  threads_per_core: number;
  model: string;
}

export interface NumaTopology {
  nodes: NumaNode[];
}

export interface NumaNode {
  id: number;
  cpus: number[];
  memory_total: number;
  memory_free: number;
}

export interface HugepageStats {
  size: string;
  total: number;
  free: number;
  reserved: number;
}

export interface KernelInfo {
  version: string;
  hostname: string;
  architecture: string;
  uptime: number;
}

export interface KernelModule {
  name: string;
  size: number;
  used_by: string[];
  state: string;
}

export interface Alert {
  id: string;
  severity: string;
  message: string;
  source: string;
  timestamp: string;
  acknowledged: boolean;
}

// Operations Types
export interface Backup {
  id: string;
  vm_name: string;
  status: string;
  size: number;
  created_at: string;
  type: string;
  path?: string;
}

export interface BackupPolicy {
  id: string;
  name: string;
  schedule: string;
  retention: number;
  enabled: boolean;
  vms: string[];
}

export interface Schedule {
  id: string;
  name: string;
  action: string;
  cron: string;
  enabled: boolean;
  target: string;
  last_run?: string;
  next_run?: string;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  cpus: number;
  memory: number;
  disk_size?: number;
  image?: string;
  created_at: string;
}

export interface Profile {
  name: string;
  cpus: number;
  memory: number;
  description?: string;
}

export interface Quota {
  id: string;
  name: string;
  max_vms: number;
  max_cpus: number;
  max_memory: number;
  max_storage: number;
  enabled: boolean;
  usage?: QuotaUsage;
}

export interface QuotaUsage {
  vms: number;
  cpus: number;
  memory: number;
  storage: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user_id: string;
  action: string;
  resource: string;
  status: string;
  details?: string;
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: string;
  config: Record<string, string>;
  enabled: boolean;
}

export interface NotificationRule {
  id: string;
  name: string;
  event: string;
  channel_id: string;
  enabled: boolean;
  conditions?: Record<string, string>;
}

// Image Types
export interface DiskImage {
  name: string;
  path: string;
  size: number;
  format: string;
  mod_time: string;
}

export interface ISOImage {
  name: string;
  path: string;
  size: number;
}

export interface CloudImage {
  name: string;
  url: string;
  size?: number;
  arch?: string;
}

// Cluster Types
export interface Datacenter {
  id: string;
  name: string;
  description?: string;
  location?: string;
  clusters: string[];
}

export interface Cluster {
  id: string;
  name: string;
  datacenter_id: string;
  hosts: string[];
  ha_enabled: boolean;
  drs_enabled: boolean;
}

export interface Host {
  id: string;
  name: string;
  address: string;
  cluster_id?: string;
  state: string;
  cpus: number;
  memory: number;
  vms: number;
}

export interface ResourcePool {
  id: string;
  name: string;
  cpu_limit: number;
  memory_limit: number;
  cpu_reservation: number;
  memory_reservation: number;
  vms: string[];
}

// DRS Types
export interface DRSConfig {
  cluster_id: string;
  enabled: boolean;
  automation_level: string;
  migration_threshold: number;
}

export interface DRSRecommendation {
  id: string;
  vm_name: string;
  source_host: string;
  target_host: string;
  reason: string;
  priority: string;
  status: string;
}

export interface AffinityRule {
  id: string;
  name: string;
  type: string;
  vms: string[];
  enabled: boolean;
}

// Migration Types
export interface Migration {
  id: string;
  vm_name: string;
  source: string;
  destination: string;
  status: string;
  progress: number;
  started_at: string;
  completed_at?: string;
}

// Replication Types
export interface ReplicationSite {
  id: string;
  name: string;
  address: string;
  state: string;
}

export interface ReplicationConfig {
  id: string;
  vm_name: string;
  target_site: string;
  rpo_minutes: number;
  state: string;
}

// Site Recovery Types
export interface RecoveryPlan {
  id: string;
  name: string;
  description?: string;
  source_site: string;
  target_site: string;
  vms: string[];
  status: string;
}

// Fault Tolerance Types
export interface FTConfig {
  vm_name: string;
  secondary_host: string;
  state: string;
  lag_seconds: number;
}

// Encryption Types
export interface EncryptionProvider {
  id: string;
  name: string;
  type: string;
  status: string;
}

export interface EncryptionPolicy {
  id: string;
  name: string;
  algorithm: string;
  key_size: number;
  provider_id: string;
}

// Certificate Types
export interface Certificate {
  id: string;
  subject: string;
  issuer: string;
  valid_from: string;
  valid_to: string;
  status: string;
  type: string;
}

export interface CertificateAuthority {
  id: string;
  name: string;
  type: string;
  certificates_issued: number;
}

// Content Library Types
export interface ContentLibrary {
  id: string;
  name: string;
  type: string;
  storage_path: string;
  item_count: number;
}

export interface ContentLibraryItem {
  id: string;
  name: string;
  type: string;
  library_id: string;
  size: number;
  created_at: string;
}

// Lifecycle Types
export interface LifecycleBaseline {
  id: string;
  name: string;
  type: string;
  description?: string;
  packages: string[];
}

// Settings
export interface AppSettings {
  daemon: { listen: string; cors_origins: string[] };
  storage: { path: string; image_path: string };
  network: { bridge: string };
  auth: { enabled: boolean };
}

// Webhook Types
export interface Webhook {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  secret?: string;
}

// Plugin Types
export interface Plugin {
  name: string;
  version: string;
  enabled: boolean;
  description?: string;
}

// Event Types
export interface SystemEvent {
  id: string;
  type: string;
  source: string;
  message: string;
  timestamp: string;
  severity: string;
}

// Distributed Storage Types
export interface DistributedStoragePool {
  id: string;
  name: string;
  type: string;
  total_capacity: number;
  used_capacity: number;
  hosts: string[];
  state: string;
}

export interface StoragePolicy {
  id: string;
  name: string;
  replication_factor: number;
  tier: string;
  encryption: boolean;
}

// ViewContext for component communication
export interface ViewContext {
  wsConnected: boolean;
  selectedVM: string | null;
  navigateTo: (view: string, vmName?: string) => void;
}
