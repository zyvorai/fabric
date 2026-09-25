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
| Your own use cases | Declarative `pack.json` (no code) deployed from the console or `keepctl deploy`; TypeScript agent packs signed with Node and deployed in one command | [`PACKS.md`](PACKS.md) · [Tutorial 19](../tutorials/19-build-your-own-use-case.md) · [Tutorial 20: mail export digest](../tutorials/20-sort-a-mail-export.md) |
| Run history | Artifact TTL, per-use-case history, line diff between runs, `run.finished` / `run.failed` webhook, console `/app/keep/history`, `keepctl run\|list\|artifacts\|diff\|audit\|approvals` | [`keepctl/README.md`](keepctl/README.md) |
| Triggers and batch | Multi-file runs (one cell each), signed webhook and watched-folder triggers, `keepctl trigger` | [`TRIGGERS.md`](TRIGGERS.md) |
| More file types | `docx`, `xlsx`, `html`, `eml`/`mbox` extractors, zip fan-out, `regex_extract` / `json_path` / `table` rules | [`PACKS.md`](PACKS.md) |
| Model-assisted use cases | Opt-in host-side model step: vault-gated endpoint, first-use approval, audited calls, sanitised reply, `keepctl grants` | [`MODEL.md`](MODEL.md) |
| Scenarios and the cell template | Seven scenario packs; `node22-agent` template and `keep-bake-node22-agent.sh` | [`SCENARIOS.md`](SCENARIOS.md) |
| Many users | User tokens, per-user isolation, quotas, usage, revocation | [`TENANCY.md`](TENANCY.md) |
| Phone-signed approvals | Device enrolment, push relays, signed decisions, `keep-phone`, test vectors | [`mobile/README.md`](mobile/README.md) |
| Model choice | `model_socket` wired for agents (`ctx.model.chat()`, CLI harness), any OpenAI-compatible endpoint | [`MODELS.md`](MODELS.md) |
| Phone vendors | Blueprint, reference gateway, benchmark, partial zh-CN console | [`VENDORS.md`](VENDORS.md) |
| Install Keep | `./scripts/deploy keep user@host` (needs FluxVM on the host); `keepctl doctor` | [`PRODUCTION.md`](PRODUCTION.md) · `scripts/deploy-keep.sh` |
| CI | Keep workflow: unit tests, **demos e2e** (7 built-ins, a custom use case, signed pack deploy in Keep mode, against the real runtime and the FluxVM stand-in), stub e2e | [`.github/workflows/keep.yml`](../../.github/workflows/keep.yml) |
| Tutorial | Hands-on + pack appendix + demos + your own | [Tutorial 16](../tutorials/16-keep-workstation.md) · [Tutorial 17](../tutorials/17-keep-pdf-brief.md) · [Tutorial 18](../tutorials/18-keep-use-cases.md) · [Tutorial 19](../tutorials/19-build-your-own-use-case.md) |

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
# One-click demos, custom use case and signed pack deploy (real runtime + FluxVM stand-in, no VM):
bash agent-runtime/tests/demos-ci.sh
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

## What the demos e2e proves, and what it does not

`agent-runtime/tests/demos-ci.sh` runs the real runtime binary against `tests/sandbox_stub.py`
(guest commands run on the CI machine, real `pdftotext`, no VM). It checks the seven built-in demos and
their artifacts, refusal of wrong file types, oversize uploads and unknown ids, spreadsheet-formula
neutralisation, deploying and deleting a user-defined use case, `keepctl doctor`, and, in Keep mode,
that an unsigned deploy is refused while a Node-signed one is accepted and a one-byte change to the
signed bytes is refused. It does **not** prove cell isolation or that the host eBPF pin stops a
connection: that needs a FluxVM host (`keep-live-lab.sh`). The freeze-on-connect rule is unit-tested
by counting the `egress.connect` / `ebpf.*` audit rows it depends on.
