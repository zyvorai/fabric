// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import ErrorBanner from './ErrorBanner'
import { usePlatformInfo } from '../contexts/PlatformInfoContext'
import type { Capabilities } from '../api/capabilities'

type SubsystemKey = keyof Capabilities

const phaseLabel: Record<string, string> = {
  off: 'not enabled on this host',
  unreachable: 'unreachable',
  live: 'available',
}

export default function SubsystemBanner({
  subsystem,
  title,
}: {
  subsystem: SubsystemKey
  title: string
}) {
  const { capabilities, loading } = usePlatformInfo()
  const status = capabilities?.[subsystem]

  if (loading || !status || status.phase === 'live') return null

  const phase = phaseLabel[status.phase] ?? status.phase
  const headline = status.detail ?? `${title} is ${phase}.`

  return (
    <ErrorBanner
      title={`${title} unavailable`}
      headline={headline}
      hints={[
        'Confirm the daemon and required systemd services are running',
        'Check host logs if this subsystem was recently enabled',
      ]}
      tone="amber"
    />
  )
}
