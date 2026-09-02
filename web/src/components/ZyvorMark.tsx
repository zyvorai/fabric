// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

// The exact brand mark used at zyvor.dev's top-left nav: an open, rounded
// stroked "Z" glyph in the brand accent orange, no background shape.
export default function ZyvorMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" className={className} aria-hidden="true">
      <path
        d="M2 2h14L6.6 16H16"
        fill="none"
        stroke="#ff5a15"
        strokeWidth="2.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
