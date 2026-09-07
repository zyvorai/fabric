// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { emptyPolicy } from '../api/dataplane'
import {
  applyControl,
  applyMode,
  dropFlowTarget,
  invertPolicy,
  modeFromPolicy,
} from './policyControls'

describe('policyControls', () => {
  it('maps open/audit/guard from flags', () => {
    expect(modeFromPolicy({ ...emptyPolicy(), default_allow: true })).toBe('open')
    expect(modeFromPolicy({ ...emptyPolicy(), audit_mode: true })).toBe('audit')
    expect(modeFromPolicy({ ...emptyPolicy(), default_allow: false })).toBe('guard')
  })

  it('guard is default-deny + sampling', () => {
    const p = applyMode(emptyPolicy(), 'guard')
    expect(p.default_allow).toBe(false)
    expect(p.audit_mode).toBe(false)
    expect(p.sample_rate).toBeGreaterThanOrEqual(1)
  })

  it('inverts allow and deny lists', () => {
    const p = invertPolicy({
      ...emptyPolicy(),
      default_allow: true,
      allow_cidrs: ['10.0.0.0/8'],
      deny_cidrs: ['1.1.1.1/32'],
    })
    expect(p.default_allow).toBe(false)
    expect(p.allow_cidrs).toEqual(['1.1.1.1/32'])
    expect(p.deny_cidrs).toEqual(['10.0.0.0/8'])
  })

  it('block promotes host to /32', () => {
    const p = applyControl(emptyPolicy(), { action: 'block', cidr: '8.8.8.8' })
    expect(p.deny_cidrs).toContain('8.8.8.8/32')
  })

  it('dropFlowTarget builds a block request', () => {
    expect(dropFlowTarget('1.1.1.1', 443, 'tcp')).toEqual({
      action: 'block',
      cidr: '1.1.1.1',
      port: 'tcp/443',
    })
  })
})
