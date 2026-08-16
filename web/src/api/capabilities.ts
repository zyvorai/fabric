// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

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
