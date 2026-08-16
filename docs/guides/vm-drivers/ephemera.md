# The VM driver: Ephemera

Zyvor Fabric's VM lifecycle runs through `driver-core::VmDriver`, implemented against [Ephemera](https://github.com/hypersdk/ephemera) — a standalone disposable-VM control plane with no systemd dependency, spoken to over its REST API and its vsock guest agent. This is the only VM driver; there's no backend to choose.

This page covers what's wired up today, what isn't yet, and how to configure it.

## Configuration

```toml
[driver]
ephemera_url = "http://127.0.0.1:7788"   # Ephemera's REST API base URL
# ephemera_token = "..."                  # only if Ephemera has auth.tokens configured
```

See [Ephemera's own README](https://github.com/hypersdk/ephemera#readme) for running `ephemera serve` itself.

## What's wired today

The `ephemera-driver`/`ephemera-client` crates (`backend/crates/`) implement `driver-core`'s trait family against Ephemera's REST API:

| Capability | `driver-core` trait | Ephemera endpoint(s) |
| --- | --- | --- |
| Create, list, get, resolve by name | `VMDriver` | `POST`/`GET /v1/vms`, `GET /v1/vms?name=` |
| Start, stop, pause, resume, delete | `VMDriver` | `/v1/vms/{id}/{start,stop,pause,resume}`, `DELETE /v1/vms/{id}` |
| Hotplug (CPU/memory/disk/nic) | — | Generic — resolves `VMDriver::get_control_socket` and speaks QMP directly, no Ephemera-specific wiring needed |
| CPU pinning (cgroup cpuset) | `ResourceControlDriver::{set,get}_cpuset` | `POST /v1/vms/{id}/resources`, `GET /v1/vms/{id}/cpuset` |
| CPU/memory/IO/pids limits | `ResourceControlDriver` | `POST /v1/vms/{id}/resources` |
| Point-in-time usage + PSI pressure | `ResourceStatsDriver` | `GET /v1/vms/{id}/{stats,pressure}` |
| Freeze/thaw (cgroup v2 freezer) | — | `POST /v1/vms/{id}/{freeze,thaw}`, `GET .../frozen` |
| Live console log streaming | `LogDriver` | `GET /v1/vms/{id}/logs?follow=true` |
| Shell exec (no SSH needed) | `ShellDriver::shell` | `POST /v1/vms/{id}/agent` — over Ephemera's vsock guest agent |
| Interactive console (real PTY) | `ConsoleDriver::open_console` | `GET /v1/vms/{id}/console` — a WebSocket, relayed end-to-end from the browser's own console tab through to a PTY-backed shell in the guest. No live terminal resize — the PTY is sized once at open time |
| File copy to/from the guest | `ShellDriver::{copy_to,copy_from}` | `POST /v1/vms/{id}/agent/{put,get}-file` — same vsock agent, base64-in-one-request, capped at 64MiB |
| SSH info | — | Resolves the VM's MAC (pinned at create time) to an IP via zyvor-fabricd's own DHCP lease file — no vsock/Ephemera call at all. `key_path` is always `null`; key management is the operator's own responsibility (e.g. cloud-init) |
| Bind-mount replacement (virtiofs) | `VMStartOptions.bind_mounts` (create-time only) | `CreateVmRequest.shared_folders` — one `virtiofsd` per share, auto-mounted in-guest via a generated cloud-init `/etc/fstab` entry |
| Image catalog CRUD, incl. read-only flag + orphaned-download cleanup | `ImageDriver` | `/v1/images/catalog` add/remove/rename/clone/export/read-only/clean |

Log streaming's one fidelity reduction: raw serial console output has no journald-equivalent per-line priority/unit metadata, so every entry is stamped uniformly rather than carrying real per-line priority. Image catalog's `pull-tar`/`import-tar`/`export-tar` are permanently unsupported, not just for now — a tar rootfs isn't a bootable disk image for a real hardware VM, so building that would mean writing a full tar-to-bootable-image converter, a different project from wiring up an existing capability.

## Known gaps (as of Ephemera v0.1.0)

`ephemera-client`'s wire types are a **hand-synced mirror** of `ephemera-core::model` — integration is out-of-process (REST, not a Cargo dependency on Ephemera's own crates), a deliberate trade for not coupling this repo's build to Ephemera's crate versions. That means new Ephemera capabilities don't automatically show up here. As of Ephemera v0.1.0, this driver does **not** yet expose:

- **Pluggable storage backends** — `CreateVmRequest.storage` (LVM thin snapshots, NBD-exported disks, Ceph RBD). Every VM created through this driver gets Ephemera's default qcow2 CoW overlay / raw reflink.
- **Per-VM network namespaces** — `NetworkSpec::Tap.netns`. VMs created through this driver share Ephemera's default bridge-based networking.
- **Firecracker jailer / vsock-proxy bookkeeping** — `VmRecord.jail_path`, `vsock_socket`, plus `lvm_lv`/`nbd_pid` (the storage-backend cleanup fields above).

None of this is broken — it's simply not surfaced through `driver-core` yet. Closing this gap is a matter of extending `ephemera-client`'s DTOs and `ephemera-driver`'s trait mappings, not an Ephemera-side limitation.

**Not applicable to this driver at all** (separate ways to run Ephemera, not something a REST-client driver consumes): Ephemera's `ephemera-kube` Kubernetes `DisposableVm` CRD/operator, and its `ephemera-agent` distributed fleet registry for multi-host placement. Those are alternatives to embedding Ephemera behind Zyvor Fabric, not features this driver would wrap.

## See also

- [Ephemera README](https://github.com/hypersdk/ephemera#readme) — the full feature set, storage backends, Kubernetes operator, and distributed node-agent.
- [Operations guide](../operations/README.md) — the driver in the broader operational context.
