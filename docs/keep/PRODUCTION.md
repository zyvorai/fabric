# Production readiness (what landed vs what still needs hardware)

## Landed in this tree (software / control plane)

| Item | How to verify |
|---|---|
| Signed `keep.policy.yaml` | Set `ZYVOR_AGENT_POLICY_TRUSTED_SIGNERS`; PUT requires `X-Keep-Policy-Signature` |
| Export-token gate | `POST /v1/export-tokens`; `GET /v1/export/audit` + pack need `X-Keep-Export-Token` |
| Firecracker cell | FluxVM honors Firecracker templates for sandboxes (no virtiofs volumes); set `cell_backend: firecracker` |
| Full pack metadata | `keepctl pack` → policy, agent pin, vault **names**, FluxVM migrate notes (no raw secrets) |
| Cockpit UI | `GET /keep/cockpit?session=<uuid>` + JSON `/v1/sessions/{id}/cockpit` |
| Phone approvals | Webhook payload includes `ui.actions` + `channel: out_of_band` |
| CI / Keep e2e | `./scripts/keep-e2e.sh` · `.github/workflows/keep.yml` (`keep-e2e` job) |
| Runtime control-plane e2e | `agent-runtime/scripts/e2e-no-fluxvm.sh` (proxy, Sentinel, DLP, approvals) |

```bash
# Full Keep product path (live runtime + FluxVM stub + keepctl) — what CI runs
./scripts/keep-e2e.sh

# Optional: also hit a live FluxVM
KEEP_E2E_FLUXVM=1 ./scripts/keep-e2e.sh
```

## Still not a TEE claim (Keep 0.2 + hardware)

- Flipping `security.snp_launch_verified` / `tdx_launch_verified` on FluxVM
- User-held unwrap (phone/YubiKey) before vault open
- No host recover path on confidential profiles
- Attestation receipt UI that never labels `software-test` as unread-by-operator

Until then: **the host can still see a measured VM.** That is intentional honesty, not an unfinished checkbox we can close in CI without silicon.
