# The Ephemera VM driver

Zyvor Fabric's VM lifecycle runs through a pluggable `driver-core::VmDriver` implementation, selected by `[driver].backend` in `zyvor-fabricd.toml`:

- **`machinectl`** (default) — systemd-vmspawn + systemd-machined over D-Bus.
- **`ephemera`** — [Ephemera](https://github.com/hypersdk/ephemera), a standalone disposable-VM control plane with no systemd dependency, spoken to over its REST API.

This page covers the Ephemera backend specifically: what it wires up today, what it doesn't yet, and how to configure it.

## When to choose it

Pick `ephemera` when you want Zyvor Fabric running on a host with no systemd-machined/systemd-vmspawn stack at all, or when you want VM lifecycle backed by Ephemera's own QEMU/Cloud Hypervisor/Firecracker support directly. Stay on the default `machinectl` backend if you need vCPU pinning or hotplug (resizing a running VM) — neither is wired through the Ephemera driver yet (see [Known gaps](#known-gaps-as-of-ephemera-v010) below).

## Configuration

```toml
[driver]
backend = "ephemera"
ephemera_url = "http://127.0.0.1:7788"   # Ephemera's REST API base URL
# ephemera_token = "..."                  # only if Ephemera has auth.tokens configured
```

`ephemera_url` and `ephemera_token` are only consulted when `backend = "ephemera"`. See [Ephemera's own README](https://github.com/hypersdk/ephemera#readme) for running `ephemera serve` itself.

## What's wired today

The `ephemera-driver`/`ephemera-client` crates (`backend/crates/`) implement `driver-core`'s trait family against Ephemera's REST API:

| Capability | `driver-core` trait | Ephemera endpoint(s) |
| --- | --- | --- |
| Create, list, get, resolve by name | `VMDriver` | `POST`/`GET /v1/vms`, `GET /v1/vms?name=` |
| Start, stop, pause, resume, delete | `VMDriver` | `/v1/vms/{id}/{start,stop,pause,resume}`, `DELETE /v1/vms/{id}` |
| Shell exec (no SSH) | `ShellDriver` | `POST /v1/vms/{id}/agent` — over Ephemera's vsock guest agent |
| CPU/memory/IO/pids/cpuset limits | `ResourceControlDriver` | `POST /v1/vms/{id}/resources` |
| Point-in-time usage + PSI pressure | `ResourceStatsDriver` | `GET /v1/vms/{id}/{stats,pressure}` |
| Freeze/thaw (cgroup v2 freezer) | — | `POST /v1/vms/{id}/{freeze,thaw}`, `GET .../frozen` |
| Live console log streaming | `LogDriver` | `GET /v1/vms/{id}/logs?follow=true` |
| Image catalog CRUD | `ImageDriver` | `/v1/images/catalog` add/remove/rename/clone/export |

Log streaming's one fidelity reduction versus `MachinectlDriver`: raw serial console output has no journald-equivalent per-line priority/unit metadata, so every entry is stamped uniformly rather than carrying real per-line priority.

## Known gaps (as of Ephemera v0.1.0)

`ephemera-client`'s wire types are a **hand-synced mirror** of `ephemera-core::model` — integration is out-of-process (REST, not a Cargo dependency on Ephemera's own crates), a deliberate trade for not coupling this repo's build to Ephemera's crate versions. That means new Ephemera capabilities don't automatically show up here. As of Ephemera v0.1.0, this driver does **not** yet expose:

- **Pluggable storage backends** — `CreateVmRequest.storage` (LVM thin snapshots, NBD-exported disks, Ceph RBD). Every VM created through this driver gets Ephemera's default qcow2 CoW overlay / raw reflink.
- **Per-VM network namespaces** — `NetworkSpec::Tap.netns`. VMs created through this driver share Ephemera's default bridge-based networking.
- **Firecracker jailer / vsock-proxy bookkeeping** — `VmRecord.jail_path`, `vsock_socket`, plus `lvm_lv`/`nbd_pid` (the storage-backend cleanup fields above).

None of this is broken — it's simply not surfaced through `driver-core` yet. Closing this gap is a matter of extending `ephemera-client`'s DTOs and `ephemera-driver`'s trait mappings, not an Ephemera-side limitation.

**Not applicable to this driver at all** (separate ways to run Ephemera, not something a REST-client driver consumes): Ephemera's `ephemera-kube` Kubernetes `DisposableVm` CRD/operator, and its `ephemera-agent` distributed fleet registry for multi-host placement. Those are alternatives to embedding Ephemera behind Zyvor Fabric, not features this driver would wrap.

## See also

- [Ephemera README](https://github.com/hypersdk/ephemera#readme) — the full feature set, storage backends, Kubernetes operator, and distributed node-agent.
- [Operations guide](../operations/README.md) — driver selection in the broader operational context.
