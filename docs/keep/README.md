<div align="center">

<img src="../assets/keep/cockpit.svg" alt="The Keep cockpit: a sealed cell, zero outbound connections, an approval waiting for you, and split-sight between the agent and you." width="900">

# Keep

**Your agent gets a real computer. You keep the keys.**

Keep gives an untrusted AI agent its own sealed computer on hardware you control,
while you hold the policy, the credentials and the approvals. Open source, Apache-2.0.

[![Keep CI](https://github.com/zyvorai/fabric/actions/workflows/keep.yml/badge.svg)](../../.github/workflows/keep.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](../../LICENSE)
![Rust](https://img.shields.io/badge/runtime-Rust-orange)
![Evidence](https://img.shields.io/badge/evidence-software--test-lightgrey)

[**Try it in 60 seconds**](#try-it-in-60-seconds) ·
[Why Keep](#why-keep) ·
[Keep vs Muse](#keep-vs-meta-muse) ·
[Docs](KEEP.md) ·
[Website](https://zyvorai.github.io/fabric/keep)

</div>

<p align="center">
  <img src="../assets/keep/demo-static.svg" alt="Real output of ./scripts/keep-e2e.sh: 40 checks passed, 0 failed" width="760">
</p>

<p align="center"><sub>Real output of <code>./scripts/keep-e2e.sh</code>, condensed. Record your own GIF with <code>./scripts/keep-record-demo.sh</code>.</sub></p>

## Why Keep

| | |
|---|---|
| **You run it** | A laptop, a mini-PC or your own FluxVM host. Same API everywhere. |
| **You read it** | Policy is a signed `keep.policy.yaml` you can diff in git. |
| **You take it with you** | `keepctl pack` writes your policy, agent manifest and migration notes to a folder. `keepctl unpack` restores them on another FluxVM node. Secrets are not included. |

Keep starts from one assumption: **the model is compromised the moment it reads a webpage.**
So the agent never holds real passwords, never approves its own actions, and never decides its own network rules.

## Try it in 60 seconds

No KVM needed for the first two steps.

```bash
git clone https://github.com/zyvorai/fabric && cd fabric

# 1. Unit tests for the runtime (Sentinel, vault, egress, approvals)
cargo test --manifest-path agent-runtime/Cargo.toml --lib

# 2. End to end: live runtime + FluxVM sandbox stub + keepctl
./scripts/keep-e2e.sh          # ends with: passed=40 failed=0

# 3. On a FluxVM host with a node22-agent template
./scripts/keep-live-lab.sh
```

Then stage the demo: [Tutorial 17 — drop in a PDF, get a brief, with zero outbound connections](../tutorials/17-keep-pdf-brief.md).

## What you get

| | |
|---|---|
| **Bring your own model** | A model socket. The cell stays the same. |
| **Signed policy** | Fail-closed Sentinel loaded from a signed YAML file. |
| **A real cell** | Firecracker/KVM microVM on FluxVM with its own kernel. |
| **Approvals on your phone** | Buy, send and delete are approved out of band, never in the chat. |
| **Cockpit and browser view** | Taint, recent decisions, tabs, screenshots and a read-only screencast. |
| **One-click use cases** | PDF brief, contract clauses, security questionnaire, meeting actions, log triage, SBOM summary, CSV cleanup. See [demos](demos/README.md). |
| **Host network pin** | FluxVM TC/eBPF: `deny_udp` and gateway-only ports, enforced outside the guest ([how](confine.md)). |
| **Pack and unpack** | Leave whenever you want. |

<p align="center">
  <img src="../assets/keep/split-sight.svg" alt="The agent sees an accessibility outline; you see the real pixels" width="760">
</p>

## Keep vs Meta Muse

Muse got the threat model right. Keep is the version you run, read and take with you.
Every row below is stated in [KEEP.md](KEEP.md#why-keep-beats-muse-on-purpose); Muse-side claims
are paraphrased from public descriptions.

| | Meta Muse | Keep |
|---|---|---|
| Where it runs | Meta’s cloud only. | Your laptop, mini-PC or FluxVM host. |
| Policy | A closed policy engine. | A signed `keep.policy.yaml` you can diff in git. |
| The cell | A container-style cell that shares a kernel with its policy engine. | A Firecracker/KVM microVM on FluxVM, with its own kernel. |
| Model | Tied to Muse Spark. | Bring your own model socket. |
| Training | Trajectories may train after sanitization. | Off by default. Export needs a scoped token. |
| Secrets | Surrogates swapped in at egress. | The same idea: the vault injects on the host, and the agent never sees a real secret. |
| Browser | A measured, accessibility-style appliance. | The same idea: the agent sees structure, you see pixels. |
| Honesty | A footnote. | Up front, right below. |

Full matrix: [/compare](https://zyvorai.github.io/fabric/compare).

> [!IMPORTANT]
> **The quiet part.** Keep runs on measured VMs today, and its evidence class is `software-test`.
> Until it runs on verified confidential hardware with a key only you hold (Keep 0.2),
> **the host can still see inside the VM.** We will not claim otherwise.

## Ready-made agents

Deploy one from [`examples/keep-agents/`](../../examples/keep-agents/): `pdf-brief`, `contract-clauses`,
`security-questionnaire`, `meeting-actions`, `log-triage`, `sbom-summary`, `csv-clean`,
`browser-research`, `infra-ops`, `migration-op`, `deploy-op`.

## Where to go next

- [KEEP.md](KEEP.md) — the full spec, architecture and security profiles
- [Tutorial 16 — Keep workstation](../tutorials/16-keep-workstation.md) · [Tutorial 17 — PDF brief](../tutorials/17-keep-pdf-brief.md)
- [PRODUCTION.md](PRODUCTION.md) — production checklist · [STATUS.md](STATUS.md) — what ships today
- [Fabric](../../README.md) — the control plane Keep runs on
