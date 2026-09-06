# Migrating from vmspawn / zyvor-fabricd branding

Zyvor Fabric is the product name for this platform. Technical identifiers are unchanged so existing installs keep working.

## What changed

| Before | After |
|--------|-------|
| Product name **zyvor-fabricd** / **vmspawn** | **Zyvor Fabric** |
| GitHub `ssahani/vmspawn` | Canonical: [zyvorai/fabric](https://github.com/zyvorai/fabric) (older `ssahani/zyvor-fabric` mirrors redirect / are obsolete) |
| Web UI title / docs prose | Zyvor Fabric |
| Default deploy path `~/vmspawn` | `~/zyvor-fabric` |

## What did not change

| Item | Value |
|------|-------|
| systemd unit | `zyvor-fabricd.service` |
| Binary | `zyvor-fabricd`, `zyvorctl`, `zyvor-fabricd-ctl` |
| Config | `/etc/zyvor-fabricd/zyvor-fabricd.toml` |
| State | `/var/lib/zyvor-fabricd/` |
| Env vars | `ZYVOR_FABRICD_*` |
| Terraform provider type | `zyvor-fabricd` (`ssahani/zyvor-fabricd`) |
| K8s operator chart | `zyvor-fabricd-operator` |
| API paths | `/api/*` unchanged |

## Clone URL

```bash
git clone https://github.com/zyvorai/fabric.git
cd fabric
```

Prefer `zyvorai/fabric`. Older `ssahani/vmspawn` / `ssahani/zyvor-fabric` clone URLs are obsolete.

## Deploy scripts

`scripts/deploy-remote.sh` now rsyncs to `~/zyvor-fabric` by default. Override with `DEPLOY_DIR` if needed.

## Documentation map

- [POSITIONING.md](POSITIONING.md) — messaging and Machina companion product
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — architecture entry point
- [integrations/machina.md](integrations/machina.md) — future macOS workbench integration
