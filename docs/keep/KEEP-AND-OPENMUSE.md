---
sidebar_position: 8
---

# Keep and OpenMuse

*Written 2026-09-26 from OpenMuse's own README, roadmap and verification page. Zyvor is not affiliated with CopilotKit. If a row is out of date or wrong,
please open an issue.*

[OpenMuse](https://github.com/CopilotKit/openmuse) (CopilotKit, MIT) is an open-source personal-agent **application**. Keep is a sealed-cell **runtime**
with proofs. They sit at different layers, so the useful question is what each is good at and how they fit, not which is better. (OpenMuse is unrelated to
Meta's Muse, which the [README](README.md) compares Keep with.)

## What OpenMuse is

From its [README](https://github.com/CopilotKit/openmuse/blob/main/README.md): a personal agent with a browser, a terminal, files and work that keeps going,
built with CopilotKit and the AG-UI protocol. An Expo / React Native client for iOS, Android and web; a Hono server with a durable task worker (SQL leases);
a Playwright browser worker with persistent profiles and a "Take control" console; an optional Docker Linux computer; Gmail and Calendar adapters with stored,
reviewed actions; PDF form filling; a finance CSV tracker; ideas, goals and page tracking; memories; notifications. It runs on a laptop with `pnpm dev`
and needs no model, Google account or Docker for its local sample app. It calls itself an alpha for self-hosting and building on.

## What Keep is

Keep reads a file or runs an agent inside a **sealed cell**: a throw-away microVM whose network policy is set by the host, with secrets that never enter the
cell, approvals signed on the user's own device, and a run history you can audit. It ships 60+ declarative use cases (statements, chats, logs, decks, receipts
and bills from photos, bank operations files) and a Mac app, [Solvor](https://github.com/zyvorai/solvor).

## Side by side

| | OpenMuse | Keep |
|---|---|---|
| Layer | An app: chat, tasks, connectors, documents | A runtime: cells, policy, vault, approvals, packs |
| The agent's computer | Docker container, nonroot, terminal network disabled, one named volume per owner ([README](https://github.com/CopilotKit/openmuse/blob/main/README.md#linux-terminal-and-workspace): "a Linux container, not a full operating-system VM") | A microVM on FluxVM with its own kernel; the host applies a deny-all network policy before any guest work and the run fails closed if it cannot |
| Tenancy | One owner per deployment ([VERIFICATION](https://github.com/CopilotKit/openmuse/blob/main/docs/VERIFICATION.md): "no ... hostile-tenant isolation") | Users are scoped by token; tenancy is tested ([TENANCY.md](TENANCY.md)) |
| Approvals | Stored action reviews bound to owner, hash, version and expiry | Approvals signed by the user's device key over the exact text (Secure Enclave in Solvor), with a challenge and an expiry |
| What you can run on day one | The local sample app; a model and a CopilotKit project key for more | Any of the shipped use cases, on a host with FluxVM |
| Setup today | `pnpm dev` on a laptop | A Linux host with KVM; [`scripts/keep-up.sh`](../../scripts/keep-up.sh) is the one-command path (tested with fake facts; a clean-machine run is still open, see [TODO.md](TODO.md)) |
| Clients | iOS, Android, web | The web console and Solvor (macOS 26); phone approvals reference code |
| Connectors | Gmail and Calendar OAuth adapters (live credentials needed) | The browser-tab email reader in Solvor; no first-party Google connector yet |
| Long-running work | Durable plans, pause/resume/retry, goals, page tracking | Sessions with steer, cancel, resume and hibernate; schedules and triggers; no plan/goal UI |
| Protocols | CopilotKit / AG-UI | HTTP API, MCP endpoint, signed webhooks; no AG-UI yet |
| Evidence for its claims | A dated acceptance matrix with a boundary per feature | [VERIFICATION.md](VERIFICATION.md) and the honesty sections; evidence class is `software-test`, not hardware-attested |
| Licence | MIT (its Intelligence service is separate and not MIT) | Apache-2.0 |

## Where OpenMuse is ahead today

- **A product people can open.** A chat client on three platforms, connectors, task views, and demo videos. Keep has a runtime and a Mac file app.
- **A laptop demo.** Trying it needs Node and pnpm. Trying Keep needs a Linux host with KVM.
- **Durable personal work.** Plans, goals, page tracking and alerts as first-class features.

## Where Keep is ahead today

- **Isolation and proof.** The agent computer is a microVM, the deny-all policy is enforced by the host, and every run reports the egress count as a cross-check
  ([THREAT-MODEL.md](THREAT-MODEL.md)). OpenMuse states it has no hostile-tenant isolation and is single-owner.
- **Approvals bound to hardware.** Device-key signatures, not an in-app button.
- **Breadth of ready use cases** for files people actually have, and a declarative way to add more ([CONTRIBUTING-PACKS.md](CONTRIBUTING-PACKS.md)).

Neither list is permanent. Both projects are young.

## How they fit

An app like OpenMuse needs a computer for its agent; Keep is a sealed one. The plan is to make that easy without either project pretending to be the other:
an AG-UI endpoint on the Keep runtime so CopilotKit-style clients can drive a Keep session, and a computer backend for OpenMuse that targets Keep
instead of a local Docker daemon. Neither exists yet ([TODO.md](TODO.md) and [ROADMAP.md](ROADMAP.md) track them). Nothing here has been agreed with CopilotKit.
