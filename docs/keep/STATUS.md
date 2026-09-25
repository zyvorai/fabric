# Keep — phases complete (local)

| Phase | Status | Where |
|---|---|---|
| FluxVM Phase 6 | Merged (`security_profile` / measured) | [zyvorai/fluxvm](https://github.com/zyvorai/fluxvm) |
| **Keep 0.1 pilot** | Live gate twice (happy + deny) on FluxVM host | [`pilot-runs/`](pilot-runs/) · `./scripts/keep-pilot-gate.sh` |
| Keep 0.1 live proof | Keep mode + live e2e path + browser view + credential authority | this tree |
| Keep docs | In Fabric | `docs/keep/` |
| keepctl | Script | `scripts/keepctl` |
| Agent runtime | Policy YAML, goals/artifacts, cockpit, export-token | `agent-runtime/` |
| Packaged agents | `infra-ops`, `migration-op`, `deploy-op`, `browser-research`, `pdf-brief` + `_fabric` | [`examples/keep-agents/`](../../examples/keep-agents/) |
| Keep console view | Goal → task → evidence → approval → outcome + PDF demo home | `/app/keep` · `/app/keep/:sessionId` |
| Keep 0.2 | **Soft scaffolding complete** + brokered browser; **hardware still gated** | [`KEEP-0.2.md`](KEEP-0.2.md) · [`browser/DRIVER.md`](browser/DRIVER.md) |
| Keep Browser 0.3 | Split-sight, trajectory-as-code, origin IFC, SNI-identity badge, goal tabs | [`browser/BROWSER-0.3.md`](browser/BROWSER-0.3.md) |
| Host eBPF (FluxVM only) | `deny_udp` + gateway pin; audit `egress_connects`; freeze on deny | FluxVM TC + agent-runtime confine |
| One-click use cases | Table-driven demos (7): drop a file, get an artifact; expect 0 CONNECT | [`demos/`](demos/README.md) · `examples/keep-agents/<id>/` · `keep-demo.sh` |
| CI | Keep workflow (stub e2e) | [`.github/workflows/keep.yml`](../../.github/workflows/keep.yml) |
| Tutorial | Hands-on + pack appendix + demos | [Tutorial 16](../tutorials/16-keep-workstation.md) · [Tutorial 17](../tutorials/17-keep-pdf-brief.md) · [Tutorial 18](../tutorials/18-keep-use-cases.md) |

## Packaged agents

| Pack | Fabric surface |
|---|---|
| infra-ops | alerts, VMs, lifecycle; restart/remediation behind ask |
| migration-op | `/api/migrations` + GuestKit inspect/rescue (no Transiva in-repo) |
| deploy-op | `/readyz` + `/health` → readiness artifact |
| browser-research | allowlisted a11y browse → research markdown |
| pdf-brief | PDF → `brief.md`; no browser; 0 CONNECT |
| contract-clauses | contract PDF → `clauses.md`; no browser; 0 CONNECT |
| security-questionnaire | questionnaire PDF → `answers.md`; no browser; 0 CONNECT |
| meeting-actions | `.txt`/`.vtt` → `actions.md`; no browser; 0 CONNECT |
| log-triage | log file → `triage.md`; no browser; 0 CONNECT |
| sbom-summary | CycloneDX/SPDX/SARIF → `summary.md`; no browser; 0 CONNECT |
| csv-clean | CSV → `clean.csv` + `report.md`; no browser; 0 CONNECT |

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
./scripts/keep-demo-pdf.sh
```

## Honesty

Measured = `software-test`. Host can still see the VM until Keep 0.2 + hardware.
Guest vsock is healthy on QEMU `node22-agent` (musl-static guest-agent) and on
Firecracker `node22-fc` (flat ext4 rootfs — see `scripts/keep-bake-fc-rootfs.sh`).
The pilot gate prefers `node22-fc` when that template is registered.
