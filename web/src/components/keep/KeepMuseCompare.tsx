// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

/** Muse-caliber Muse vs Keep (+ Fabric / FluxVM) comparison — marketing only. */
const ROWS: { label: string; muse: string; keep: string }[] = [
  {
    label: 'Where it runs',
    muse: 'Meta cloud only',
    keep: 'Your laptop, mini-PC, FluxVM host, or rented SNP/TDX — same API',
  },
  {
    label: 'Policy',
    muse: 'Closed Sentinel',
    keep: 'Signed keep.policy.yaml you can diff in git',
  },
  {
    label: 'Cell',
    muse: 'Often nspawn — shared kernel with Sentinel',
    keep: 'Firecracker / KVM microVM via FluxVM',
  },
  {
    label: 'Model',
    muse: 'Married to Muse Spark',
    keep: 'BYO model socket',
  },
  {
    label: 'Training',
    muse: 'Trajectories may train after sanitize',
    keep: 'Default off — export needs a scoped token',
  },
  {
    label: 'Host eBPF',
    muse: 'Not a tenant-owned pin you can show',
    keep: 'FluxVM TC: deny_udp + gateway-only ports; cockpit CONNECT 0',
  },
  {
    label: 'Proof on stage',
    muse: 'Trust Meta’s story',
    keep: 'Keep audit journal + FluxVM drop_reasons (PacketWolf optional)',
  },
  {
    label: 'Leave',
    muse: 'Hard',
    keep: 'keepctl pack / unpack onto another FluxVM',
  },
]

export default function KeepMuseCompare() {
  return (
    <div className="keep-mkt-versus">
      <p className="keep-mkt-stack-lede">
        Muse got the threat model right. Keep ships the open version Meta cannot — on Fabric and
        FluxVM, not a third VMM.
      </p>

      <ol className="keep-mkt-stack" aria-label="Stack">
        <li>
          <span className="keep-mkt-stack-name">Muse</span>
          <span className="keep-mkt-stack-role">Closed personal agent on Meta’s cloud</span>
        </li>
        <li>
          <span className="keep-mkt-stack-name">Keep</span>
          <span className="keep-mkt-stack-role">
            Product layer — policy, vault, approvals, browser, demos
          </span>
        </li>
        <li>
          <span className="keep-mkt-stack-name">Fabric</span>
          <span className="keep-mkt-stack-role">
            Control plane — console, JWT, Agents / Sessions
          </span>
        </li>
        <li>
          <span className="keep-mkt-stack-name">FluxVM</span>
          <span className="keep-mkt-stack-role">
            Hypervisor — the cell + host TC/eBPF pin
          </span>
        </li>
      </ol>

      <div className="keep-mkt-versus-head" aria-hidden>
        <span />
        <span>Muse</span>
        <span>Keep</span>
      </div>
      <ul className="keep-mkt-versus-rows">
        {ROWS.map((r) => (
          <li key={r.label}>
            <span className="keep-mkt-versus-label">{r.label}</span>
            <span className="keep-mkt-versus-muse">{r.muse}</span>
            <span className="keep-mkt-versus-keep">{r.keep}</span>
          </li>
        ))}
      </ul>

      <p className="keep-mkt-stage-line">
        Muse: agent computer in Meta’s cloud.
        <br />
        Keep: same idea on <em>your</em> FluxVM — signed policy, and CONNECT 0 from Keep’s journal +
        FluxVM’s pin.
      </p>
    </div>
  )
}
