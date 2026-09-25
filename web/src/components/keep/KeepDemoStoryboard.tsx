// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from 'react'

const CHIPS = ['cell up', 'extract', 'brief.md'] as const

/** Presentational stage demo — chips cascade + CONNECT settles on 0. No API. */
export default function KeepDemoStoryboard() {
  const root = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [connect, setConnect] = useState(3)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) setPlaying(true)
      },
      { threshold: 0.35 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!playing) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setActive(CHIPS.length)
      setConnect(0)
      return
    }
    setActive(0)
    setConnect(3)
    const timers: number[] = []
    timers.push(window.setTimeout(() => setActive(1), 500))
    timers.push(window.setTimeout(() => setActive(2), 1100))
    timers.push(window.setTimeout(() => setActive(3), 1700))
    timers.push(window.setTimeout(() => setConnect(2), 900))
    timers.push(window.setTimeout(() => setConnect(1), 1400))
    timers.push(window.setTimeout(() => setConnect(0), 1900))
    return () => timers.forEach(clearTimeout)
  }, [playing])

  return (
    <div ref={root} className="keep-mkt-storyboard" aria-hidden>
      <div className="keep-mkt-storyboard-inner">
        <div className="keep-mkt-storyboard-label">Stage · PDF brief</div>
        <div className="keep-mkt-chips">
          {CHIPS.map((label, i) => (
            <span
              key={label}
              className={`keep-mkt-chip${active > i ? ' is-on' : ''}${active === i + 1 ? ' is-pulse' : ''}`}
            >
              {label}
            </span>
          ))}
        </div>
        <div className={`keep-mkt-connect${connect === 0 ? ' is-zero' : ''}`}>
          <span className="keep-mkt-connect-label">CONNECT</span>
          <span className="keep-mkt-connect-num">{connect}</span>
        </div>
        <p className="keep-mkt-storyboard-note">
          Zero CONNECT from Keep’s journal + FluxVM pin — PacketWolf optional.
        </p>
      </div>
    </div>
  )
}
