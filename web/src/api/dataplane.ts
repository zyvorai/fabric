// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { apiGet, apiPost } from './client'

export interface VmNetworkPolicy {
  default_allow: boolean
  allow_cidrs: string[]
  allow_ports: string[]
  max_egress_mbps: number | null
  max_egress_pps: number | null
  sample_rate: number
}

export interface DataplaneStatus {
  mode: string
  required: boolean
  attached: boolean
  interface: string | null
  identity: number
  pin_dir: string | null
  schema_version: number | null
  schema_compatible: boolean
  policy_synced: boolean
  policy: VmNetworkPolicy
}

export interface DataplaneStats {
  allowed_packets: number
  allowed_bytes: number
  dropped_packets: number
  dropped_bytes: number
}

export interface FlowRecord {
  identity: number
  family: number
  source: string
  destination: string
  source_port: number
  destination_port: number
  protocol: number
  verdict: string
  packets: number
  bytes: number
  last_seen_ns: number
}

export interface FlowList {
  items: FlowRecord[]
}

export function getDataplaneStatus(name: string): Promise<DataplaneStatus> {
  return apiGet(`/api/vms/${encodeURIComponent(name)}/dataplane/status`)
}

export function getDataplanePolicy(name: string): Promise<VmNetworkPolicy> {
  return apiGet(`/api/vms/${encodeURIComponent(name)}/dataplane/policy`)
}

export function setDataplanePolicy(name: string, policy: VmNetworkPolicy): Promise<VmNetworkPolicy> {
  return apiPost(`/api/vms/${encodeURIComponent(name)}/dataplane/policy`, policy)
}

export function getDataplaneStats(name: string): Promise<DataplaneStats> {
  return apiGet(`/api/vms/${encodeURIComponent(name)}/dataplane/stats`)
}

export function getDataplaneFlows(name: string, limit = 100): Promise<FlowList> {
  return apiGet(`/api/vms/${encodeURIComponent(name)}/dataplane/flows?limit=${limit}`)
}
