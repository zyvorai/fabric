// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import type { VmNetworkPolicy } from '../api/dataplane'
import { emptyPolicy } from '../api/dataplane'

export type EnforcementMode = 'open' | 'audit' | 'guard'
export type ControlAction = 'open' | 'audit' | 'guard' | 'invert' | 'block' | 'allow'

export interface ControlRequest {
  action: ControlAction
  cidr?: string
  port?: string
  entity?: string
}

export function modeFromPolicy(p: VmNetworkPolicy): EnforcementMode {
  if (p.audit_mode) return 'audit'
  if (p.default_allow) return 'open'
  return 'guard'
}

function hostCidr(addr: string): string {
  const a = addr.split('/')[0].trim()
  if (a.includes(':') && !addr.includes('/')) return `${a}/128`
  if (a.includes('.') && !addr.includes('/')) return `${a}/32`
  return addr.trim()
}

function pushUnique(list: string[] | undefined, value: string): string[] {
  const next = [...(list ?? [])]
  if (value && !next.includes(value)) next.push(value)
  return next
}

export function applyMode(p: VmNetworkPolicy, mode: EnforcementMode): VmNetworkPolicy {
  const next = { ...emptyPolicy(), ...p }
  if (mode === 'open') {
    next.default_allow = true
    next.audit_mode = false
  } else if (mode === 'audit') {
    next.audit_mode = true
    if (!next.sample_rate) next.sample_rate = 1
  } else {
    next.default_allow = false
    next.audit_mode = false
    if (!next.sample_rate) next.sample_rate = 1
  }
  return next
}

export function invertPolicy(p: VmNetworkPolicy): VmNetworkPolicy {
  return {
    ...p,
    allow_cidrs: [...(p.deny_cidrs ?? [])],
    deny_cidrs: [...(p.allow_cidrs ?? [])],
    default_allow: !p.default_allow,
  }
}

export function blockCidr(p: VmNetworkPolicy, cidr: string): VmNetworkPolicy {
  const c = hostCidr(cidr)
  return {
    ...p,
    deny_cidrs: pushUnique((p.deny_cidrs ?? []).filter((x) => x !== c), c),
  }
}

export function allowCidr(p: VmNetworkPolicy, cidr: string): VmNetworkPolicy {
  const c = hostCidr(cidr)
  return {
    ...p,
    deny_cidrs: (p.deny_cidrs ?? []).filter((x) => x !== c),
    allow_cidrs: pushUnique(p.allow_cidrs, c),
  }
}

export function applyControl(p: VmNetworkPolicy, req: ControlRequest): VmNetworkPolicy {
  switch (req.action) {
    case 'open':
      return applyMode(p, 'open')
    case 'audit':
      return applyMode(p, 'audit')
    case 'guard':
      return applyMode(p, 'guard')
    case 'invert':
      return invertPolicy(p)
    case 'block':
      if (!req.cidr) throw new Error('block requires cidr')
      return blockCidr(p, req.cidr)
    case 'allow': {
      let next = p
      if (req.cidr) next = allowCidr(next, req.cidr)
      if (req.port) next = { ...next, allow_ports: pushUnique(next.allow_ports, req.port) }
      if (req.entity) next = { ...next, entities: pushUnique(next.entities, req.entity) }
      if (!req.cidr && !req.port && !req.entity) throw new Error('allow requires cidr, port, or entity')
      return next
    }
    default:
      return p
  }
}

export function dropFlowTarget(destIp: string, destPort?: number, proto?: string): ControlRequest {
  const port =
    destPort && proto && proto !== 'any' ? `${proto.toLowerCase()}/${destPort}` : undefined
  return { action: 'block', cidr: destIp, port }
}
