// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

// Same mark as the app favicon/apple-touch-icon (index.html) and zyvor.dev's
// brand tile: a dark rounded square with a bold white "Z".
export default function ZyvorMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#1d1d1f" />
      <path d="M19 18h26v7L29 40h16v7H19v-7l16-15H19z" fill="#fff" />
    </svg>
  )
}
