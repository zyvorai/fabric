# Keep 0.1 pilot

Labeled when [`./scripts/keep-pilot-gate.sh`](../../scripts/keep-pilot-gate.sh) passes **twice** on a FluxVM host (happy + deny), with archived logs under `docs/keep/pilot-runs/`.

## What the gate proves

| Check | Result |
|---|---|
| Template required | Missing template → FAIL |
| Keep mode policy | Unsigned PUT refused; empty signers refuse start |
| Session + cockpit | `evidence_class: software-test`; restart recovers session |
| OOB approval | Webhook + approve **and** deny paths; no unapproved mutate |
| Packaged agents | `examples/keep-agents/` + goals/artifacts |

## Guest worker note

QEMU `node22-agent` boots with a **musl-static** `fluxvm-guest-agent` (host glibc
builds fail inside the Jammy guest with `GLIBC_2.39 not found`). After that bake,
host `POST …/agent/ping` returns 200 and the gate can record `guest_worker=ok`.

Firecracker (`node22-fc` / `flux-vm` backend) still fails vsock proxy readiness on
this lab image — keep QEMU for the pilot guest-worker claim until FC rootfs+kernel
init is fixed.

## Honesty

Measured profile remains **software-test**. Keep 0.2 + hardware for unread-by-operator claims.
