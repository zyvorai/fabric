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

Firecracker `node22-fc` needs a **flat ext4** rootfs (not the GPT cloud image):
Firecracker appends `root=/dev/vda`, which panics on a partitioned disk. Bake with:

```bash
./scripts/keep-bake-fc-rootfs.sh
```

The pilot gate prefers `node22-fc` when that template exists.

Latest FC archive: [20260924T182930Z](20260924T182930Z/) (`template=node22-fc`,
`cell_backend=flux-vm`, happy+deny PASS, `guest_worker=ok`).

## Honesty

Measured profile remains **software-test**. Keep 0.2 + hardware for unread-by-operator claims.
