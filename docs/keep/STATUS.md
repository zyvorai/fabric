# Keep — phases complete (local)

| Phase | Status | Where |
|---|---|---|
| FluxVM Phase 6 | Merged (`security_profile` / measured) | [zyvorai/fluxvm](https://github.com/zyvorai/fluxvm) |
| **Keep 0.1 pilot** | Live gate twice (happy + deny) on FluxVM host | [`pilot-runs/`](pilot-runs/) · `./scripts/keep-pilot-gate.sh` |
| Keep 0.1 live proof | Keep mode + live e2e path + browser view + credential authority | this tree |
| Keep docs | In Fabric | `docs/keep/` |
| keepctl | Script | `scripts/keepctl` |
| Agent runtime | Policy YAML, goals/artifacts, cockpit, export-token | `agent-runtime/` |
| Packaged agents | `infra-ops`, `migration-op`, `deploy-op` + `_fabric` | [`examples/keep-agents/`](../../examples/keep-agents/) |
| Keep console view | Goal → task → evidence → approval → outcome | `/app/keep/:sessionId` |
| Keep 0.2 | **Soft scaffolding complete** + brokered browser (a11y driver, MCP, bake); **hardware still gated** | [`KEEP-0.2.md`](KEEP-0.2.md) · [`browser/DRIVER.md`](browser/DRIVER.md) |
| CI | Keep workflow (stub e2e) | [`.github/workflows/keep.yml`](../../.github/workflows/keep.yml) |
| Tutorial | Hands-on + pack appendix | [Tutorial 16](../tutorials/16-keep-workstation.md) |

## Packaged agents

| Pack | Fabric surface |
|---|---|
| infra-ops | alerts, VMs, lifecycle; restart/remediation behind ask |
| migration-op | `/api/migrations` + GuestKit inspect/rescue (no Transiva in-repo) |
| deploy-op | `/readyz` + `/health` → readiness artifact |

## How to test

```bash
cargo test --manifest-path agent-runtime/Cargo.toml --lib
cargo test --manifest-path agent-runtime/Cargo.toml goals -- --nocapture
./scripts/keep-e2e.sh
# Lab FluxVM host (template required — soft-pass removed):
KEEP_E2E_TEMPLATE=node22-agent ./scripts/keep-live-lab.sh
# Full pilot (happy + deny, archived logs):
./scripts/keep-pilot-gate.sh
./scripts/keep-pack-demo.sh infra-ops
```

## Honesty

Measured = `software-test`. Host can still see the VM until Keep 0.2 + hardware.
Guest vsock is healthy on QEMU `node22-agent` (musl-static guest-agent) and on
Firecracker `node22-fc` (flat ext4 rootfs — see `scripts/keep-bake-fc-rootfs.sh`).
The pilot gate prefers `node22-fc` when that template is registered.
