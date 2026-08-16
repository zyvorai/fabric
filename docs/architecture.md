# Zyvor Fabric Architecture

## Overview

Zyvor Fabric is a virtual machine management platform built in Rust. It provides VM lifecycle management through a REST and WebSocket API, a React web UI, a CLI, a TUI, a Kubernetes operator, and a Terraform provider, backed by a pluggable VM driver: `machinectl` (systemd-vmspawn + systemd-machined via D-Bus, the default) or `ephemera` (a disposable-VM engine with no systemd dependency, opt-in via `driver.backend` in `zyvor-fabricd.toml`). systemd itself is optional for the daemon's own packaging/init too -- it runs fine under systemd or any other supervisor.

## System Diagram

```
 +--------+   +-----------+   +----------+   +-----------+   +------------+
 | zyvorctl  |   | zyvorctl-tui |   |  Web UI  |   |    K8s    |   | Terraform  |
 | (CLI)  |   |   (TUI)   |   | (React)  |   | Operator  |   | Provider   |
 +---+----+   +-----+-----+   +----+-----+   +-----+-----+   +------+-----+
     |              |              |               |                 |
     +--------------+--------------+---------------+-----------------+
                                   |
                    +--------------v--------------+
                    |      zyvor-fabricd daemon         |
                    |  (Axum + Tokio async runtime)|
                    +-+--+--+--+--+--+--+--+--+---+
                      |  |  |  |  |  |  |  |  |
        +-------------+  |  |  |  |  |  |  |  +-------------+
        v                v  |  |  |  |  |  v                 v
   +---------+    +------+  |  |  |  |  |  +------+   +-----------+
   |cloud-init|   | VNC  |  |  |  |  |  |  | TPM  |   | WebSocket |
   |Generator |   |Proxy |  |  |  |  |  |  |Mgr   |   | Console   |
   +---------+    +------+  |  |  |  |  |  +------+   +-----------+
                             |  |  |  |  |
              +--------------+  |  |  |  +-----------+
              v                 v  |  v              v
        +---------+      +------+  |  +------+  +---------+
        |Prometheus|     |State |  |  |  HA  |  | Backup  |
        |Exporter  |     |Store |  |  |Cluster| | Restore |
        +---------+      +------+  |  +------+  +---------+
                                    v
                        +-----------+-----------+
                        |   VM Driver (pluggable)|
                        |  machinectl | ephemera |
                        +-----------------------+
```

## Crate Structure

The backend is a Cargo workspace with 40 crates organized into functional areas.

### Core

| Crate | Purpose |
|-------|---------|
| `zyvor-fabricd` | Main daemon -- HTTP/WebSocket server, route registration, config loading |
| `zyvor-fabric-vm-driver` | systemd-vmspawn CLI integration used by the `machinectl` driver backend for VM creation/start options |
| `vm-model` | Core data structures: VM definitions, state enums, request/response types |
| `state-store` | Persistent VM state with JSON storage, in-memory caching, file persistence |
| `zyvorctl` | CLI -- scriptable command-line tool with JSON/YAML/table output |
| `zyvorctl-tui` | TUI -- k9s-style terminal dashboard with 8 views |

### Core Library Crates (`backend/crates/`)

| Crate | Purpose |
|-------|---------|
| `zyvor-fabric-cgroup` | cgroup v2 resource management |
| `zyvor-fabric-system` | System integration utilities |
| `zyvor-fabric-vm` | VM model and type definitions |
| `zyvor-fabric-storage` | Storage backend abstraction |
| `zyvor-fabric-driver-core` | Pluggable `VmDriver` trait (lifecycle, resource control, logs, images, shell, capabilities) both backends implement |
| `vmspawnd-machinectl-driver` | `machinectl`/systemd-machined driver backend (D-Bus + systemd-vmspawn CLI) -- the default |
| `vmspawnd-machined-dbus` | systemd-machined D-Bus bindings (zbus), used by the machinectl backend |
| `zyvor-fabric-ephemera-client` | REST client for Ephemera's API |
| `zyvor-fabric-ephemera-driver` | `ephemera` driver backend implementing `VmDriver` against Ephemera -- no systemd dependency |
| `zyvor-fabric-dnsmasq-manager` | Per-bridge DHCP via a directly-managed `dnsmasq` process (replaces systemd-networkd's built-in DHCP server) |
| `zyvor-fabric-lock-manager` | Distributed lock management |

### Networking

| Crate | Purpose |
|-------|---------|
| `networking` | Bridge, VLAN, and interface management |
| `network-policy` | Cilium-style label-based ingress/egress rules |
| `vm-firewall` | Per-VM firewall profiles and zones via nftables |
| `service-mesh` | Virtual IP load-balanced services |
| `traffic-shaping` | QoS -- guaranteed/max rate, burst, priority |
| `dns-policy` | DNS zone management and domain blocking |
| `vpn-mesh` | WireGuard tunnels (point-to-point, hub-spoke, full-mesh) |
| `packet-mirror` | Traffic capture with tc mirred |
| `nat-gateway` | Masquerade, SNAT, DNAT, hairpin NAT via nftables |
| `net-monitor` | Per-VM bandwidth tracking with threshold alerts |

### Storage

| Crate | Purpose |
|-------|---------|
| `storage` | Local, NFS, LVM, LVM-thin, ZFS storage backends |
| `distributed-storage` | Ceph/RBD distributed storage |

### Security and Identity

| Crate | Purpose |
|-------|---------|
| `security` | JWT auth, RBAC, API keys, audit logging |
| `tpm-support` | Virtual TPM management (swtpm, TPM 1.2/2.0) |
| `encryption` | Encryption at rest |
| `certificate-manager` | TLS certificate management |

### Cloud and Console

| Crate | Purpose |
|-------|---------|
| `cloud-init` | NoCloud ISO generation for automated VM initialization |
| `vnc-proxy` | WebSocket-to-TCP VNC proxy for noVNC |
| `gpu-passthrough` | VFIO GPU passthrough (NVIDIA, AMD, Intel GVT-g) |

### High Availability

| Crate | Purpose |
|-------|---------|
| `ha` | etcd-based clustering and leader election |
| `migration` | Live and offline VM migration |
| `fault-tolerance` | Automatic failover and fencing |
| `replication` | Data replication across nodes |
| `site-recovery` | Disaster recovery plans and execution |
| `predictive-drs` | Distributed Resource Scheduling |

### Operations

| Crate | Purpose |
|-------|---------|
| `backup` | Backup/restore with retention policies |
| `scheduler` | VM scheduling (once, daily, weekly) |
| `lifecycle-manager` | VM lifecycle automation |
| `resource-pools` | Resource pool management |
| `datacenter` | Datacenter and cluster abstractions |
| `content-library` | Shared image and template repository |
| `prometheus-exporter` | Prometheus metrics endpoint |
| `host-agent` | Host-level agent for cluster management |

## Technology Stack

| Layer | Technology |
|-------|------------|
| Language | Rust (2021 edition) |
| Async runtime | Tokio 1.44 |
| Web framework | Axum 0.8 |
| Serialization | serde + serde_json |
| CLI | clap 4.5 |
| TUI | ratatui 0.29 + crossterm 0.28 |
| D-Bus | zbus 4 |
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Terminal emulator | xterm.js |
| VNC client | noVNC |
| Monitoring | Prometheus |

## API Surface

- **480+ REST endpoints** covering VM management, snapshots, storage, networking, auth, quotas, schedules, audit, analytics, backups, notifications, templates, tags, cloning, DRS, fault tolerance, replication, site recovery, content library, lifecycle, certificates, encryption, resource pools, distributed storage, datacenters, events, autoscaling, hotplug, and image building.
- **3 WebSocket endpoints** for console access, VNC proxying, and live event streaming.

All endpoints use JSON payloads and follow RESTful conventions.

## Data Flow

```
User --> CLI / TUI / Web UI / K8s Operator / Terraform Provider
                      |
                      v
              REST API / WebSocket (Axum + Tokio)
                      |
                      v
               Core Daemon (zyvor-fabricd)
                 /          \
                v            v
          VM Driver      State Store (/var/lib/zyvor-fabricd/)
       (pluggable: driver.backend)
              |
        +-----+------+
        v             v
  machinectl      ephemera --> Virtual Machines
  (systemd-vmspawn/
   machined)
```

## Storage Layout

VM state and artifacts are stored under `/var/lib/zyvor-fabricd/`:

```
/var/lib/zyvor-fabricd/
  *.json              VM metadata and configuration
  images/             VM disk images
  tpm/                Per-VM vTPM state directories
  snapshots/          VM snapshot data
  backups/            Backup archives
  state/              Persistent daemon state
```

## systemd Integration (optional)

systemd is no longer required to install or run zyvor-fabricd -- packaging has no hard `Requires: systemd`, no sysusers.d/tmpfiles.d/preset (the daemon creates its own runtime directories at startup), and the backup/cleanup jobs that used to be systemd timers now run from an in-process tokio scheduler. The units below are still shipped for operators who choose to run under systemd anyway; nothing in packaging auto-enables or auto-starts them.

| Unit | Purpose |
|------|---------|
| `zyvor-fabricd.service` | Main daemon (`Type=simple`; systemd hardening via `ProtectSystem=strict`, capability bounding -- no socket activation, no watchdog) |
| `vm@.service` | Per-VM service template (machinectl driver backend only) |

## Security Model

- Runs as root (required for VM management and networking)
- When run under systemd, its hardening directives further restrict filesystem and network access -- not required when run another way
- JWT-based API authentication with SQLite user store
- Auto-generated JWT secret persisted to `/var/lib/zyvor-fabricd/.jwt_secret` (mode `0600`)
- Auto-generated admin password written to `/var/lib/zyvor-fabricd/.admin_password` (mode `0600`) on first startup
- RBAC with three roles: Admin, User, Viewer
- TLS support for production deployments
- vTPM for guest attestation and secure boot
- Audit logging for all administrative actions
- Input validation on all user-facing parameters (VM names, IP addresses, paths, storage names)
- Parameterized SQL queries throughout (no injection risk)
- No shell pipelines — all subprocess calls use direct argument passing
