// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { apiDelete, apiGet, apiPost } from './client'

export interface ModelArtifact {
  name: string
  source: string
  revision?: string
  checksum?: string
  format: string
  size_bytes?: number
  tenant?: string
  local_path?: string
  created: string
  updated: string
}

export interface InferenceProfile {
  name: string
  runtime: string
  gpu: { vendor: string; count: number; minimum_vram_gib: number }
  cpu: number
  memory_gib: number
  allowed_hosts?: string[]
  max_egress_mbps?: number
  tenant?: string
  created: string
  updated: string
}

export interface InferenceReplica {
  vm_name: string
  bdf: string
  ready: boolean
  address?: string
}

export interface InferenceDeployment {
  name: string
  model: string
  profile: string
  replicas: number
  gpus_per_replica?: number
  tenant?: string
  status: { phase: string; replicas: InferenceReplica[]; message?: string }
  created: string
  updated: string
}

export interface InferenceEndpoint {
  name: string
  deployment: string
  protocol: string
  port: number
  service_id?: number
  vip?: string
  tenant?: string
  created: string
  updated: string
}

export interface FabricGpuView {
  bdf: string
  vendor: string
  vendor_id: number
  device_id: number
  driver?: string
  iommu_group?: number
  group_bound_to_vfio: boolean
  group_held: boolean
  numa_node?: number
  vram_gib?: number
  allocated_to?: { deployment: string; tenant?: string; vm_name: string }
}

export const listModels = () => apiGet<ModelArtifact[]>('/api/ai/models')
export const listProfiles = () => apiGet<InferenceProfile[]>('/api/ai/profiles')
export const listDeployments = () => apiGet<InferenceDeployment[]>('/api/ai/deployments')
export const listEndpoints = () => apiGet<InferenceEndpoint[]>('/api/ai/endpoints')
export const listGpus = () => apiGet<{ items: FabricGpuView[] } | FabricGpuView[]>('/api/ai/gpus')

export const createModel = (body: Partial<ModelArtifact>) =>
  apiPost<ModelArtifact>('/api/ai/models', body)
export const createProfile = (body: Partial<InferenceProfile>) =>
  apiPost<InferenceProfile>('/api/ai/profiles', body)
export const createDeployment = (body: {
  name: string
  model: string
  profile: string
  replicas?: number
}) => apiPost<InferenceDeployment>('/api/ai/deployments', body)
export const scaleDeployment = (name: string, replicas: number) =>
  apiPost<InferenceDeployment>(`/api/ai/deployments/${encodeURIComponent(name)}/scale`, {
    replicas,
  })
export const deleteDeployment = (name: string) =>
  apiDelete(`/api/ai/deployments/${encodeURIComponent(name)}`)
export const createEndpoint = (body: Partial<InferenceEndpoint>) =>
  apiPost<InferenceEndpoint>('/api/ai/endpoints', body)
