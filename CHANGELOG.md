# Changelog

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
