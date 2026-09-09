# Using Zyvor Fabric in DevOps

Fabric is the **control plane**. FluxVM is the **VM engine**. Pipelines should treat them as one stack.

```
Git / CI  →  zyvor-fabricd :9095  →  fluxvm :7788  →  KVM guests
                 /health /readyz         /healthz /readyz
```

## Probe contract

| Service | Liveness | Readiness |
|---------|----------|-----------|
| Fabric | `GET /health` | `GET /readyz` (`ok`, `store`, `fluxvm`) |
| FluxVM | `GET /healthz` | `GET /readyz` (`ok`, optional `kvm` / `dataplane`) |

`/readyz` is what load balancers and `kubectl` probes must use. Fabric is not ready if FluxVM `/readyz` is 503.

Canonical JSON: [contracts/fabric-fluxvm-readyz.json](contracts/fabric-fluxvm-readyz.json).

## Environment promotion

1. **PR** — contract unit tests + `scripts/test-devops-gate.sh` + proven-infra suites.
2. **Lab** — bare-metal / compose; `scripts/test-lab-verify.sh` (devops + proven-infra + edge e2e).
3. **Prod** — snapshot (`scripts/upgrade-rollback.sh snapshot`) → install N+1 → **`scripts/test-production-readiness.sh`** (read-only; requires `FABRIC_TOKEN`) → keep snapshot. Optional mutate: `RUN_MUTATING=1`.

Pair FluxVM upgrades with [fluxvm `scripts/upgrade-snapshot.sh`](https://github.com/zyvorai/fluxvm) on the same change window.

## Lab HTTPS

Lab `zyvor-fabricd` usually serves **HTTPS with a self-signed cert**.
`scripts/devops-gate.sh` uses `curl -k` and, when `FABRIC_URL` is unset, probes
`https://127.0.0.1:9095` then `http://127.0.0.1:9095`.

```bash
# Full post-deploy lab gate (stdin closed for nested tools)
./scripts/test-lab-verify.sh

# Production readiness (read-only; requires real token — no Admin@321 fallback)
FABRIC_URL=https://127.0.0.1:9095 FLUXVM_URL=http://127.0.0.1:7788 \
  FABRIC_TOKEN=… ./scripts/test-production-readiness.sh

# Live probe only
unset FABRIC_URL
FLUXVM_URL=http://127.0.0.1:7788 ./scripts/devops-gate.sh
# or:
ZYVOR_DEVOPS_LIVE=1 ./scripts/test-devops-gate.sh
```

## Source of truth (pick one)

- GitOps: `examples/devops/gitops` + operator
- Terraform: `examples/devops/terraform`
- CLI: `zyvorctl apply -f examples/devops/apply-vm.yaml`

Do not mix writers on the same VM name.

## Secrets

- `ZYVOR_FABRICD_ADMIN_PASSWORD`, `ZYVOR_FABRICD_JWT_SECRET`
- CI user token (`FABRIC_TOKEN`)
- `driver.fluxvm_token` when FluxVM auth is on

## Examples

See [examples/devops/README.md](../examples/devops/README.md).
