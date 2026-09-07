# Changelog

## Unreleased

### Added
- Hubble-style packet flow in the Fabric console: Edge Dataplane **Packet flow**
  tab and VM Dataplane Flows view with Colorful / Normal themes, hop path
  (guest → tap → tc/eBPF → uplink → peer), `GET /api/dataplane/hubble/flows`,
  and `zyvorctl dataplane hubble --output color|plain|json`.
- DevOps pack: probe contract with FluxVM (`docs/contracts/fabric-fluxvm-readyz.json`), `scripts/devops-gate.sh`, GitHub/GitLab/GitOps/Terraform/Ansible examples under `examples/devops/`, and `docs/DEVOPS.md`.
- Proven-infra pack for issues #14–#17: `benchmarks/` harness (health / readyz / inventory / concurrent p50/p99), chaos qualification script, `scripts/upgrade-rollback.sh` N→N+1 snapshot/rollback/verify, and docs under `docs/proven-infra/` (compatibility matrix, SLOs, chaos, upgrade).
- `backup` crate is a workspace member with create/restore/delete and corrupt-archive fail-closed tests.
- Quorum majority tests in `fault-tolerance` and heartbeat window tests in `ha`.
- Lab verify scripts: `scripts/test-proven-infra.sh`, `scripts/test-lab-verify.sh`
  (devops units + live gate + proven-infra suites + edge dataplane e2e with lab
  auth fallbacks; stdin closed for SSH-safe runs).
- DevOps gate TLS: `scripts/devops-gate.sh` uses `curl -k` and auto-picks Fabric
  HTTPS then HTTP when `FABRIC_URL` is unset; `make test` runs `test-devops`.

### Changed
- Docs refreshed for JWT `tenant` claim enforcement, `driver.fluxvm_token` when
  FluxVM auth is on, compose `/readyz` healthchecks, and optional
  `network.hubble_ui_url` ([hubble-ui.md](docs/guides/operations/hubble-ui.md)).
- Docs and tutorials refreshed for `/readyz`, VM `tenant`, and FluxVM production
  alignment (first-VM, security, edge-dataplane series, install/k8s/docker,
  monitoring, API reference, billing).
- Drop remaining `ssahani/` GitHub and Terraform Registry namespaces in favor of `zyvorai/` (`zyvorai/fabric`, `zyvorai/zyvor-fabricd`).
- Docs refreshed for FluxVM Network Fabric **schema v4** edge dataplane (groups,
  CNP, effective, health/ipcache/FQDN) across operator guides, user pages, and
  tutorials ([09-edge-dataplane.md](docs/tutorials/09-edge-dataplane.md),
  [edge-dataplane/](docs/tutorials/edge-dataplane/README.md)).

### Added
- Edge Dataplane **Open Hubble** button when `network.hubble_ui_url` is set;
  [ROADMAP-DENSITY.md](docs/ROADMAP-DENSITY.md) for Cilium CEP / density phases.
- Project-production alignment with FluxVM: unauthenticated `GET /readyz`
  (store + FluxVM `/readyz`), VM `tenant` on create + `GET /api/vms?tenant=`,
  FluxVM client `tenant` / `readyz` / `list_vms_by_tenant`, label→tenant
  inheritance on VM start.
- JWT `tenant` claim (from user DB) with FluxVM-style create/list/get/mutate
  scoping; `network.hubble_ui_url` surfaced via `/api/capabilities`.
- `zyvorctl create --tenant`, Create VM UI tenant field, fabric-doctor
  `/readyz` checks (`--fabric-ready-url` / `--fluxvm-ready-url`), and k8s
  readiness probes (`fabricd` → `/readyz`; FluxVM → `/healthz` + `/readyz`).
- Docker Compose healthchecks require both `/health` and `/readyz`.
- Fabric proxy of FluxVM schema v4: `/api/dataplane/*`, VM `…/dataplane/effective`,
  Edge Dataplane console (`/app/edge-dataplane`), `zyvorctl dataplane` group/cnp/…
  commands, and `scripts/test-edge-dataplane-e2e.sh`.
- Tutorial 08: drive Fabric with OpenStack clients (`docs/tutorials/08-openstack-clients.md`) — Keystone token, Nova/Glance/Neutron/Cinder via `openstack` CLI and curl, public URL setup, Terraform/Ansible outline.
- `openstack-compat` crate and `/identity` `/compute` `/image` `/network` `/volume` routes: experimental OpenStack wire-protocol façade (Keystone/Nova/Glance/Neutron/Cinder) on the same daemon port as Fabric. Catalog URLs come from `daemon.public_url` / `ZYVOR_FABRICD_PUBLIC_URL` (or listen + TLS). See [docs/openstack-compat.md](docs/openstack-compat.md).
- `host-lifecycle` crate: deterministic host maintenance evacuation planner and async job manager — preflight blockers, capacity-aware target selection, live/cold migration policy, bounded-parallel execution, and failure semantics that leave a partially evacuated host cordoned rather than guessing. Not yet wired into the scheduler or server routes (see [docs/host-lifecycle.md](docs/host-lifecycle.md) for the intended follow-up integration).
- `enterprise-identity` crate and `/api/identity/scim/*` + `/scim/v2/*` endpoints: SCIM 2.0 lifecycle provisioning and group-to-role sync for Entra ID / Okta on top of Fabric's existing OIDC/SAML/LDAP auth providers. Dedicated, hashed, constant-time-compared provisioning bearer tokens; deprovisioning takes effect on next login. See [docs/scim-identity.md](docs/scim-identity.md).
- Redesigned the sign-in page (`/login`) with the Zyvor Z mark and Apple-style visual polish (depth, spacing, focus states).

### Fixed
- `jsonwebtoken` 11 login panics: enable the `aws_lc_rs` crypto backend so Fabric JWT encode/decode works after the Dependabot bump.
- Running-VM snapshots ignored `snapshot_type`: both Disk and Full used QMP `snapshot-save` (memory dump), so UI "Disk Only" still timed out under load / the 60s HTTP layer. Disk now uses `blockdev-snapshot-internal-sync`; Full keeps `snapshot-save` with a 300s poll budget; HTTP timeout raised to 330s; Snapshots tab defaults to Disk.
- Live snapshot create now waits/retries for QMP readiness (409 when still starting); UI retries on 409; Snapshot Manager gained Disk/Full picker; FluxVM HTTP client timeout raised to 180s; auto-healer skips VMs updated within 90s to avoid restart storms after start.
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
- A dead link and a wrong brand mark in the user guide index.
- Stale `vmspawnd`/`vmctl-tui` references and a wrong Ansible API port in docs.
- zyvorctl CLI examples throughout the user feature guide and README used a nonexistent `zyvorctl vm <subcommand>` pattern, a `--name` flag, and a `4G` memory suffix — none of which the real CLI supports. Corrected to match the actual flat command surface.
- GPU passthrough docs described vGPU/Intel GVT-g support, GPU-specific REST endpoints, and a `zyvorctl gpu` CLI subcommand — none of which exist. Rewritten to describe the real capability: generic PCI/VFIO passthrough.
- Fictional etcd-clustering and memory-based live-migration content removed from docs.

### Changed
- Renamed the Ephemera VM driver integration to FluxVM (crates, config keys, docs, scripts).
- Relicensed to Apache License 2.0; removed proprietary legal docs and audited dependency licenses.
- Internal `vmspawnd_*` identifiers renamed; fictional Prometheus metrics corrected or flagged.

## 0.1.0

- Initial release.
