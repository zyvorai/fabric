---
sidebar_position: 4
---

# Keep roadmap

Where each piece stands. Sources: [STATUS.md](STATUS.md), [KEEP-0.2.md](KEEP-0.2.md),
[browser/BROWSER-0.3.md](browser/BROWSER-0.3.md).

## Shipped

| Piece | What it is |
|---|---|
| FluxVM Phase 6 | `security_profile` field; `measured` profile produces `software-test` evidence |
| Keep 0.1 pilot | [Live gate](pilot-runs/README.md) passed twice (happy path and deny path) on a FluxVM host |
| Keep 0.1 | BYO model socket, signed Sentinel policy, measured cell, phone approvals, pack / unpack, cockpit, PDF brief, host eBPF pin |
| Keep Browser 0.3 | Split-sight pause, trajectory-as-code, origin taint lattice, vault-typed fill, goal-bound tabs, honesty badge |

## Planned product surface

Phased, in this order. Phase 1 is in progress; the rest is not started.

1. **Run history and visibility** (shipped in this branch): artifact TTL and diff, run notifications, console and `keepctl` views.
2. **Triggers and batch:** connect `/v1/schedules` and `/v1/webhooks` to use cases, a watched folder, multi-file upload.
3. **More file types:** docx, xlsx, html, eml/mbox, zip, OCR for scanned PDFs, regex / JSON-path / table rules.
4. **Model-assisted use cases:** a pack that declares one allowlisted model host, with a proof of "exactly N connections, all to that host" instead of zero.

## Gated on hardware

**Keep 0.2.** The soft scaffolding is complete (attestation receipt, no host recover on
confidential, user-held challenge API, browser screenshot and screencast). What remains
needs a real SNP/TDX run:

- User-held unwrap — the vault opens only after a phone or YubiKey unwraps a key onto an
  attested guest.
- Flip FluxVM `security.snp_launch_verified` / `tdx_launch_verified` after one hardware launch.

Until then: *the host can still see a measured VM.* See [Security profiles](SECURITY-PROFILES.md).

## Next (Browser 0.4 / 0.5)

- PacketWolf as an **optional** observer of the CONNECT 5-tuple (not required for Keep's proof).
- Signed site adapters (for example `adapters/vcenter.yaml`).
- Confidential cells: CDP only via attested vsock.

## What we will not add

- Approvals inside the agent chat
- Helper-app Messages / Notes / file slurp as a default
- Silent training on trajectories
