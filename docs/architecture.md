# vmspawnd Architecture

## Overview

vmspawnd is a virtual machine management platform built in Rust. It provides VM lifecycle management through a REST and WebSocket API, a React web UI, a CLI, a TUI, a Kubernetes operator, and a Terraform provider -- all backed by systemd-vmspawn and systemd-machined.

## System Diagram

```
 +--------+   +-----------+   +----------+   +-----------+   +------------+
 | vmctl  |   | vmctl-tui |   |  Web UI  |   |    K8s    |   | Terraform  |
 | (CLI)  |   |   (TUI)   |   | (React)  |   | Operator  |   | Provider   |
 +---+----+   +-----+-----+   +----+-----+   +-----+-----+   +------+-----+
     |              |              |               |                 |
     +--------------+--------------+---------------+-----------------+
                                   |
                    +--------------v--------------+
                    |      vmspawnd daemon         |
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
                        |   systemd-vmspawn     |
                        |   systemd-machined    |
                        +-----------------------+
```

## Crate Structure

The backend is a Cargo workspace with 40 crates organized into functional areas.

### Core

| Crate | Purpose |
|-------|---------|
| `vmspawnd` | Main daemon -- HTTP/WebSocket server, route registration, config loading |
| `vmspawn-driver` | systemd-vmspawn integration for VM creation and management |
| `vm-model` | Core data structures: VM definitions, state enums, request/response types |
| `state-store` | Persistent VM state with JSON storage, in-memory caching, file persistence |
| `vmctl` | CLI -- scriptable command-line tool with JSON/YAML/table output |
| `vmctl-tui` | TUI -- k9s-style terminal dashboard with 8 views |

### Core Library Crates (`backend/crates/`)

| Crate | Purpose |
|-------|---------|
| `vmspawnd-cgroup` | cgroup v2 resource management |
| `vmspawnd-system` | System integration utilities |
| `vmspawnd-vm` | VM model and type definitions |
| `vmspawnd-storage` | Storage backend abstraction |
| `vmspawnd-driver-core` | Driver core functionality |
| `vmspawnd-machinectl-driver` | machinectl/systemd-machined integration via D-Bus |
| `vmspawnd-machined-dbus` | systemd-machined D-Bus bindings (zbus) |
| `vmspawnd-lock-manager` | Distributed lock management |

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
               Core Daemon (vmspawnd)
                 /          \
                v            v
          VM Drivers     State Store (/var/lib/vmspawnd/)
              |
              v
        systemd-vmspawn --> Virtual Machines
```

## Storage Layout

VM state and artifacts are stored under `/var/lib/vmspawnd/`:

```
/var/lib/vmspawnd/
  *.json              VM metadata and configuration
  images/             VM disk images
  tpm/                Per-VM vTPM state directories
  snapshots/          VM snapshot data
  backups/            Backup archives
  state/              Persistent daemon state
```

## systemd Integration

| Unit | Purpose |
|------|---------|
| `vmspawnd.service` | Main daemon (Type=notify, WatchdogSec=60s) |
| `vmspawnd.socket` | Socket activation on 0.0.0.0:8080 |
| `vm@.service` | Per-VM service template |
| `vmspawnd.sysusers` | System group creation |
| `vmspawnd.tmpfiles` | Directory creation |
| `vmspawnd.preset` | Default enable state |

The daemon runs with systemd hardening: `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes`, and capability bounding.

## Security Model

- Runs as root (required for VM management and networking)
- systemd hardening directives restrict filesystem and network access
- JWT-based API authentication with SQLite user store
- RBAC with three roles: Admin, User, Viewer
- TLS support for production deployments
- vTPM for guest attestation and secure boot
- Audit logging for all administrative actions
