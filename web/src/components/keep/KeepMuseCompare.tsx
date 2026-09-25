// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

/**
 * Meta Muse vs Keep (+ Fabric / FluxVM) — marketing only. Every row is stated in
 * docs/keep/KEEP.md; rows with no source for the Muse side are left out.
 */
const ROWS: { label: string; muse: string; keep: string }[] = [
  {
    label: 'Where it runs',
    muse: 'Meta’s cloud only.',
    keep: 'Your laptop, mini-PC or FluxVM host.',
  },
  {
    label: 'Policy',
    muse: 'A closed policy engine.',
    keep: 'A signed keep.policy.yaml you can diff in git.',
  },
  {
    label: 'The cell',
    muse: 'A container-style cell that shares a kernel with its policy engine.',
    keep: 'A Firecracker/KVM microVM on FluxVM, with its own kernel.',
  },
  {
    label: 'Model',
    muse: 'Tied to Muse Spark.',
    keep: 'Bring your own model socket.',
  },
  {
    label: 'Training',
    muse: 'Trajectories may train after sanitization.',
    keep: 'Off by default. Export needs a scoped token.',
  },
  {
    label: 'Secrets',
    muse: 'Surrogates swapped in at egress.',
    keep: 'The same idea: the vault injects on the host, and the agent never sees a real secret.',
  },
  {
    label: 'Browser',
    muse: 'A measured, accessibility-style appliance.',
    keep: 'The same idea: the agent sees structure, you see pixels.',
  },
  {
    label: 'Honesty',
    muse: 'A footnote.',
    keep: 'Up front: measured means software-test until verified hardware.',
  },
]

export default function KeepMuseCompare() {
  return (
    <div className="keep-mkt-versus">
      <p className="keep-mkt-stack-lede">
        Muse got the threat model right: treat the model as compromised the moment it reads a
        webpage. Keep is the version you run, read and take with you.
      </p>

      <ol className="keep-mkt-stack" aria-label="Who does what">
        <li>
          <span className="keep-mkt-stack-name">Meta Muse</span>
          <span className="keep-mkt-stack-role">
            A closed personal-agent product that runs on Meta’s cloud.
          </span>
        </li>
        <li>
          <span className="keep-mkt-stack-name">Keep</span>
          <span className="keep-mkt-stack-role">
            The open product layer: policy, vault, approvals, browser and demos.
          </span>
        </li>
        <li>
          <span className="keep-mkt-stack-name">Fabric</span>
          <span className="keep-mkt-stack-role">
            The control plane: console, sign-in, agents and sessions, and the front door to Keep’s
            APIs.
          </span>
        </li>
        <li>
          <span className="keep-mkt-stack-name">FluxVM</span>
          <span className="keep-mkt-stack-role">
            The hypervisor: it runs the cell and enforces the network rules on the host.
          </span>
        </li>
      </ol>
      <p className="keep-mkt-stage-line">
        Keep is not a third hypervisor. Keep is Fabric’s agent runtime plus a FluxVM cell.
      </p>

      <div className="keep-mkt-versus-head" aria-hidden>
        <span />
        <span>Meta Muse</span>
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
    </div>
  )
}
