// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { formatUserError } from './apiError'
import { ZYVOR_FABRIC_DAEMON, ZYVOR_FABRIC_HELP } from '../config/zyvorHelp'

const FABRIC = ZYVOR_FABRIC_HELP.name
const DAEMON = ZYVOR_FABRIC_DAEMON

/** Contextual hints for ErrorBanner based on error text or stable codes. */
export function hintsForError(err: unknown, domain?: 'vm' | 'storage' | 'network' | 'auth'): string[] {
  const msg = formatUserError(err).toLowerCase()
  const hints: string[] = []

  if (
    msg.includes('machined') ||
    msg.includes('systemd-machined') ||
    msg.includes('machine service')
  ) {
    hints.push(
      'Check systemd-machined: systemctl status systemd-machined',
      `Verify D-Bus access for the ${DAEMON} service user`,
      `Review ${DAEMON} logs for driver connection errors`,
    )
  }

  if (domain === 'storage' || msg.includes('storage') || msg.includes('pool') || msg.includes('volume')) {
    hints.push(
      'List storage pools under Storage or Storage Pools',
      `Confirm the image path exists and is readable by ${FABRIC}`,
      'For NFS pools, verify mount and pool health endpoints',
    )
  }

  if (domain === 'network' || msg.includes('network') || msg.includes('bridge')) {
    hints.push(
      'Check networkd status: networkctl status',
      'Verify bridge and firewall configuration in Network / Net Security',
    )
  }

  if (
    domain === 'auth' ||
    msg.includes('unauthorized') ||
    msg.includes('authentication') ||
    msg.includes('forbidden') ||
    msg.includes('permission')
  ) {
    hints.push(
      'Sign out and sign in again if your session expired',
      'Confirm your account has the required role for this action',
    )
  }

  if (domain === 'vm' || msg.includes('not found') || msg.includes('vm ')) {
    hints.push(
      `Refresh the VM list — the guest may have been removed outside ${FABRIC}`,
      'Check machined registration: machinectl list',
    )
  }

  if (hints.length === 0) {
    hints.push(
      `Confirm ${FABRIC} is running: systemctl status ${DAEMON}`,
      'Check API reachability at /health',
      'Verify your session has not expired',
    )
  }

  return hints
}
