# Migrating from vmspawn / vmspawnd branding

Zyvor Fabric is the product name for this platform. Technical identifiers are unchanged so existing installs keep working.

## What changed

| Before | After |
|--------|-------|
| Product name **vmspawnd** / **vmspawn** | **Zyvor Fabric** |
| GitHub `ssahani/vmspawn` | [ssahani/zyvor-fabric](https://github.com/ssahani/zyvor-fabric) (redirects) |
| Web UI title / docs prose | Zyvor Fabric |
| Default deploy path `~/vmspawn` | `~/zyvor-fabric` |

## What did not change

| Item | Value |
|------|-------|
| systemd unit | `vmspawnd.service` |
| Binary | `vmspawnd`, `vmctl`, `vmspawnctl` |
| Config | `/etc/vmspawnd/vmspawnd.toml` |
| State | `/var/lib/vmspawnd/` |
| Env vars | `VMSPAWND_*` |
| Terraform provider type | `vmspawnd` (`ssahani/vmspawnd`) |
| K8s operator chart | `vmspawnd-operator` |
| API paths | `/api/*` unchanged |

## Clone URL

```bash
git clone https://github.com/ssahani/zyvor-fabric.git
cd zyvor-fabric
```

Old URLs continue to work via GitHub redirects.

## Deploy scripts

`scripts/deploy-remote.sh` now rsyncs to `~/zyvor-fabric` by default. Override with `DEPLOY_DIR` if needed.

## Documentation map

- [POSITIONING.md](POSITIONING.md) — messaging and Machina companion product
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — architecture entry point
- [integrations/machina.md](integrations/machina.md) — future macOS workbench integration
