import { API_BASE_URL } from './config'

export interface CpuCore {
  id: number
  socket_id: number
  core_id: number
  thread_id: number
  online: boolean
  numa_node: number | null
}

export interface CpuTopology {
  total_cpus: number
  sockets: number
  cores_per_socket: number
  threads_per_core: number
  cpus: CpuCore[]
  online_cpus: number[]
  offline_cpus: number[]
}

export interface NumaNode {
  id: number
  cpus: number[]
  memory_total_mb: number
  memory_free_mb: number
  hugepages_2mb_total: number
  hugepages_2mb_free: number
  hugepages_1gb_total: number
  hugepages_1gb_free: number
}

export interface NumaTopology {
  nodes: NumaNode[]
  distances: number[][]
}

export interface NumaPlacement {
  numa_node: number
  cpu_affinity: number[]
}

export interface MemoryStats {
  current_bytes: number
  max_bytes: number
  swap_current_bytes: number
  swap_max_bytes: number
  limit_bytes: number
  usage_percent: number
}

export interface HugepageStats {
  size: 'Size2MB' | 'Size1GB'
  total: number
  free: number
  reserved: number
  surplus: number
}

export interface SystemMemory {
  total_kb: number
  free_kb: number
  available_kb: number
  buffers_kb: number
  cached_kb: number
}

export interface CpuPinning {
  type: 'Auto' | 'NumaNode' | 'Socket' | 'Explicit'
  value?: number | CpuPin[]
}

export interface CpuPin {
  vcpu_id: number
  physical_cpu: number
}

export interface SetCpuPinningRequest {
  pinning: CpuPinning
}

export interface SetMemoryLimitRequest {
  limit_bytes: number
  swap_limit_bytes?: number
}

export interface AllocateHugepagesRequest {
  size: 'Size2MB' | 'Size1GB'
  count: number
}

// Get CPU topology
export async function getCpuTopology(): Promise<CpuTopology> {
  const response = await fetch(`${API_BASE_URL}/system/cpu/topology`)
  if (!response.ok) {
    throw new Error('Failed to get CPU topology')
  }
  return response.json()
}

// Get NUMA topology
export async function getNumaTopology(): Promise<NumaTopology> {
  const response = await fetch(`${API_BASE_URL}/system/numa/topology`)
  if (!response.ok) {
    throw new Error('Failed to get NUMA topology')
  }
  return response.json()
}

// Get NUMA node details
export async function getNumaNode(nodeId: number): Promise<NumaNode> {
  const response = await fetch(`${API_BASE_URL}/system/numa/nodes/${nodeId}`)
  if (!response.ok) {
    throw new Error(`Failed to get NUMA node: ${nodeId}`)
  }
  return response.json()
}

// Get recommended NUMA placement for a VM
export async function getNumaPlacement(memoryMb: number, cpus: number): Promise<NumaPlacement> {
  const response = await fetch(
    `${API_BASE_URL}/system/numa/placement?memory_mb=${memoryMb}&cpus=${cpus}`
  )
  if (!response.ok) {
    throw new Error('Failed to get NUMA placement recommendation')
  }
  return response.json()
}

// Set CPU pinning for a VM
export async function setCpuPinning(vmName: string, request: SetCpuPinningRequest): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/vms/${vmName}/cpu/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new Error(`Failed to set CPU pinning for: ${vmName}`)
  }
}

// Remove CPU pinning from a VM
export async function removeCpuPinning(vmName: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/vms/${vmName}/cpu/pin`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error(`Failed to remove CPU pinning for: ${vmName}`)
  }
}

// Get CPU affinity for a VM
export async function getCpuAffinity(vmName: string): Promise<number[]> {
  const response = await fetch(`${API_BASE_URL}/vms/${vmName}/cpu/affinity`)
  if (!response.ok) {
    throw new Error(`Failed to get CPU affinity for: ${vmName}`)
  }
  return response.json()
}

// Set memory limit for a VM
export async function setMemoryLimit(vmName: string, request: SetMemoryLimitRequest): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/vms/${vmName}/memory/limit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new Error(`Failed to set memory limit for: ${vmName}`)
  }
}

// Get memory usage for a VM
export async function getMemoryUsage(vmName: string): Promise<MemoryStats> {
  const response = await fetch(`${API_BASE_URL}/vms/${vmName}/memory/usage`)
  if (!response.ok) {
    throw new Error(`Failed to get memory usage for: ${vmName}`)
  }
  return response.json()
}

// Enable/disable memory ballooning for a VM
export async function setMemoryBallooning(vmName: string, enabled: boolean): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/vms/${vmName}/memory/balloon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  if (!response.ok) {
    throw new Error(`Failed to set memory ballooning for: ${vmName}`)
  }
}

// Get hugepage info
export async function getHugepageStats(size: 'Size2MB' | 'Size1GB'): Promise<HugepageStats> {
  const response = await fetch(`${API_BASE_URL}/system/memory/hugepages?size=${size}`)
  if (!response.ok) {
    throw new Error('Failed to get hugepage stats')
  }
  return response.json()
}

// Allocate hugepages
export async function allocateHugepages(request: AllocateHugepagesRequest): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/system/memory/hugepages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new Error('Failed to allocate hugepages')
  }
}

// Get system memory info
export async function getSystemMemory(): Promise<SystemMemory> {
  const response = await fetch(`${API_BASE_URL}/system/memory`)
  if (!response.ok) {
    throw new Error('Failed to get system memory info')
  }
  return response.json()
}

// Optimization types
export interface ResourceRecommendation {
  resource: string
  current_value: string
  recommended_value: string
  reason: string
  impact: string
}

export interface OptimizationRecommendation {
  vm_name: string
  recommendations: ResourceRecommendation[]
}

export interface OptimizationResult {
  vm_name: string
  applied: string[]
  skipped: string[]
}

// Get optimization recommendations
export async function getOptimizationRecommendations(): Promise<OptimizationRecommendation[]> {
  const response = await fetch(`${API_BASE_URL}/system/optimization/recommendations`)
  if (!response.ok) {
    throw new Error('Failed to get optimization recommendations')
  }
  return response.json()
}

// Auto-optimize a VM
export async function optimizeVM(vmName: string): Promise<OptimizationResult> {
  const response = await fetch(`${API_BASE_URL}/vms/${vmName}/optimize`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(`Failed to optimize VM: ${vmName}`)
  }
  return response.json()
}
