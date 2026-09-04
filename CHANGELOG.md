# Changelog

## Unreleased

### Added
- `host-lifecycle` crate: deterministic host maintenance evacuation planner and async job manager — preflight blockers, capacity-aware target selection, live/cold migration policy, bounded-parallel execution, and failure semantics that leave a partially evacuated host cordoned rather than guessing. Not yet wired into the scheduler or server routes (see [docs/host-lifecycle.md](docs/host-lifecycle.md) for the intended follow-up integration).
- `enterprise-identity` crate and `/api/identity/scim/*` + `/scim/v2/*` endpoints: SCIM 2.0 lifecycle provisioning and group-to-role sync for Entra ID / Okta on top of Fabric's existing OIDC/SAML/LDAP auth providers. Dedicated, hashed, constant-time-compared provisioning bearer tokens; deprovisioning takes effect on next login. See [docs/scim-identity.md](docs/scim-identity.md).
- Redesigned the sign-in page (`/login`) with the Zyvor Z mark and Apple-style visual polish (depth, spacing, focus states).

### Fixed
- Workspace-wide clippy lint drift across ~24 crates that had accumulated under current stable Rust (mostly `new_without_default`, `derivable_impls`, and small iterator/idiom lints) — `cargo clippy -- -D warnings` is green again.
- `fault-tolerance`'s test-only `MockDriver` was missing `get_cgroup_path`, a method `driver-core::VMDriver` gained since the mock was last updated — a real compile error in test code, not just a lint.

## 0.2.1

### Fixed
- Fixed a mislabeled command in the installation guide (`# Using zyvorctl` headed a `zyvor-fabricd-ctl` example — a different binary).

### Added
- Real test coverage for the Kubernetes operator (`operator/`), previously zero: serde default-fallback behavior, error formatting, and the `reconcile()` loop itself end-to-end against a mocked fabric API and a mocked Kubernetes API client.

## 0.2.0

### Added
- Docker/Podman deployment support — the existing Dockerfile/compose now actually work, wired up against FluxVM.
- Hybrid Apple-style web UX (marketing + `/app` console), replacing the terminal UI (`zyvorctl-tui` removed).
- Collapsible, icons-only sidebar with per-viewer persistence.

### Fixed
- Memory limit/usage endpoints (`PUT`/`GET /api/vms/:name/memory/{limit,usage}`) 404'd on every real VM — they looked up cgroups by VM name, a convention FluxVM's UUID-keyed cgroups never match. Now resolved through the driver's real cgroup path.
- Memory, disk, and NIC hotplug could fail with "Device not found" on a fresh QMP reconnect between `object-add`/`blockdev-add` and the following `device_add`.
- Snapshot creation and the autoscaler's CPU/memory hotplug path reconnected to the QMP monitor on every single call — under contention this could wedge the monitor for both the request itself and unrelated connections.
- QMP's read timeout (10s) was too short for `snapshot-save`'s vmstate dump, which can legitimately run well past that under disk contention; raised to 300s.
- VNC canvas silently rendering at 0x0.
- WebSocket console-open failures were swallowed instead of surfacing to the browser.
- `generate-page-index.mjs` had regressed the `/app` route prefix and marketing section.
- A dead link and a wrong brand mark in the customer guide index.
- Stale `vmspawnd`/`vmctl-tui` references and a wrong Ansible API port in docs.
- zyvorctl CLI examples throughout the customer feature guide and README used a nonexistent `zyvorctl vm <subcommand>` pattern, a `--name` flag, and a `4G` memory suffix — none of which the real CLI supports. Corrected to match the actual flat command surface.
- GPU passthrough docs described vGPU/Intel GVT-g support, GPU-specific REST endpoints, and a `zyvorctl gpu` CLI subcommand — none of which exist. Rewritten to describe the real capability: generic PCI/VFIO passthrough.
- Fictional etcd-clustering and memory-based live-migration content removed from docs.

### Changed
- Renamed the Ephemera VM driver integration to FluxVM (crates, config keys, docs, scripts).
- Relicensed to Apache License 2.0; removed proprietary legal docs and audited dependency licenses.
- Internal `vmspawnd_*` identifiers renamed; fictional Prometheus metrics corrected or flagged.

## 0.1.0

- Initial release.
