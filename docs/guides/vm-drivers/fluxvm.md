# The VM driver: FluxVM

Zyvor Fabric's VM lifecycle runs through `driver-core::VmDriver`, implemented against [FluxVM](https://github.com/zyvorai/fluxvm) — a standalone disposable-VM control plane with no systemd dependency, spoken to over its REST API and its vsock guest agent. FluxVM itself can run guests on **QEMU/KVM, Cloud Hypervisor, Firecracker, or the in-tree FluxVM hypervisor** (`backend: "flux-vm"`, agent-sandbox track). Fabric talks to whichever backends FluxVM has configured; there is no separate Fabric-side VMM picker.

This page covers what's wired up today, what isn't yet, and how to configure it.

## Configuration

```toml
[driver]
fluxvm_url = "http://127.0.0.1:7788"   # FluxVM's REST API base URL
# fluxvm_token = "..."                  # only if FluxVM has auth.tokens configured
```

See [FluxVM's own README](https://github.com/zyvorai/fluxvm#readme) for running `fluxvm serve` itself.

## What's wired today

The `fluxvm-driver`/`fluxvm-client` crates (`backend/crates/`) implement `driver-core`'s trait family against FluxVM's REST API. Every VM this driver creates requests FluxVM's vsock guest agent (`CreateVmRequest.agent.enabled: true`) by default, so shell exec, console, and file copy below work without any extra opt-in — FluxVM bakes in the agent and its auth token at create time, transparent to the caller.

| Capability | `driver-core` trait | FluxVM endpoint(s) |
| --- | --- | --- |
| Create, list, get, resolve by name | `VMDriver` | `POST`/`GET /v1/vms`, `GET /v1/vms?name=` |
| Start, stop, pause, resume, delete | `VMDriver` | `/v1/vms/{id}/{start,stop,pause,resume}`, `DELETE /v1/vms/{id}` |
| Hotplug (CPU/memory/disk/nic) | — | Generic — resolves `VMDriver::get_control_socket` and speaks QMP directly, no FluxVM-specific wiring needed |
| CPU pinning (cgroup cpuset) | `ResourceControlDriver::{set,get}_cpuset` | `POST /v1/vms/{id}/resources`, `GET /v1/vms/{id}/cpuset` |
| CPU/memory/IO/pids limits | `ResourceControlDriver` | `POST /v1/vms/{id}/resources` |
| Point-in-time usage + PSI pressure | `ResourceStatsDriver` | `GET /v1/vms/{id}/{stats,pressure}` |
| Freeze/thaw (cgroup v2 freezer) | — | `POST /v1/vms/{id}/{freeze,thaw}`, `GET .../frozen` |
| Live console log streaming | `LogDriver` | `GET /v1/vms/{id}/logs?follow=true` |
| Shell exec (no SSH needed) | `ShellDriver::shell` | `POST /v1/vms/{id}/agent` — over FluxVM's vsock guest agent |
| Interactive console (real PTY) | `ConsoleDriver::open_console` | `GET /v1/vms/{id}/console` — a WebSocket, relayed end-to-end from the browser's own console tab through to a PTY-backed shell in the guest. No live terminal resize — the PTY is sized once at open time |
| File copy to/from the guest | `ShellDriver::{copy_to,copy_from}` | `POST /v1/vms/{id}/agent/{put,get}-file` — same vsock agent, base64-in-one-request, capped at 64MiB |
| SSH info | — | Resolves the VM's MAC (pinned at create time) to an IP via zyvor-fabricd's own DHCP lease file — no vsock/FluxVM call at all. `key_path` is always `null`; key management is the operator's own responsibility (e.g. cloud-init) |
| Bind-mount replacement (virtiofs) | `VMStartOptions.bind_mounts` (create-time only) | `CreateVmRequest.shared_folders` — one `virtiofsd` per share, auto-mounted in-guest via a generated cloud-init `/etc/fstab` entry |
| Image catalog CRUD, incl. read-only flag + orphaned-download cleanup | `ImageDriver` | `/v1/images/catalog` add/remove/rename/clone/export/read-only/clean |

Log streaming's one fidelity reduction: raw serial console output has no journald-equivalent per-line priority/unit metadata, so every entry is stamped uniformly rather than carrying real per-line priority. Image catalog's `pull-tar`/`import-tar`/`export-tar` are permanently unsupported, not just for now — a tar rootfs isn't a bootable disk image for a real hardware VM, so building that would mean writing a full tar-to-bootable-image converter, a different project from wiring up an existing capability.

## Known gaps (as of FluxVM v0.1.0)

`fluxvm-client`'s wire types are a **hand-synced mirror** of `fluxvm-core::model` — integration is out-of-process (REST, not a Cargo dependency on FluxVM's own crates), a deliberate trade for not coupling this repo's build to FluxVM's crate versions. That means new FluxVM capabilities don't automatically show up here. As of FluxVM v0.1.0, this driver does **not** yet expose:

- **Pluggable storage backends** — `CreateVmRequest.storage` (LVM thin snapshots, NBD-exported disks, Ceph RBD). Every VM created through this driver gets FluxVM's default qcow2 CoW overlay / raw reflink.
- **Per-VM network namespaces** — `NetworkSpec::Tap.netns`. VMs created through this driver share FluxVM's default bridge-based networking.
- **Firecracker jailer / vsock-proxy bookkeeping** — `VmRecord.jail_path`, `vsock_socket`, plus `lvm_lv`/`nbd_pid` (the storage-backend cleanup fields above).
- **Agent-sandbox surface** — FluxVM's `/v1/sandboxes`, memory snapshots, AutoPause, L7 egress, and `/console` ops UI. Those stay on FluxVM's own API for now; Fabric continues to use the classic `/v1/vms` lifecycle.

None of this is broken — it's simply not surfaced through `driver-core` yet. Closing this gap is a matter of extending `fluxvm-client`'s DTOs and `fluxvm-driver`'s trait mappings, not a FluxVM-side limitation.

**Not applicable to this driver at all** (separate ways to run FluxVM, not something a REST-client driver consumes): FluxVM's `fluxvm-kube` Kubernetes `DisposableVm` CRD/operator, and its `fluxvm-agent` distributed fleet registry for multi-host placement. Those are alternatives to embedding FluxVM behind Zyvor Fabric, not features this driver would wrap.

## See also

- [FluxVM README](https://github.com/zyvorai/fluxvm#readme) — the full feature set, storage backends, agent-sandbox track, Kubernetes operator, and distributed node-agent.
- [Operations guide](../operations/README.md) — the driver in the broader operational context.
