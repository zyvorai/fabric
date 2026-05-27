// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import ErrorBanner from './ErrorBanner'
import { hintsForError } from '../utils/daemonHints'

type PageLoadBannerProps = {
  title: string
  headline: string | null
  onRetry?: () => void
  domain?: 'vm' | 'storage' | 'network' | 'auth'
}

export default function PageLoadBanner({ title, headline, onRetry, domain }: PageLoadBannerProps) {
  if (!headline) return null
  return (
    <ErrorBanner
      title={title}
      headline={headline}
      hints={hintsForError(headline, domain)}
      onRetry={onRetry}
    />
  )
}
