# Keep — phases complete (local)

| Phase | Status | Where |
|---|---|---|
| FluxVM Phase 6 | Merged (`security_profile` / measured) | [zyvorai/fluxvm](https://github.com/zyvorai/fluxvm) |
| Keep 0.1 live proof | Keep mode + live e2e path + browser view + credential authority | this tree |
| Keep docs | In Fabric | `docs/keep/` |
| keepctl | Script | `scripts/keepctl` |
| Agent runtime | Policy YAML, model_socket, cell_backend, cockpit, export-token | `agent-runtime/` |
| Keep 0.2 | Documented gate only | `docs/keep/KEEP-0.2.md` |
| CI | Keep workflow (stub e2e) | [`.github/workflows/keep.yml`](../../.github/workflows/keep.yml) |
| Tutorial | Hands-on | [Tutorial 16](../tutorials/16-keep-workstation.md) |

## How to test

```bash
cargo test --manifest-path agent-runtime/Cargo.toml --lib
cargo test --manifest-path agent-runtime/Cargo.toml policy -- --nocapture
./scripts/keep-e2e.sh
# Lab live FluxVM gate:
./scripts/keep-live-lab.sh
./scripts/keepctl --help
```

## Honesty

Measured = `software-test`. Host can still see the VM until Keep 0.2 + hardware.
