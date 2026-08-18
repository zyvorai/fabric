// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { apiGet, apiPost, apiPostVoid, apiPutVoid, apiDelete } from './client'

export interface PortForwardSpec {
  host_port: number
  guest_port: number
  protocol: 'tcp' | 'udp'
}

export interface VM {
  name: string
  state: 'running' | 'stopped' | 'paused' | 'starting' | 'stopping' | 'failed' | 'unknown'
  cpus: number
  memory: number
  image: string
  ip?: string
  pid?: number
  tags?: string[]
  port_forwards?: PortForwardSpec[]
  network_tap?: boolean
  network_static_ip?: boolean
  /** Why the VM ended up in the 'failed' state, if it did. Cleared on the next successful start. */
  last_error?: string
}

export interface CreateVMRequest {
  name: string
  image: string
  cpus: number
  memory: number
  /** Disk size in GB (daemon default: 20). */
  disk?: number
  /**
   * Host-port -> guest-port forwards for this VM's usermode networking
   * (e.g. exposing guest port 22 for SSH). Only applied on the VM's next
   * (re)creation in Ephemera -- usermode/slirp networking has no way to
   * add a forward to an already-running instance.
   */
  port_forwards?: PortForwardSpec[]
  /**
   * Use bridged (tap + private network namespace + DHCP) networking
   * instead of the default NAT networking. A bridged VM gets a real,
   * externally-reachable IP (visible on its Network tab) instead of
   * needing explicit port_forwards.
   */
  network_tap?: boolean
  /**
   * Only meaningful when network_tap is set: configure the guest's address
   * statically via cloud-init instead of relying on its own DHCP client
   * (not every image runs one automatically on boot).
   */
  network_static_ip?: boolean
}

export interface VMMetrics {
  cpu_usage: number
  memory_usage: number
  disk_usage: number
  network_rx: number
  network_tx: number
}

const API_BASE = '/api'

export async function listVMs(): Promise<VM[]> {
  const data = await apiGet<VM[] | { items: VM[] }>(`${API_BASE}/vms`)
  return Array.isArray(data) ? data : data.items || []
}

export async function getVM(name: string): Promise<VM> {
  return apiGet<VM>(`${API_BASE}/vms/${name}`)
}

export async function createVM(req: CreateVMRequest): Promise<VM> {
  return apiPost<VM>(`${API_BASE}/vms`, req)
}

export async function deleteVM(name: string): Promise<void> {
  return apiDelete(`${API_BASE}/vms/${name}`)
}

export async function startVM(name: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/vms/${name}/start`)
}

export async function stopVM(name: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/vms/${name}/stop`)
}

export async function restartVM(name: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/vms/${name}/restart`)
}

export async function pauseVM(name: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/vms/${name}/pause`)
}

export async function resumeVM(name: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/vms/${name}/resume`)
}

export async function getMetrics(name: string): Promise<VMMetrics> {
  return apiGet<VMMetrics>(`${API_BASE}/vms/${name}/metrics`)
}

/**
 * Expose a guest port on this VM's usermode networking. If the VM is
 * currently running, the backend destroys and relaunches it (usermode
 * networking can't add a forward live) -- expect this to take a few
 * seconds and briefly show the VM as starting again.
 */
export async function addPortForward(
  name: string,
  forward: { hostPort: number; guestPort: number; protocol?: 'tcp' | 'udp' },
): Promise<VM> {
  return apiPost<VM>(`${API_BASE}/vms/${name}/port-forwards`, {
    host_port: forward.hostPort,
    guest_port: forward.guestPort,
    protocol: forward.protocol ?? 'tcp',
  })
}

export async function cloneVM(sourceName: string, targetName: string, options?: {
  includeSnapshots?: boolean
  linkedClone?: boolean
}): Promise<void> {
  return apiPostVoid(`${API_BASE}/vms/${sourceName}/clone`, {
    target_name: targetName,
    include_snapshots: options?.includeSnapshots ?? false,
    linked_clone: options?.linkedClone ?? false,
  })
}

// Tag Management
export async function addTag(vmName: string, tag: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/vms/${vmName}/tags`, { tag })
}

export async function removeTag(vmName: string, tag: string): Promise<void> {
  return apiDelete(`${API_BASE}/vms/${vmName}/tags/${tag}`)
}

export async function updateTags(vmName: string, tags: string[]): Promise<void> {
  return apiPutVoid(`${API_BASE}/vms/${vmName}/tags`, { tags })
}
