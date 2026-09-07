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
2. **Lab** — `docker compose up` or Helm chart; `scripts/devops-gate.sh`; one `zyvorctl apply`.
3. **Prod** — snapshot (`scripts/upgrade-rollback.sh snapshot`) → install N+1 → `verify` → keep snapshot.

Pair FluxVM upgrades with [fluxvm `scripts/upgrade-snapshot.sh`](https://github.com/zyvorai/fluxvm) on the same change window.

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
