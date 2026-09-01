// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

// ---------------------------------------------------------------------------
// Zyvor Fabric API client (legacy UI)
// ---------------------------------------------------------------------------
// Complete typed API layer for 266+ backend endpoints.
// All routes live under /api/ and are proxied by Vite in development.
// ---------------------------------------------------------------------------

const BASE = '/api';

// ---- Token management -----------------------------------------------------

function getToken(): string | null {
  return sessionStorage.getItem('vmspawnd_token');
}

export function setToken(token: string) {
  sessionStorage.setItem('vmspawnd_token', token);
}

export function clearToken() {
  sessionStorage.removeItem('vmspawnd_token');
}

// ---- Core HTTP helpers ----------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (init?.body && !headers['Content-Type'])
    headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as unknown as T);
}

async function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function apiDelete<T = void>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE' });
}

// ---- Health ---------------------------------------------------------------

export async function getHealth(): Promise<boolean> {
  try {
    const res = await fetch('/health');
    return res.ok;
  } catch {
    return false;
  }
}

// ---- Auth -----------------------------------------------------------------

export const auth = {
  login: (username: string, password: string) =>
    apiPost<{ token: string; username: string; role: string }>('/auth/login', {
      username,
      password,
    }),
  me: () => apiGet<{ username: string; role: string }>('/auth/me'),
  listProviders: () => apiGet<unknown[]>('/auth/providers'),
  createProvider: (p: unknown) => apiPost<unknown>('/auth/providers', p),
  deleteProvider: (id: string) => apiDelete(`/auth/providers/${id}`),
  testProvider: (id: string) => apiPost<unknown>(`/auth/providers/${id}/test`),
  oidcLoginUrl: (providerId: string) =>
    apiGet<{ url: string }>(`/auth/oidc/login/${providerId}`),
  oidcCallback: (body: unknown) => apiPost<unknown>('/auth/oidc/callback', body),
};

// ---- VM management --------------------------------------------------------

export const vmApi = {
  list: (offset = 0, limit = 200) =>
    apiGet<{ items: unknown[]; total: number }>(`/vms?offset=${offset}&limit=${limit}`),
  get: (name: string) => apiGet<unknown>(`/vms/${name}`),
  create: (req: unknown) => apiPost<unknown>('/vms', req),
  delete: (name: string) => apiDelete(`/vms/${name}`),
  start: (name: string) => apiPost<unknown>(`/vms/${name}/start`),
  stop: (name: string) => apiPost<unknown>(`/vms/${name}/stop`),
  restart: (name: string) => apiPost<unknown>(`/vms/${name}/restart`),
  pause: (name: string) => apiPost<unknown>(`/vms/${name}/pause`),
  resume: (name: string) => apiPost<unknown>(`/vms/${name}/resume`),
  clone: (name: string, req: { target_name: string; linked_clone?: boolean }) =>
    apiPost<unknown>(`/vms/${name}/clone`, req),
  metrics: (name: string) => apiGet<unknown>(`/vms/${name}/metrics`),
  cloudInit: (name: string, config: unknown) =>
    apiPost<unknown>(`/vms/${name}/cloud-init`, config),
  // Hotplug
  hotplugCpu: (name: string, body: unknown) =>
    apiPost<unknown>(`/vms/${name}/hotplug/cpu`, body),
  hotplugMemory: (name: string, body: unknown) =>
    apiPost<unknown>(`/vms/${name}/hotplug/memory`, body),
  hotplugDisk: (name: string, body: unknown) =>
    apiPost<unknown>(`/vms/${name}/hotplug/disk`, body),
  hotremoveDisk: (name: string, id: string) =>
    apiDelete(`/vms/${name}/hotplug/disk/${id}`),
  hotplugNic: (name: string, body: unknown) =>
    apiPost<unknown>(`/vms/${name}/hotplug/nic`, body),
  hotremoveNic: (name: string, id: string) =>
    apiDelete(`/vms/${name}/hotplug/nic/${id}`),
  // CPU pinning
  setCpuPin: (name: string, body: unknown) =>
    apiPost<unknown>(`/vms/${name}/cpu/pin`, body),
  removeCpuPin: (name: string) => apiDelete(`/vms/${name}/cpu/pin`),
  getCpuAffinity: (name: string) => apiGet<unknown>(`/vms/${name}/cpu/affinity`),
  // Memory
  setMemoryLimit: (name: string, body: unknown) =>
    apiPut<unknown>(`/vms/${name}/memory/limit`, body),
  getMemoryUsage: (name: string) => apiGet<unknown>(`/vms/${name}/memory/usage`),
  setMemoryBalloon: (name: string, body: unknown) =>
    apiPost<unknown>(`/vms/${name}/memory/balloon`, body),
  // Firmware
  getFirmwareStatus: (name: string) =>
    apiGet<unknown>(`/vms/${name}/firmware/status`),
  enableUefi: (name: string) =>
    apiPost<unknown>(`/vms/${name}/firmware/uefi`),
  enableSecureboot: (name: string) =>
    apiPost<unknown>(`/vms/${name}/firmware/secureboot`),
  disableSecureboot: (name: string) =>
    apiDelete(`/vms/${name}/firmware/secureboot`),
  resetNvram: (name: string) =>
    apiPost<unknown>(`/vms/${name}/firmware/reset`),
  // Firewall
  getFirewall: (name: string) => apiGet<unknown>(`/vms/${name}/firewall`),
  assignFirewall: (name: string, body: unknown) =>
    apiPut<unknown>(`/vms/${name}/firewall`, body),
  removeFirewall: (name: string) => apiDelete(`/vms/${name}/firewall`),
  // Checkpoints
  listCheckpoints: (name: string) =>
    apiGet<unknown[]>(`/vms/${name}/checkpoints`),
  createCheckpoint: (name: string, body: unknown) =>
    apiPost<unknown>(`/vms/${name}/checkpoints`, body),
  restoreCheckpoint: (name: string, id: string) =>
    apiPost<unknown>(`/vms/${name}/checkpoints/${id}/restore`),
  deleteCheckpoint: (name: string, id: string) =>
    apiDelete(`/vms/${name}/checkpoints/${id}`),
  // Fork
  fork: (name: string, body: unknown) =>
    apiPost<unknown>(`/vms/${name}/fork`, body),
  // Declarative
  apply: (spec: unknown) => apiPost<unknown>('/vms/apply', spec),
  exportSpec: (name: string) => apiGet<unknown>(`/vms/${name}/spec`),
  // Disk resize
  resizeDisk: (name: string, body: unknown) =>
    apiPost<unknown>(`/vms/${name}/disk/resize`, body),
  // Hibernate
  hibernate: (name: string) => apiPost<unknown>(`/vms/${name}/hibernate`),
  resumeHibernate: (name: string) =>
    apiPost<unknown>(`/vms/${name}/resume-hibernate`),
  // Storage migration
  migrateStorage: (name: string, body: unknown) =>
    apiPost<unknown>(`/vms/${name}/storage/migrate`, body),
  // Optimize
  optimize: (name: string) => apiPost<unknown>(`/vms/${name}/optimize`),
};

// ---- Snapshots ------------------------------------------------------------

export const snapshotApi = {
  list: (vm: string) => apiGet<unknown[]>(`/vms/${vm}/snapshots`),
  create: (vm: string, req: unknown) =>
    apiPost<unknown>(`/vms/${vm}/snapshots`, req),
  get: (vm: string, id: string) =>
    apiGet<unknown>(`/vms/${vm}/snapshots/${id}`),
  delete: (vm: string, id: string) =>
    apiDelete(`/vms/${vm}/snapshots/${id}`),
  revert: (vm: string, id: string) =>
    apiPost<unknown>(`/vms/${vm}/snapshots/${id}/revert`),
  tree: (vm: string) => apiGet<unknown>(`/vms/${vm}/snapshots/tree`),
};

// ---- Storage --------------------------------------------------------------

export const storageApi = {
  // Pools
  listPools: () => apiGet<unknown[]>('/storage/pools'),
  getPool: (name: string) => apiGet<unknown>(`/storage/pools/${name}`),
  createLocalPool: (body: unknown) =>
    apiPost<unknown>('/storage/pools/local', body),
  createNfsPool: (body: unknown) =>
    apiPost<unknown>('/storage/pools/nfs', body),
  createLvmPool: (body: unknown) =>
    apiPost<unknown>('/storage/pools/lvm', body),
  createLvmThinPool: (body: unknown) =>
    apiPost<unknown>('/storage/pools/lvm-thin', body),
  createZfsPool: (body: unknown) =>
    apiPost<unknown>('/storage/pools/zfs', body),
  createCephPool: (body: unknown) =>
    apiPost<unknown>('/storage/pools/ceph', body),
  deletePool: (name: string) => apiDelete(`/storage/pools/${name}`),
  startPool: (name: string) =>
    apiPost<unknown>(`/storage/pools/${name}/start`),
  stopPool: (name: string) =>
    apiPost<unknown>(`/storage/pools/${name}/stop`),
  getPoolHealth: (name: string) =>
    apiGet<unknown>(`/storage/pools/${name}/health`),
  getPoolStats: (name: string) =>
    apiGet<unknown>(`/storage/pools/${name}/stats`),
  refreshPoolStats: (name: string) =>
    apiPost<unknown>(`/storage/pools/${name}/refresh`),
  // Volumes
  listVolumes: (pool: string) =>
    apiGet<unknown[]>(`/storage/pools/${pool}/volumes`),
  createVolume: (pool: string, body: unknown) =>
    apiPost<unknown>(`/storage/pools/${pool}/volumes`, body),
  getVolume: (pool: string, id: string) =>
    apiGet<unknown>(`/storage/pools/${pool}/volumes/${id}`),
  deleteVolume: (pool: string, id: string) =>
    apiDelete(`/storage/pools/${pool}/volumes/${id}`),
  resizeVolume: (pool: string, id: string, body: unknown) =>
    apiPost<unknown>(`/storage/pools/${pool}/volumes/${id}/resize`, body),
  attachVolume: (pool: string, id: string, body: unknown) =>
    apiPost<unknown>(`/storage/pools/${pool}/volumes/${id}/attach`, body),
  detachVolume: (pool: string, id: string) =>
    apiPost<unknown>(`/storage/pools/${pool}/volumes/${id}/detach`),
};

// ---- Network (systemd-networkd) -------------------------------------------

export const networkApi = {
  // Bridges
  listBridges: () => apiGet<unknown[]>('/networkd/bridges'),
  createBridge: (body: unknown) => apiPost<unknown>('/networkd/bridges', body),
  getBridge: (id: string) => apiGet<unknown>(`/networkd/bridges/${id}`),
  updateBridge: (id: string, body: unknown) =>
    apiPut<unknown>(`/networkd/bridges/${id}`, body),
  deleteBridge: (id: string) => apiDelete(`/networkd/bridges/${id}`),
  // VLANs
  listVlans: () => apiGet<unknown[]>('/networkd/vlans'),
  createVlan: (body: unknown) => apiPost<unknown>('/networkd/vlans', body),
  getVlan: (id: string) => apiGet<unknown>(`/networkd/vlans/${id}`),
  updateVlan: (id: string, body: unknown) =>
    apiPut<unknown>(`/networkd/vlans/${id}`, body),
  deleteVlan: (id: string) => apiDelete(`/networkd/vlans/${id}`),
  // MACVTAPs
  listMacvtaps: () => apiGet<unknown[]>('/networkd/macvtaps'),
  createMacvtap: (body: unknown) =>
    apiPost<unknown>('/networkd/macvtaps', body),
  getMacvtap: (id: string) => apiGet<unknown>(`/networkd/macvtaps/${id}`),
  deleteMacvtap: (id: string) => apiDelete(`/networkd/macvtaps/${id}`),
  // TAPs
  listTaps: () => apiGet<unknown[]>('/networkd/taps'),
  createTap: (body: unknown) => apiPost<unknown>('/networkd/taps', body),
  getTap: (id: string) => apiGet<unknown>(`/networkd/taps/${id}`),
  deleteTap: (id: string) => apiDelete(`/networkd/taps/${id}`),
  // Bonds
  listBonds: () => apiGet<unknown[]>('/networkd/bonds'),
  createBond: (body: unknown) => apiPost<unknown>('/networkd/bonds', body),
  getBond: (id: string) => apiGet<unknown>(`/networkd/bonds/${id}`),
  updateBond: (id: string, body: unknown) =>
    apiPut<unknown>(`/networkd/bonds/${id}`, body),
  deleteBond: (id: string) => apiDelete(`/networkd/bonds/${id}`),
  // Network files
  listNetworkFiles: () => apiGet<unknown[]>('/networkd/network-files'),
  createNetworkFile: (body: unknown) =>
    apiPost<unknown>('/networkd/network-files', body),
  getNetworkFile: (id: string) =>
    apiGet<unknown>(`/networkd/network-files/${id}`),
  deleteNetworkFile: (id: string) =>
    apiDelete(`/networkd/network-files/${id}`),
  // Link files
  listLinkFiles: () => apiGet<unknown[]>('/networkd/link-files'),
  createLinkFile: (body: unknown) =>
    apiPost<unknown>('/networkd/link-files', body),
  deleteLinkFile: (id: string) => apiDelete(`/networkd/link-files/${id}`),
  // Links
  listLinks: () => apiGet<unknown[]>('/networkd/links'),
  getDeviceStatus: (name: string) =>
    apiGet<unknown>(`/networkd/links/${name}/status`),
  // Reload
  reload: () => apiPost<unknown>('/networkd/reload'),
  listManagedFiles: () => apiGet<unknown[]>('/networkd/files'),
  scanConfigs: () => apiGet<unknown>('/networkd/scan'),
  // Port forwards
  listPortForwards: () => apiGet<unknown[]>('/networkd/port-forwards'),
  createPortForward: (body: unknown) =>
    apiPost<unknown>('/networkd/port-forwards', body),
  getPortForward: (id: string) =>
    apiGet<unknown>(`/networkd/port-forwards/${id}`),
  deletePortForward: (id: string) =>
    apiDelete(`/networkd/port-forwards/${id}`),
  syncPortForwards: () => apiPost<unknown>('/networkd/port-forwards/sync'),
  // VXLANs
  listVxlans: () => apiGet<unknown[]>('/networkd/vxlans'),
  createVxlan: (body: unknown) => apiPost<unknown>('/networkd/vxlans', body),
  getVxlan: (id: string) => apiGet<unknown>(`/networkd/vxlans/${id}`),
  deleteVxlan: (id: string) => apiDelete(`/networkd/vxlans/${id}`),
  // SR-IOV
  listSriov: () => apiGet<unknown[]>('/networkd/sriov'),
  createSriov: (body: unknown) => apiPost<unknown>('/networkd/sriov', body),
  getSriov: (id: string) => apiGet<unknown>(`/networkd/sriov/${id}`),
  deleteSriov: (id: string) => apiDelete(`/networkd/sriov/${id}`),
  // Netlink (real-time kernel interface data)
  listNetlinkInterfaces: () => apiGet<unknown[]>('/networkd/netlink/interfaces'),
  listPhysicalInterfaces: () => apiGet<unknown[]>('/networkd/netlink/physical'),
  listAvailableInterfaces: () => apiGet<unknown[]>('/networkd/netlink/available'),
};

// ---- Network Security -----------------------------------------------------

export const networkSecurityApi = {
  // Network policies
  listPolicies: () => apiGet<unknown[]>('/network-policies'),
  createPolicy: (body: unknown) =>
    apiPost<unknown>('/network-policies', body),
  getPolicy: (id: string) => apiGet<unknown>(`/network-policies/${id}`),
  updatePolicy: (id: string, body: unknown) =>
    apiPut<unknown>(`/network-policies/${id}`, body),
  deletePolicy: (id: string) => apiDelete(`/network-policies/${id}`),
  syncPolicies: () => apiPost<unknown>('/network-policies/sync'),
  getPolicyStatus: () => apiGet<unknown>('/network-policies/status'),
  listIdentities: () => apiGet<unknown[]>('/identities'),
  getIdentity: (id: string) => apiGet<unknown>(`/identities/${id}`),
  // Firewall profiles
  listFirewallProfiles: () => apiGet<unknown[]>('/firewall-profiles'),
  createFirewallProfile: (body: unknown) =>
    apiPost<unknown>('/firewall-profiles', body),
  getFirewallProfile: (id: string) =>
    apiGet<unknown>(`/firewall-profiles/${id}`),
  updateFirewallProfile: (id: string, body: unknown) =>
    apiPut<unknown>(`/firewall-profiles/${id}`, body),
  deleteFirewallProfile: (id: string) =>
    apiDelete(`/firewall-profiles/${id}`),
  // Firewall zones
  listFirewallZones: () => apiGet<unknown[]>('/firewall-zones'),
  createFirewallZone: (body: unknown) =>
    apiPost<unknown>('/firewall-zones', body),
  getFirewallZone: (id: string) =>
    apiGet<unknown>(`/firewall-zones/${id}`),
  deleteFirewallZone: (id: string) =>
    apiDelete(`/firewall-zones/${id}`),
  syncFirewall: () => apiPost<unknown>('/firewall/sync'),
  getFirewallStatus: () => apiGet<unknown>('/firewall/status'),
  // QoS / Traffic shaping
  listQosPolicies: () => apiGet<unknown[]>('/qos-policies'),
  createQosPolicy: (body: unknown) =>
    apiPost<unknown>('/qos-policies', body),
  getQosPolicy: (id: string) => apiGet<unknown>(`/qos-policies/${id}`),
  updateQosPolicy: (id: string, body: unknown) =>
    apiPut<unknown>(`/qos-policies/${id}`, body),
  deleteQosPolicy: (id: string) => apiDelete(`/qos-policies/${id}`),
  syncQosPolicies: () => apiPost<unknown>('/qos-policies/sync'),
  getQosStatus: () => apiGet<unknown>('/qos-policies/status'),
  // DNS zones / policies
  listDnsZones: () => apiGet<unknown[]>('/dns-zones'),
  createDnsZone: (body: unknown) => apiPost<unknown>('/dns-zones', body),
  getDnsZone: (id: string) => apiGet<unknown>(`/dns-zones/${id}`),
  deleteDnsZone: (id: string) => apiDelete(`/dns-zones/${id}`),
  listDnsPolicies: () => apiGet<unknown[]>('/dns-policies'),
  createDnsPolicy: (body: unknown) =>
    apiPost<unknown>('/dns-policies', body),
  getDnsPolicy: (id: string) => apiGet<unknown>(`/dns-policies/${id}`),
  updateDnsPolicy: (id: string, body: unknown) =>
    apiPut<unknown>(`/dns-policies/${id}`, body),
  deleteDnsPolicy: (id: string) => apiDelete(`/dns-policies/${id}`),
  syncDnsPolicies: () => apiPost<unknown>('/dns-policies/sync'),
  listDnsRecords: () => apiGet<unknown[]>('/dns-records'),
  // VPN tunnels / networks
  listVpnTunnels: () => apiGet<unknown[]>('/vpn-tunnels'),
  createVpnTunnel: (body: unknown) =>
    apiPost<unknown>('/vpn-tunnels', body),
  getVpnTunnel: (id: string) => apiGet<unknown>(`/vpn-tunnels/${id}`),
  updateVpnTunnel: (id: string, body: unknown) =>
    apiPut<unknown>(`/vpn-tunnels/${id}`, body),
  deleteVpnTunnel: (id: string) => apiDelete(`/vpn-tunnels/${id}`),
  syncVpnTunnels: () => apiPost<unknown>('/vpn-tunnels/sync'),
  getVpnTunnelStatus: () => apiGet<unknown>('/vpn-tunnels/status'),
  listVpnNetworks: () => apiGet<unknown[]>('/vpn-networks'),
  createVpnNetwork: (body: unknown) =>
    apiPost<unknown>('/vpn-networks', body),
  getVpnNetwork: (id: string) => apiGet<unknown>(`/vpn-networks/${id}`),
  updateVpnNetwork: (id: string, body: unknown) =>
    apiPut<unknown>(`/vpn-networks/${id}`, body),
  deleteVpnNetwork: (id: string) => apiDelete(`/vpn-networks/${id}`),
  getVpnNetworkStatus: () => apiGet<unknown>('/vpn-networks/status'),
  // NAT rules / pools / gateways
  listNatRules: () => apiGet<unknown[]>('/nat-rules'),
  createNatRule: (body: unknown) => apiPost<unknown>('/nat-rules', body),
  getNatRule: (id: string) => apiGet<unknown>(`/nat-rules/${id}`),
  updateNatRule: (id: string, body: unknown) =>
    apiPut<unknown>(`/nat-rules/${id}`, body),
  deleteNatRule: (id: string) => apiDelete(`/nat-rules/${id}`),
  syncNatRules: () => apiPost<unknown>('/nat-rules/sync'),
  getNatStatus: () => apiGet<unknown>('/nat-rules/status'),
  listNatPools: () => apiGet<unknown[]>('/nat-pools'),
  createNatPool: (body: unknown) => apiPost<unknown>('/nat-pools', body),
  getNatPool: (id: string) => apiGet<unknown>(`/nat-pools/${id}`),
  deleteNatPool: (id: string) => apiDelete(`/nat-pools/${id}`),
  listNatGateways: () => apiGet<unknown[]>('/nat-gateways'),
  createNatGateway: (body: unknown) =>
    apiPost<unknown>('/nat-gateways', body),
  getNatGateway: (id: string) => apiGet<unknown>(`/nat-gateways/${id}`),
  deleteNatGateway: (id: string) => apiDelete(`/nat-gateways/${id}`),
  // Packet mirror sessions
  listMirrorSessions: () => apiGet<unknown[]>('/mirror-sessions'),
  createMirrorSession: (body: unknown) =>
    apiPost<unknown>('/mirror-sessions', body),
  getMirrorSession: (id: string) =>
    apiGet<unknown>(`/mirror-sessions/${id}`),
  updateMirrorSession: (id: string, body: unknown) =>
    apiPut<unknown>(`/mirror-sessions/${id}`, body),
  deleteMirrorSession: (id: string) =>
    apiDelete(`/mirror-sessions/${id}`),
  syncMirrorSessions: () => apiPost<unknown>('/mirror-sessions/sync'),
  getMirrorStatus: () => apiGet<unknown>('/mirror-sessions/status'),
  // Network monitor
  listMonitorPolicies: () => apiGet<unknown[]>('/monitor-policies'),
  createMonitorPolicy: (body: unknown) =>
    apiPost<unknown>('/monitor-policies', body),
  getMonitorPolicy: (id: string) =>
    apiGet<unknown>(`/monitor-policies/${id}`),
  updateMonitorPolicy: (id: string, body: unknown) =>
    apiPut<unknown>(`/monitor-policies/${id}`, body),
  deleteMonitorPolicy: (id: string) =>
    apiDelete(`/monitor-policies/${id}`),
  syncMonitorPolicies: () => apiPost<unknown>('/monitor-policies/sync'),
  getMonitorStatus: () => apiGet<unknown>('/monitor-policies/status'),
  getAllNetworkMetrics: () => apiGet<unknown>('/network-metrics'),
  getVmNetworkMetrics: (name: string) =>
    apiGet<unknown>(`/network-metrics/${name}`),
  getBandwidthAlerts: () => apiGet<unknown[]>('/bandwidth-alerts'),
};

// ---- System ---------------------------------------------------------------

export const systemApi = {
  getCpuTopology: () => apiGet<unknown>('/system/cpu/topology'),
  getNumaTopology: () => apiGet<unknown>('/system/numa/topology'),
  getNumaNode: (id: string) => apiGet<unknown>(`/system/numa/nodes/${id}`),
  getNumaPlacement: () => apiGet<unknown>('/system/numa/placement'),
  getSystemMemory: () => apiGet<unknown>('/system/memory'),
  getHugepageStats: () => apiGet<unknown>('/system/memory/hugepages'),
  allocateHugepages: (body: unknown) =>
    apiPost<unknown>('/system/memory/hugepages', body),
  getFirmwareCapabilities: () =>
    apiGet<unknown>('/system/firmware/capabilities'),
  getKsmStatus: () => apiGet<unknown>('/system/ksm'),
  configureKsm: (body: unknown) => apiPost<unknown>('/system/ksm', body),
  getNestedVirtStatus: () => apiGet<unknown>('/system/nested-virt'),
  setNestedVirt: (body: unknown) =>
    apiPost<unknown>('/system/nested-virt', body),
  getOptimizationRecommendations: () =>
    apiGet<unknown>('/system/optimization/recommendations'),
  // Overcommit / capacity
  getOvercommitPolicy: () => apiGet<unknown>('/system/overcommit'),
  updateOvercommitPolicy: (body: unknown) =>
    apiPut<unknown>('/system/overcommit', body),
  getCapacity: () => apiGet<unknown>('/system/capacity'),
  // Metrics retention
  getMetricsRetention: () => apiGet<unknown>('/system/metrics/retention'),
  updateMetricsRetention: (body: unknown) =>
    apiPut<unknown>('/system/metrics/retention', body),
  cleanupMetrics: () => apiPost<unknown>('/system/metrics/cleanup'),
  // DB migrations
  listMigrations: () => apiGet<unknown[]>('/system/migrations'),
  applyMigrations: () => apiPost<unknown>('/system/migrations/apply'),
  getMigrationStatus: () => apiGet<unknown>('/system/migrations/status'),
  // Rate limits
  getRateLimits: () => apiGet<unknown>('/system/rate-limits'),
  updateRateLimits: (body: unknown) =>
    apiPut<unknown>('/system/rate-limits', body),
};

// ---- Machine (machinectl/machined) ----------------------------------------

export const machineApi = {
  list: () => apiGet<unknown[]>('/machines'),
  // Machine images
  listImages: () => apiGet<unknown[]>('/machines/images'),
  pullRawImage: (body: unknown) =>
    apiPost<unknown>('/machines/images/pull-raw', body),
  pullTarImage: (body: unknown) =>
    apiPost<unknown>('/machines/images/pull-tar', body),
  importRawImage: (body: unknown) =>
    apiPost<unknown>('/machines/images/import-raw', body),
  importTarImage: (body: unknown) =>
    apiPost<unknown>('/machines/images/import-tar', body),
  cleanImages: () => apiPost<unknown>('/machines/images/clean'),
  cloneImage: (name: string, body: unknown) =>
    apiPost<unknown>(`/machines/images/${name}/clone`, body),
  renameImage: (name: string, body: unknown) =>
    apiPost<unknown>(`/machines/images/${name}/rename`, body),
  setImageReadOnly: (name: string, body: unknown) =>
    apiPost<unknown>(`/machines/images/${name}/read-only`, body),
  exportRawImage: (name: string) =>
    apiPost<unknown>(`/machines/images/${name}/export-raw`),
  exportTarImage: (name: string) =>
    apiPost<unknown>(`/machines/images/${name}/export-tar`),
  removeImage: (name: string) =>
    apiDelete(`/machines/images/${name}`),
  // Machine operations
  show: (name: string) =>
    apiGet<unknown>(`/machines/${name}/properties`),
  poweroff: (name: string) =>
    apiPost<unknown>(`/machines/${name}/poweroff`),
  reboot: (name: string) =>
    apiPost<unknown>(`/machines/${name}/reboot`),
  terminate: (name: string) =>
    apiPost<unknown>(`/machines/${name}/terminate`),
  enable: (name: string) =>
    apiPost<unknown>(`/machines/${name}/enable`),
  disable: (name: string) =>
    apiPost<unknown>(`/machines/${name}/disable`),
  shell: (name: string, body: unknown) =>
    apiPost<unknown>(`/machines/${name}/shell`, body),
  sshInfo: (name: string) =>
    apiGet<unknown>(`/machines/${name}/ssh`),
  copyTo: (name: string, body: unknown) =>
    apiPost<unknown>(`/machines/${name}/copy-to`, body),
  copyFrom: (name: string, body: unknown) =>
    apiPost<unknown>(`/machines/${name}/copy-from`, body),
  bind: (name: string, body: unknown) =>
    apiPost<unknown>(`/machines/${name}/bind`, body),
};

// ---- Backups --------------------------------------------------------------

export const backupApi = {
  list: () => apiGet<unknown[]>('/backups'),
  create: (body: unknown) => apiPost<unknown>('/backups', body),
  get: (id: string) => apiGet<unknown>(`/backups/${id}`),
  delete: (id: string) => apiDelete(`/backups/${id}`),
  restore: (body: unknown) => apiPost<unknown>('/backups/restore', body),
  listJobs: () => apiGet<unknown[]>('/backups/jobs'),
  getJob: (id: string) => apiGet<unknown>(`/backups/jobs/${id}`),
  listPolicies: () => apiGet<unknown[]>('/backups/policies'),
  createPolicy: (body: unknown) =>
    apiPost<unknown>('/backups/policies', body),
  deletePolicy: (id: string) =>
    apiDelete(`/backups/policies/${id}`),
  enablePolicy: (id: string) =>
    apiPost<unknown>(`/backups/policies/${id}/enable`),
  disablePolicy: (id: string) =>
    apiPost<unknown>(`/backups/policies/${id}/disable`),
  getStats: () => apiGet<unknown>('/backups/stats'),
};

// ---- Schedules ------------------------------------------------------------

export const scheduleApi = {
  list: () => apiGet<unknown[]>('/schedules'),
  create: (body: unknown) => apiPost<unknown>('/schedules', body),
  get: (id: string) => apiGet<unknown>(`/schedules/${id}`),
  update: (id: string, body: unknown) =>
    apiPut<unknown>(`/schedules/${id}`, body),
  delete: (id: string) => apiDelete(`/schedules/${id}`),
  enable: (id: string) => apiPost<unknown>(`/schedules/${id}/enable`),
  disable: (id: string) => apiPost<unknown>(`/schedules/${id}/disable`),
  run: (id: string) => apiPost<unknown>(`/schedules/${id}/run`),
  getHistory: (id: string) =>
    apiGet<unknown[]>(`/schedules/${id}/history`),
  getAllHistory: () => apiGet<unknown[]>('/schedules/history'),
};

// ---- Quotas ---------------------------------------------------------------

export const quotaApi = {
  list: () => apiGet<unknown[]>('/quotas'),
  create: (body: unknown) => apiPost<unknown>('/quotas', body),
  get: (id: string) => apiGet<unknown>(`/quotas/${id}`),
  update: (id: string, body: unknown) =>
    apiPut<unknown>(`/quotas/${id}`, body),
  delete: (id: string) => apiDelete(`/quotas/${id}`),
  enable: (id: string) => apiPost<unknown>(`/quotas/${id}/enable`),
  disable: (id: string) => apiPost<unknown>(`/quotas/${id}/disable`),
  getUsage: (id: string) => apiGet<unknown>(`/quotas/${id}/usage`),
  getAllUsage: () => apiGet<unknown>('/quotas/usage'),
};

// ---- Templates ------------------------------------------------------------

export const templateApi = {
  list: () => apiGet<unknown[]>('/templates'),
  create: (body: unknown) => apiPost<unknown>('/templates', body),
  get: (id: string) => apiGet<unknown>(`/templates/${id}`),
  update: (id: string, body: unknown) =>
    apiPut<unknown>(`/templates/${id}`, body),
  delete: (id: string) => apiDelete(`/templates/${id}`),
  deploy: (id: string, body: unknown) =>
    apiPost<unknown>(`/templates/${id}/deploy`, body),
};

// ---- Profiles -------------------------------------------------------------

export const profileApi = {
  list: () => apiGet<unknown[]>('/profiles'),
  create: (body: unknown) => apiPost<unknown>('/profiles', body),
  get: (name: string) => apiGet<unknown>(`/profiles/${name}`),
  delete: (name: string) => apiDelete(`/profiles/${name}`),
};

// ---- Images ---------------------------------------------------------------

export const imageApi = {
  list: () => apiGet<unknown[]>('/images'),
  build: (body: unknown) => apiPost<unknown>('/images/build', body),
  listBuilds: () => apiGet<unknown[]>('/images/builds'),
  // Cloud images
  listCloud: () => apiGet<unknown[]>('/images/cloud'),
  downloadCloud: (body: unknown) =>
    apiPost<unknown>('/images/cloud/download', body),
  listDownloads: () => apiGet<unknown[]>('/images/downloads'),
  // ISO
  listIso: () => apiGet<unknown[]>('/images/iso'),
  downloadIso: (body: unknown) =>
    apiPost<unknown>('/images/iso/download', body),
  deleteIso: (name: string) => apiDelete(`/images/iso/${name}`),
  // Import
  importImage: (body: unknown) =>
    apiPost<unknown>('/images/import', body),
};

// ---- Audit ----------------------------------------------------------------

export const auditApi = {
  listLogs: () => apiGet<unknown[]>('/audit/logs'),
  getLog: (id: string) => apiGet<unknown>(`/audit/logs/${id}`),
  exportLogs: () => apiGet<unknown>('/audit/logs/export'),
  getStats: () => apiGet<unknown>('/audit/stats'),
};

// ---- Analytics ------------------------------------------------------------

export const analyticsApi = {
  getVmPerformance: (name: string) =>
    apiGet<unknown>(`/analytics/vms/${name}`),
  getSystemPerformance: () => apiGet<unknown>('/analytics/system'),
  getInsights: () => apiGet<unknown>('/analytics/insights'),
  getTopVms: () => apiGet<unknown>('/analytics/top'),
  getUtilization: () => apiGet<unknown>('/analytics/utilization'),
  exportReport: () => apiGet<unknown>('/analytics/export'),
};

// ---- Notifications --------------------------------------------------------

export const notificationApi = {
  // Channels
  listChannels: () => apiGet<unknown[]>('/notifications/channels'),
  createChannel: (body: unknown) =>
    apiPost<unknown>('/notifications/channels', body),
  updateChannel: (id: string, body: unknown) =>
    apiPut<unknown>(`/notifications/channels/${id}`, body),
  deleteChannel: (id: string) =>
    apiDelete(`/notifications/channels/${id}`),
  testChannel: (id: string) =>
    apiPost<unknown>(`/notifications/channels/${id}/test`),
  // Rules
  listRules: () => apiGet<unknown[]>('/notifications/rules'),
  createRule: (body: unknown) =>
    apiPost<unknown>('/notifications/rules', body),
  updateRule: (id: string, body: unknown) =>
    apiPut<unknown>(`/notifications/rules/${id}`, body),
  deleteRule: (id: string) =>
    apiDelete(`/notifications/rules/${id}`),
  enableRule: (id: string) =>
    apiPost<unknown>(`/notifications/rules/${id}/enable`),
  disableRule: (id: string) =>
    apiPost<unknown>(`/notifications/rules/${id}/disable`),
  // History
  getHistory: () => apiGet<unknown[]>('/notifications/history'),
};

// ---- Events ---------------------------------------------------------------

export const eventApi = {
  list: () => apiGet<unknown[]>('/events'),
  stream: () => apiGet<unknown>('/events/stream'),
};

// ---- Migrations -----------------------------------------------------------

export const migrationApi = {
  list: () => apiGet<unknown[]>('/migrations'),
  start: (body: unknown) => apiPost<unknown>('/migrations', body),
  get: (id: string) => apiGet<unknown>(`/migrations/${id}`),
  cancel: (id: string) => apiPost<unknown>(`/migrations/${id}/cancel`),
};

// ---- Datacenters / Clusters / Hosts ---------------------------------------

export const datacenterApi = {
  // Datacenters
  listDatacenters: () => apiGet<unknown[]>('/datacenters'),
  createDatacenter: (body: unknown) =>
    apiPost<unknown>('/datacenters', body),
  getDatacenter: (id: string) => apiGet<unknown>(`/datacenters/${id}`),
  updateDatacenter: (id: string, body: unknown) =>
    apiPut<unknown>(`/datacenters/${id}`, body),
  deleteDatacenter: (id: string) => apiDelete(`/datacenters/${id}`),
  getDatacenterSummary: (id: string) =>
    apiGet<unknown>(`/datacenters/${id}/summary`),
  // Clusters
  listClusters: () => apiGet<unknown[]>('/clusters'),
  createCluster: (body: unknown) => apiPost<unknown>('/clusters', body),
  getCluster: (id: string) => apiGet<unknown>(`/clusters/${id}`),
  updateCluster: (id: string, body: unknown) =>
    apiPut<unknown>(`/clusters/${id}`, body),
  deleteCluster: (id: string) => apiDelete(`/clusters/${id}`),
  getClusterHealth: (id: string) =>
    apiGet<unknown>(`/clusters/${id}/health`),
  // Hosts
  listHosts: () => apiGet<unknown[]>('/hosts'),
  registerHost: (body: unknown) => apiPost<unknown>('/hosts', body),
  getHost: (id: string) => apiGet<unknown>(`/hosts/${id}`),
  updateHost: (id: string, body: unknown) =>
    apiPut<unknown>(`/hosts/${id}`, body),
  removeHost: (id: string) => apiDelete(`/hosts/${id}`),
  hostHeartbeat: (id: string) =>
    apiPost<unknown>(`/hosts/${id}/heartbeat`),
  hostEnterMaintenance: (id: string) =>
    apiPost<unknown>(`/hosts/${id}/maintenance/enter`),
  hostExitMaintenance: (id: string) =>
    apiPost<unknown>(`/hosts/${id}/maintenance/exit`),
  discoverHost: (body: unknown) =>
    apiPost<unknown>('/hosts/discover', body),
};

// ---- Resource Pools -------------------------------------------------------

export const resourcePoolApi = {
  list: () => apiGet<unknown[]>('/resource-pools'),
  create: (body: unknown) => apiPost<unknown>('/resource-pools', body),
  get: (id: string) => apiGet<unknown>(`/resource-pools/${id}`),
  update: (id: string, body: unknown) =>
    apiPut<unknown>(`/resource-pools/${id}`, body),
  delete: (id: string) => apiDelete(`/resource-pools/${id}`),
  getSummary: (id: string) =>
    apiGet<unknown>(`/resource-pools/${id}/summary`),
  assignVm: (id: string, body: unknown) =>
    apiPost<unknown>(`/resource-pools/${id}/vms`, body),
  unassignVm: (id: string) =>
    apiDelete(`/resource-pools/${id}/vms`),
  moveVm: (id: string, body: unknown) =>
    apiPost<unknown>(`/resource-pools/${id}/vms/move`, body),
  checkAdmission: (id: string, body: unknown) =>
    apiPost<unknown>(`/resource-pools/${id}/admission`, body),
};

// ---- DRS ------------------------------------------------------------------

export const drsApi = {
  configure: (body: unknown) => apiPost<unknown>('/drs/config', body),
  getConfig: (clusterId: string) =>
    apiGet<unknown>(`/drs/config/${clusterId}`),
  computePlacement: (body: unknown) =>
    apiPost<unknown>('/drs/placement', body),
  analyzeBalance: (clusterId: string) =>
    apiGet<unknown>(`/drs/balance/${clusterId}`),
  generateRecommendations: (body: unknown) =>
    apiPost<unknown>('/drs/recommendations', body),
  listRecommendations: (clusterId: string) =>
    apiGet<unknown[]>(`/drs/recommendations/${clusterId}`),
  approveRecommendation: (id: string) =>
    apiPost<unknown>(`/drs/recommendations/${id}/approve`),
  rejectRecommendation: (id: string) =>
    apiPost<unknown>(`/drs/recommendations/${id}/reject`),
  // Affinity rules
  listAffinityRules: () => apiGet<unknown[]>('/drs/affinity-rules'),
  createAffinityRule: (body: unknown) =>
    apiPost<unknown>('/drs/affinity-rules', body),
  getAffinityRule: (id: string) =>
    apiGet<unknown>(`/drs/affinity-rules/${id}`),
  updateAffinityRule: (id: string, body: unknown) =>
    apiPut<unknown>(`/drs/affinity-rules/${id}`, body),
  deleteAffinityRule: (id: string) =>
    apiDelete(`/drs/affinity-rules/${id}`),
};

// ---- Distributed Storage --------------------------------------------------

export const distributedStorageApi = {
  // Pools
  listPools: () =>
    apiGet<unknown[]>('/distributed-storage/pools'),
  createPool: (body: unknown) =>
    apiPost<unknown>('/distributed-storage/pools', body),
  getPool: (id: string) =>
    apiGet<unknown>(`/distributed-storage/pools/${id}`),
  deletePool: (id: string) =>
    apiDelete(`/distributed-storage/pools/${id}`),
  addHost: (id: string, body: unknown) =>
    apiPost<unknown>(`/distributed-storage/pools/${id}/hosts`, body),
  removeHost: (id: string, hostId: string) =>
    apiDelete(`/distributed-storage/pools/${id}/hosts/${hostId}`),
  reportDiskFailure: (id: string, body: unknown) =>
    apiPost<unknown>(`/distributed-storage/pools/${id}/disk-failure`, body),
  getPoolHealth: (id: string) =>
    apiGet<unknown>(`/distributed-storage/pools/${id}/health`),
  // Migrations
  listMigrations: () =>
    apiGet<unknown[]>('/distributed-storage/migrations'),
  startMigration: (body: unknown) =>
    apiPost<unknown>('/distributed-storage/migrations', body),
  getMigration: (id: string) =>
    apiGet<unknown>(`/distributed-storage/migrations/${id}`),
  updateMigrationProgress: (id: string, body: unknown) =>
    apiPut<unknown>(`/distributed-storage/migrations/${id}/progress`, body),
  completeMigration: (id: string) =>
    apiPost<unknown>(`/distributed-storage/migrations/${id}/complete`),
  cancelMigration: (id: string) =>
    apiPost<unknown>(`/distributed-storage/migrations/${id}/cancel`),
  // Policies
  listPolicies: () =>
    apiGet<unknown[]>('/distributed-storage/policies'),
  createPolicy: (body: unknown) =>
    apiPost<unknown>('/distributed-storage/policies', body),
  getPolicy: (id: string) =>
    apiGet<unknown>(`/distributed-storage/policies/${id}`),
  updatePolicy: (id: string, body: unknown) =>
    apiPut<unknown>(`/distributed-storage/policies/${id}`, body),
  deletePolicy: (id: string) =>
    apiDelete(`/distributed-storage/policies/${id}`),
  checkCompliance: (id: string, body: unknown) =>
    apiPost<unknown>(`/distributed-storage/policies/${id}/compliance`, body),
  // Datastore clusters
  listDatastoreClusters: () =>
    apiGet<unknown[]>('/distributed-storage/datastore-clusters'),
  createDatastoreCluster: (body: unknown) =>
    apiPost<unknown>('/distributed-storage/datastore-clusters', body),
  getDatastoreCluster: (id: string) =>
    apiGet<unknown>(`/distributed-storage/datastore-clusters/${id}`),
  deleteDatastoreCluster: (id: string) =>
    apiDelete(`/distributed-storage/datastore-clusters/${id}`),
  recommendDatastore: (id: string, body: unknown) =>
    apiPost<unknown>(
      `/distributed-storage/datastore-clusters/${id}/recommend`,
      body,
    ),
};

// ---- Encryption -----------------------------------------------------------

export const encryptionApi = {
  // Providers
  listProviders: () => apiGet<unknown[]>('/encryption/providers'),
  registerProvider: (body: unknown) =>
    apiPost<unknown>('/encryption/providers', body),
  removeProvider: (id: string) =>
    apiDelete(`/encryption/providers/${id}`),
  testProvider: (id: string) =>
    apiPost<unknown>(`/encryption/providers/${id}/test`),
  // Policies
  listPolicies: () => apiGet<unknown[]>('/encryption/policies'),
  createPolicy: (body: unknown) =>
    apiPost<unknown>('/encryption/policies', body),
  getPolicy: (id: string) =>
    apiGet<unknown>(`/encryption/policies/${id}`),
  updatePolicy: (id: string, body: unknown) =>
    apiPut<unknown>(`/encryption/policies/${id}`, body),
  deletePolicy: (id: string) =>
    apiDelete(`/encryption/policies/${id}`),
  // VM encryption
  encryptVm: (name: string, body: unknown) =>
    apiPost<unknown>(`/encryption/vms/${name}/encrypt`, body),
  decryptVm: (name: string) =>
    apiPost<unknown>(`/encryption/vms/${name}/decrypt`),
  getVmStatus: (name: string) =>
    apiGet<unknown>(`/encryption/vms/${name}/status`),
  listEncryptedVms: () => apiGet<unknown[]>('/encryption/vms'),
  rotateVmKey: (name: string) =>
    apiPost<unknown>(`/encryption/vms/${name}/rotate-key`),
};

// ---- Replication ----------------------------------------------------------

export const replicationApi = {
  // Sites
  listSites: () => apiGet<unknown[]>('/replication/sites'),
  registerSite: (body: unknown) =>
    apiPost<unknown>('/replication/sites', body),
  removeSite: (id: string) =>
    apiDelete(`/replication/sites/${id}`),
  // Configs
  listConfigs: () => apiGet<unknown[]>('/replication/configs'),
  createConfig: (body: unknown) =>
    apiPost<unknown>('/replication/configs', body),
  getConfig: (id: string) =>
    apiGet<unknown>(`/replication/configs/${id}`),
  pauseConfig: (id: string) =>
    apiPost<unknown>(`/replication/configs/${id}/pause`),
  resumeConfig: (id: string) =>
    apiPost<unknown>(`/replication/configs/${id}/resume`),
  removeConfig: (id: string) =>
    apiDelete(`/replication/configs/${id}/remove`),
  startSync: (id: string) =>
    apiPost<unknown>(`/replication/configs/${id}/sync`),
  getMetrics: (id: string) =>
    apiGet<unknown>(`/replication/configs/${id}/metrics`),
  listInstances: (id: string) =>
    apiGet<unknown[]>(`/replication/configs/${id}/instances`),
  // RPO / health
  checkRpoViolations: () =>
    apiGet<unknown[]>('/replication/rpo-violations'),
  getHealth: () => apiGet<unknown>('/replication/health'),
};

// ---- Site Recovery --------------------------------------------------------

export const siteRecoveryApi = {
  // Plans
  listPlans: () => apiGet<unknown[]>('/site-recovery/plans'),
  createPlan: (body: unknown) =>
    apiPost<unknown>('/site-recovery/plans', body),
  getPlan: (id: string) =>
    apiGet<unknown>(`/site-recovery/plans/${id}`),
  updatePlan: (id: string, body: unknown) =>
    apiPut<unknown>(`/site-recovery/plans/${id}`, body),
  deletePlan: (id: string) =>
    apiDelete(`/site-recovery/plans/${id}`),
  // Execute
  executePlannedMigration: (id: string) =>
    apiPost<unknown>(`/site-recovery/plans/${id}/planned-migration`),
  executeDisasterRecovery: (id: string) =>
    apiPost<unknown>(`/site-recovery/plans/${id}/disaster-recovery`),
  executeTestFailover: (id: string) =>
    apiPost<unknown>(`/site-recovery/plans/${id}/test-failover`),
  executeReprotect: (id: string) =>
    apiPost<unknown>(`/site-recovery/plans/${id}/reprotect`),
  // Executions
  listExecutions: () =>
    apiGet<unknown[]>('/site-recovery/executions'),
  getExecution: (id: string) =>
    apiGet<unknown>(`/site-recovery/executions/${id}`),
  cancelExecution: (id: string) =>
    apiPost<unknown>(`/site-recovery/executions/${id}/cancel`),
  getDashboard: () => apiGet<unknown>('/site-recovery/dashboard'),
};

// ---- Fault Tolerance ------------------------------------------------------

export const faultToleranceApi = {
  enable: (body: unknown) => apiPost<unknown>('/ft/enable', body),
  list: () => apiGet<unknown[]>('/ft/vms'),
  get: (name: string) => apiGet<unknown>(`/ft/vms/${name}`),
  disable: (name: string) => apiDelete(`/ft/vms/${name}`),
  checkCompatibility: (name: string) =>
    apiGet<unknown>(`/ft/vms/${name}/compatibility`),
  triggerFailover: (name: string) =>
    apiPost<unknown>(`/ft/vms/${name}/failover`),
  testFailover: (name: string) =>
    apiPost<unknown>(`/ft/vms/${name}/test-failover`),
  suspendReplication: (name: string) =>
    apiPost<unknown>(`/ft/vms/${name}/suspend`),
  resumeReplication: (name: string) =>
    apiPost<unknown>(`/ft/vms/${name}/resume`),
  getMetrics: (name: string) =>
    apiGet<unknown>(`/ft/vms/${name}/metrics`),
  getEvents: () => apiGet<unknown[]>('/ft/events'),
};

// ---- Certificates ---------------------------------------------------------

export const certificateApi = {
  // CAs
  listCAs: () => apiGet<unknown[]>('/certificates/cas'),
  createCA: (body: unknown) =>
    apiPost<unknown>('/certificates/cas', body),
  deleteCA: (id: string) => apiDelete(`/certificates/cas/${id}`),
  // Certificates
  listCertificates: () => apiGet<unknown[]>('/certificates'),
  issueCertificate: (body: unknown) =>
    apiPost<unknown>('/certificates/issue', body),
  revokeCertificate: (id: string) =>
    apiPost<unknown>(`/certificates/${id}/revoke`),
  renewCertificate: (id: string) =>
    apiPost<unknown>(`/certificates/${id}/renew`),
  checkExpiring: () => apiGet<unknown[]>('/certificates/expiring'),
  // Certificate requests
  listRequests: () => apiGet<unknown[]>('/certificates/requests'),
  submitRequest: (body: unknown) =>
    apiPost<unknown>('/certificates/requests', body),
  approveRequest: (id: string) =>
    apiPost<unknown>(`/certificates/requests/${id}/approve`),
  rejectRequest: (id: string) =>
    apiPost<unknown>(`/certificates/requests/${id}/reject`),
  // Rotations
  listRotations: () => apiGet<unknown[]>('/certificates/rotations'),
  scheduleRotation: (body: unknown) =>
    apiPost<unknown>('/certificates/rotations', body),
  executeRotation: (id: string) =>
    apiPost<unknown>(`/certificates/rotations/${id}/execute`),
  // Attestations
  listAttestations: () =>
    apiGet<unknown[]>('/certificates/attestations'),
  submitAttestation: (body: unknown) =>
    apiPost<unknown>('/certificates/attestations', body),
  verifyAttestation: (hostId: string) =>
    apiPost<unknown>(`/certificates/attestations/${hostId}/verify`),
  // Security baselines
  listSecurityBaselines: () =>
    apiGet<unknown[]>('/certificates/security-baselines'),
  createSecurityBaseline: (body: unknown) =>
    apiPost<unknown>('/certificates/security-baselines', body),
  checkVmSecurityCompliance: (id: string, body: unknown) =>
    apiPost<unknown>(
      `/certificates/security-baselines/${id}/compliance`,
      body,
    ),
  // Health dashboard
  getHealthDashboard: () =>
    apiGet<unknown>('/certificates/health'),
};

// ---- Content Library ------------------------------------------------------

export const contentLibraryApi = {
  // Libraries
  listLibraries: () =>
    apiGet<unknown[]>('/content-library/libraries'),
  createLibrary: (body: unknown) =>
    apiPost<unknown>('/content-library/libraries', body),
  getLibrary: (id: string) =>
    apiGet<unknown>(`/content-library/libraries/${id}`),
  deleteLibrary: (id: string) =>
    apiDelete(`/content-library/libraries/${id}`),
  syncLibrary: (id: string) =>
    apiPost<unknown>(`/content-library/libraries/${id}/sync`),
  downloadImage: (id: string, body: unknown) =>
    apiPost<unknown>(`/content-library/libraries/${id}/download`, body),
  // Items
  listItems: (libraryId: string) =>
    apiGet<unknown[]>(`/content-library/libraries/${libraryId}/items`),
  addItem: (libraryId: string, body: unknown) =>
    apiPost<unknown>(`/content-library/libraries/${libraryId}/items`, body),
  getItem: (id: string) =>
    apiGet<unknown>(`/content-library/items/${id}`),
  deleteItem: (id: string) =>
    apiDelete(`/content-library/items/${id}`),
  searchItems: (query: string) =>
    apiGet<unknown[]>(`/content-library/items/search?q=${encodeURIComponent(query)}`),
  // Customization specs
  listCustomizationSpecs: () =>
    apiGet<unknown[]>('/content-library/customization-specs'),
  createCustomizationSpec: (body: unknown) =>
    apiPost<unknown>('/content-library/customization-specs', body),
  getCustomizationSpec: (id: string) =>
    apiGet<unknown>(`/content-library/customization-specs/${id}`),
  deleteCustomizationSpec: (id: string) =>
    apiDelete(`/content-library/customization-specs/${id}`),
  // Host profiles
  listHostProfiles: () =>
    apiGet<unknown[]>('/content-library/host-profiles'),
  createHostProfile: (body: unknown) =>
    apiPost<unknown>('/content-library/host-profiles', body),
  getHostProfile: (id: string) =>
    apiGet<unknown>(`/content-library/host-profiles/${id}`),
  deleteHostProfile: (id: string) =>
    apiDelete(`/content-library/host-profiles/${id}`),
  checkHostCompliance: (id: string, body: unknown) =>
    apiPost<unknown>(
      `/content-library/host-profiles/${id}/compliance`,
      body,
    ),
};

// ---- Lifecycle Manager ----------------------------------------------------

export const lifecycleApi = {
  // Baselines
  listBaselines: () => apiGet<unknown[]>('/lifecycle/baselines'),
  createBaseline: (body: unknown) =>
    apiPost<unknown>('/lifecycle/baselines', body),
  getBaseline: (id: string) =>
    apiGet<unknown>(`/lifecycle/baselines/${id}`),
  updateBaseline: (id: string, body: unknown) =>
    apiPut<unknown>(`/lifecycle/baselines/${id}`, body),
  deleteBaseline: (id: string) =>
    apiDelete(`/lifecycle/baselines/${id}`),
  // Compliance
  scanCompliance: (body: unknown) =>
    apiPost<unknown>('/lifecycle/compliance/scan', body),
  getComplianceStatus: (hostId: string) =>
    apiGet<unknown>(`/lifecycle/compliance/${hostId}`),
  getClusterCompliance: (clusterId: string) =>
    apiGet<unknown>(`/lifecycle/compliance/cluster/${clusterId}`),
  // Remediations
  listRemediations: () =>
    apiGet<unknown[]>('/lifecycle/remediations'),
  createRemediation: (body: unknown) =>
    apiPost<unknown>('/lifecycle/remediations', body),
  getRemediation: (id: string) =>
    apiGet<unknown>(`/lifecycle/remediations/${id}`),
  // Rolling updates
  listRollingUpdates: () =>
    apiGet<unknown[]>('/lifecycle/rolling-updates'),
  createRollingUpdate: (body: unknown) =>
    apiPost<unknown>('/lifecycle/rolling-updates', body),
  startRollingUpdate: (id: string) =>
    apiPost<unknown>(`/lifecycle/rolling-updates/${id}/start`),
  pauseRollingUpdate: (id: string) =>
    apiPost<unknown>(`/lifecycle/rolling-updates/${id}/pause`),
  advanceRollingUpdate: (id: string) =>
    apiPost<unknown>(`/lifecycle/rolling-updates/${id}/advance`),
};

// ---- Settings -------------------------------------------------------------

export const settingsApi = {
  get: () => apiGet<unknown>('/settings'),
  update: (body: unknown) => apiPut<unknown>('/settings', body),
};

// ---- Plugins --------------------------------------------------------------

export const pluginApi = {
  list: () => apiGet<unknown[]>('/plugins'),
};

// ---- Webhooks -------------------------------------------------------------

export const webhookApi = {
  listDeliveries: () => apiGet<unknown[]>('/webhooks/deliveries'),
};

// ---- Services (service mesh) ----------------------------------------------

export const serviceApi = {
  list: () => apiGet<unknown[]>('/services'),
  create: (body: unknown) => apiPost<unknown>('/services', body),
  get: (id: string) => apiGet<unknown>(`/services/${id}`),
  update: (id: string, body: unknown) =>
    apiPut<unknown>(`/services/${id}`, body),
  delete: (id: string) => apiDelete(`/services/${id}`),
  getBackends: (id: string) =>
    apiGet<unknown[]>(`/services/${id}/backends`),
  sync: () => apiPost<unknown>('/services/sync'),
  getStatus: () => apiGet<unknown>('/services/status'),
};

// ---- Autoscaling ----------------------------------------------------------

export const autoscaleApi = {
  list: () => apiGet<unknown[]>('/autoscale'),
  create: (body: unknown) => apiPost<unknown>('/autoscale', body),
  get: (vmName: string) => apiGet<unknown>(`/autoscale/${vmName}`),
  delete: (vmName: string) => apiDelete(`/autoscale/${vmName}`),
  listEvents: () => apiGet<unknown[]>('/autoscale/events'),
};

// ---- Floating IPs ---------------------------------------------------------

export const floatingIpApi = {
  list: () => apiGet<unknown[]>('/floating-ips'),
  create: (body: unknown) => apiPost<unknown>('/floating-ips', body),
  delete: (id: string) => apiDelete(`/floating-ips/${id}`),
  assign: (id: string, body: unknown) =>
    apiPost<unknown>(`/floating-ips/${id}/assign`, body),
  unassign: (id: string) =>
    apiPost<unknown>(`/floating-ips/${id}/unassign`),
};

// ---- DHCP Servers ---------------------------------------------------------

export const dhcpApi = {
  list: () => apiGet<unknown[]>('/dhcp-servers'),
  create: (body: unknown) => apiPost<unknown>('/dhcp-servers', body),
  delete: (id: string) => apiDelete(`/dhcp-servers/${id}`),
};

// ---- DNS (systemd-resolved) -----------------------------------------------

export const dnsApi = {
  list: () => apiGet<unknown[]>('/dns'),
  create: (body: unknown) => apiPost<unknown>('/dns', body),
  delete: (id: string) => apiDelete(`/dns/${id}`),
  addRecord: (id: string, body: unknown) =>
    apiPost<unknown>(`/dns/${id}/records`, body),
};

// ---- Availability Zones ---------------------------------------------------

export const zoneApi = {
  list: () => apiGet<unknown[]>('/zones'),
  create: (body: unknown) => apiPost<unknown>('/zones', body),
  get: (id: string) => apiGet<unknown>(`/zones/${id}`),
  delete: (id: string) => apiDelete(`/zones/${id}`),
};

// ---- Spot Instances -------------------------------------------------------

export const spotInstanceApi = {
  list: () => apiGet<unknown[]>('/spot-instances'),
  create: (body: unknown) => apiPost<unknown>('/spot-instances', body),
  delete: (id: string) => apiDelete(`/spot-instances/${id}`),
  evict: (id: string) =>
    apiPost<unknown>(`/spot-instances/${id}/evict`),
};

// ---- Affinity Rules -------------------------------------------------------

export const affinityRuleApi = {
  list: () => apiGet<unknown[]>('/affinity-rules'),
  create: (body: unknown) => apiPost<unknown>('/affinity-rules', body),
  delete: (id: string) => apiDelete(`/affinity-rules/${id}`),
};

// ---- Projects (Multi-tenancy) ---------------------------------------------

export const projectApi = {
  list: () => apiGet<unknown[]>('/projects'),
  create: (body: unknown) => apiPost<unknown>('/projects', body),
  get: (id: string) => apiGet<unknown>(`/projects/${id}`),
  delete: (id: string) => apiDelete(`/projects/${id}`),
  addMember: (id: string, body: unknown) =>
    apiPost<unknown>(`/projects/${id}/members`, body),
  removeMember: (id: string, userId: string) =>
    apiDelete(`/projects/${id}/members/${userId}`),
  listVms: (id: string) =>
    apiGet<unknown[]>(`/projects/${id}/vms`),
};
