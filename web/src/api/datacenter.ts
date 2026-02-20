export interface Datacenter {
  id: string
  name: string
  description?: string
  clusters: string[]
  status: string
  created: string
  updated?: string
}

export interface Cluster {
  id: string
  name: string
  description?: string
  datacenter_id: string
  hosts: string[]
  ha_enabled: boolean
  drs_enabled: boolean
  drs_mode: string
  evc_mode?: string
  status: string
  created: string
  updated?: string
}

export interface HostInfo {
  id: string
  hostname: string
  address: string
  cluster_id: string
  datacenter_id: string
  cpus: number
  memory_mb: number
  status: string
  last_heartbeat?: string
  vm_count: number
  cpu_usage_pct: number
  memory_usage_pct: number
  agent_version?: string
  created: string
  updated?: string
}

export interface DatacenterSummary {
  id: string
  name: string
  cluster_count: number
  host_count: number
  vm_count: number
  total_cpus: number
  total_memory_mb: number
}

const API_BASE = '/api'

// Datacenter CRUD

export async function listDatacenters(): Promise<Datacenter[]> {
  const res = await fetch(`${API_BASE}/datacenters`)
  if (!res.ok) throw new Error('Failed to fetch datacenters')
  return res.json()
}

export async function createDatacenter(req: { name: string; description?: string }): Promise<Datacenter> {
  const res = await fetch(`${API_BASE}/datacenters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create datacenter')
  return res.json()
}

export async function getDatacenter(id: string): Promise<Datacenter> {
  const res = await fetch(`${API_BASE}/datacenters/${id}`)
  if (!res.ok) throw new Error('Failed to fetch datacenter')
  return res.json()
}

export async function updateDatacenter(id: string, req: Partial<Datacenter>): Promise<Datacenter> {
  const res = await fetch(`${API_BASE}/datacenters/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to update datacenter')
  return res.json()
}

export async function deleteDatacenter(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/datacenters/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete datacenter')
}

export async function getDatacenterSummary(id: string): Promise<DatacenterSummary> {
  const res = await fetch(`${API_BASE}/datacenters/${id}/summary`)
  if (!res.ok) throw new Error('Failed to fetch datacenter summary')
  return res.json()
}

// Cluster CRUD

export async function listClusters(datacenterId?: string): Promise<Cluster[]> {
  const url = datacenterId
    ? `${API_BASE}/clusters?datacenter_id=${datacenterId}`
    : `${API_BASE}/clusters`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch clusters')
  return res.json()
}

export async function createCluster(req: { name: string; datacenter_id: string; description?: string }): Promise<Cluster> {
  const res = await fetch(`${API_BASE}/clusters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create cluster')
  return res.json()
}

export async function getCluster(id: string): Promise<Cluster> {
  const res = await fetch(`${API_BASE}/clusters/${id}`)
  if (!res.ok) throw new Error('Failed to fetch cluster')
  return res.json()
}

export async function updateCluster(id: string, req: Partial<Cluster>): Promise<Cluster> {
  const res = await fetch(`${API_BASE}/clusters/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to update cluster')
  return res.json()
}

export async function deleteCluster(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/clusters/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete cluster')
}

// Host management

export async function listHosts(clusterId?: string): Promise<HostInfo[]> {
  const url = clusterId
    ? `${API_BASE}/hosts?cluster_id=${clusterId}`
    : `${API_BASE}/hosts`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch hosts')
  return res.json()
}

export async function registerHost(req: {
  hostname: string
  address: string
  cluster_id: string
  cpus: number
  memory_mb: number
}): Promise<HostInfo> {
  const res = await fetch(`${API_BASE}/hosts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to register host')
  return res.json()
}

export async function getHost(id: string): Promise<HostInfo> {
  const res = await fetch(`${API_BASE}/hosts/${id}`)
  if (!res.ok) throw new Error('Failed to fetch host')
  return res.json()
}

export async function removeHost(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/hosts/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to remove host')
}

export async function hostEnterMaintenance(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/hosts/${id}/maintenance/enter`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to enter maintenance mode')
}

export async function hostExitMaintenance(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/hosts/${id}/maintenance/exit`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to exit maintenance mode')
}
