// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { apiGet } from './client'

export type SubsystemPhase = 'off' | 'unreachable' | 'live'

export interface SubsystemStatus {
  phase: SubsystemPhase
  detail?: string
}

export interface Capabilities {
  vm_driver: SubsystemStatus
  storage: SubsystemStatus
  network_security: SubsystemStatus
  auth: SubsystemStatus
  events: SubsystemStatus
}

export function getCapabilities(): Promise<Capabilities> {
  return apiGet<Capabilities>('/api/capabilities')
}
