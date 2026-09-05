// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

// The exact brand mark used at zyvor.dev's top-left nav: an open, rounded
// stroked "Z" glyph in the brand accent orange (#ff5a15 / --hs-accent-fill),
// no background shape.
export default function ZyvorMark({
  className = 'w-6 h-6',
  title,
}: {
  className?: string
  title?: string
}) {
  return (
    <svg viewBox="0 0 18 18" className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
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
