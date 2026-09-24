# Production readiness (what landed vs what still needs hardware)

## Keep 0.1 pilot — release gate

Run on a customer-like FluxVM host with a registered agent template (`node22-agent` / `agent-node`):

```bash
KEEP_E2E_TEMPLATE=node22-agent ./scripts/keep-pilot-gate.sh
# Archives under docs/keep/pilot-runs/<stamp>/{happy,deny}/
```

| Item | How to verify |
|---|---|
| Template required | Missing template → **FAIL** (no soft PASS) |
| Happy + deny | Gate runs twice; deny path shows no unapproved mutate |
| Keep-mode signed policy | Startup refuses empty signers; unsigned PUT → 403 |
| Session / cockpit / restart | Cockpit `software-test`; session recovers after runtime restart |
| OOB approvals | Webhook + approve/deny outside agent chat |
| Console Keep view | `/app/keep/:sessionId` — goal, task, evidence, approval, outcome |
| infra-ops pack | `./scripts/keep-pack-demo.sh infra-ops` |

Latest archived run: [pilot-runs/20260924T141927Z](pilot-runs/20260924T141927Z/). Guest worker vsock bake may still be pending — control-plane pilot still stands; see [pilot-runs/README.md](pilot-runs/README.md).

## Keep 0.1 — live proof (lab release gate)

| Item | How to verify |
|---|---|
| Stub Keep e2e (CI) | `./scripts/keep-e2e.sh` · `.github/workflows/keep.yml` |
| **Live FluxVM Keep proof** | `KEEP_E2E_FLUXVM=1 ./scripts/keep-e2e.sh` or `./scripts/keep-live-lab.sh` (needs `KEEP_E2E_TEMPLATE`) |
| Keep-mode signed policy | `ZYVOR_AGENT_KEEP_MODE=1` + trusted signers; unsigned PUT → 403; start refuses empty signers |
| Credential authority | `authorize_resolve` allowlists host/method/path/user; secrets still host-env (not 0.2 unwrap) |
| Confine | `ZYVOR_AGENT_CONFINE=1` / `confinement: strict` on live path |
| Measured profile | `ZYVOR_AGENT_SECURITY_PROFILE=measured` (Keep mode default); cockpit `evidence_class: software-test` |
| Browser live view | `GET /v1/sessions/{id}/browser/view` · `/keep/browser?session=` (tab listing; no takeover) |
| Cockpit / approvals | `GET /keep/cockpit?session=` · out-of-band webhook |

```bash
# CI default — FluxVM stub
./scripts/keep-e2e.sh

# Lab release gate — live FluxVM (template required)
KEEP_E2E_TEMPLATE=node22-agent ./scripts/keep-live-lab.sh
```

## Landed in this tree (software / control plane)

| Item | How to verify |
|---|---|
| Signed `keep.policy.yaml` | Keep mode or `ZYVOR_AGENT_POLICY_TRUSTED_SIGNERS` + signature header |
| Export-token gate | `POST /v1/export-tokens`; pack/export need `X-Keep-Export-Token` |
| Firecracker cell | FluxVM Firecracker templates; `cell_backend: firecracker` |
| Full pack metadata | `keepctl pack` → policy, agent pin, vault **names** (no raw secrets) |
| Phone approvals | Webhook `ui.actions` + `channel: out_of_band` |
| Runtime control-plane e2e | `agent-runtime/scripts/e2e-no-fluxvm.sh` |
| Goals / artifacts / packs | `/v1/goals`, `/v1/artifacts`; [`examples/keep-agents/`](../../examples/keep-agents/); [`docs/keep/goals/README.md`](goals/README.md) |

## Still not a TEE claim (Keep 0.2 + hardware)

- Flipping `security.snp_launch_verified` / `tdx_launch_verified` on FluxVM
- User-held unwrap (phone/YubiKey) before vault open
- No host recover path on confidential profiles
- Attestation receipt UI that never labels `software-test` as unread-by-operator
- Process-level taint (today: session-level after brokered reads)

Until then: **the host can still see a measured VM.** That is intentional honesty, not an unfinished checkbox we can close in CI without silicon.
