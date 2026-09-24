# Keep — phases complete (local)

| Phase | Status | Where |
|---|---|---|
| FluxVM Phase 6 | Landed on `phase6-security-profiles` | [zyvorai/fluxvm](https://github.com/zyvorai/fluxvm) |
| Keep docs | In Fabric | `docs/keep/` |
| keepctl | Script | `scripts/keepctl` |
| Agent runtime | Policy YAML, model_socket, cell_backend, cockpit, export-token | `agent-runtime/` |
| Keep 0.2 | Documented gate only | `docs/keep/KEEP-0.2.md` |
| CI | Keep workflow | [`.github/workflows/keep.yml`](../../.github/workflows/keep.yml) |
| Tutorial | Hands-on | [Tutorial 16](../tutorials/16-keep-workstation.md) |

## How to test

```bash
cargo test --manifest-path agent-runtime/Cargo.toml --lib
cargo test --manifest-path agent-runtime/Cargo.toml policy -- --nocapture
./scripts/keepctl --help
```

## Honesty

Measured = `software-test`. Host can still see the VM until Keep 0.2 + hardware.
