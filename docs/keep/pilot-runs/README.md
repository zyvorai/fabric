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

QEMU `node22-agent` boots to login. Guest **vsock agent** readiness for the Node worker is still flaky on some hosts (`connect(vsock): Connection reset`). When that happens the gate still proves control-plane OOB approve/deny and records `guest_worker=pending_vsock` in the run dir. Fixing vsock bake is follow-up; it does not block the Keep 0.1 pilot control-plane claim.

## Honesty

Measured profile remains **software-test**. Keep 0.2 + hardware for unread-by-operator claims.
