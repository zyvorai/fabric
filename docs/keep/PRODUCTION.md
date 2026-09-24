# Production readiness (what landed vs what still needs hardware)

## Keep 0.1 — live proof (lab release gate)

| Item | How to verify |
|---|---|
| Stub Keep e2e (CI) | `./scripts/keep-e2e.sh` · `.github/workflows/keep.yml` |
| **Live FluxVM Keep proof** | `KEEP_E2E_FLUXVM=1 ./scripts/keep-e2e.sh` or `./scripts/keep-live-lab.sh` (guest boot needs `KEEP_E2E_TEMPLATE` / Tutorial 11 image) |
| Keep-mode signed policy | `ZYVOR_AGENT_KEEP_MODE=1` + trusted signers; unsigned PUT → 403; start refuses empty signers |
| Credential authority | `authorize_resolve` allowlists host/method/path/user; secrets still host-env (not 0.2 unwrap) |
| Confine | `ZYVOR_AGENT_CONFINE=1` / `confinement: strict` on live path |
| Measured profile | `ZYVOR_AGENT_SECURITY_PROFILE=measured` (Keep mode default); cockpit `evidence_class: software-test` |
| Browser live view | `GET /v1/sessions/{id}/browser/view` · `/keep/browser?session=` (tab listing; no takeover) |
| Cockpit / approvals | `GET /keep/cockpit?session=` · out-of-band webhook |

```bash
# CI default — FluxVM stub
./scripts/keep-e2e.sh

# Lab release gate — live FluxVM (template auto-detected or KEEP_E2E_TEMPLATE=node22-agent)
./scripts/keep-live-lab.sh
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

## Still not a TEE claim (Keep 0.2 + hardware)

- Flipping `security.snp_launch_verified` / `tdx_launch_verified` on FluxVM
- User-held unwrap (phone/YubiKey) before vault open
- No host recover path on confidential profiles
- Attestation receipt UI that never labels `software-test` as unread-by-operator
- Process-level taint (today: session-level after brokered reads)

Until then: **the host can still see a measured VM.** That is intentional honesty, not an unfinished checkbox we can close in CI without silicon.
