# Zyvor Fabric Crate Map

This document catalogs all 51 crates in the Zyvor Fabric workspace, organized by domain.
Each entry includes the crate name, workspace path, and a brief description of its
purpose.

---

## Table of Contents

1. [Core](#core)
2. [Drivers](#drivers)
3. [Networking](#networking)
4. [Storage](#storage)
5. [System Internals](#system-internals)
6. [Management](#management)
7. [Infrastructure](#infrastructure)
8. [Utilities](#utilities)
9. [CLI and UI](#cli-and-ui)
10. [Dependency Summary](#dependency-summary)

---

## Core

These crates form the foundation of the Zyvor Fabric platform.

| Crate          | Path                    | Description                                              |
|----------------|-------------------------|----------------------------------------------------------|
| `zyvor-fabricd`    | `backend/zyvor-fabricd`     | Main daemon binary. Axum HTTP server, 480+ REST endpoints, WebSocket console, SSE events, background task orchestrator, plugin system. |
| `vm-model`     | `backend/vm-model`      | Core data structures: `VM`, `VMState`, `CreateVMRequest`, `VMStartOptions`, `VMMetrics`. Shared across all crates. |
| `state-store`  | `backend/state-store`   | File-based persistent storage. Atomic JSON writes, in-memory VM cache, paginated queries, path traversal protection. |
| `security`     | `backend/security`      | Authentication and authorization. JWT token management, PAM integration, RBAC (Admin/User/Viewer), user database (SQLite), audit logging, Axum extractors. |

## Drivers

Zyvor Fabric's VM lifecycle is entirely owned by [Ephemera](https://github.com/hypersdk/ephemera), a disposable-VM engine with no systemd dependency of its own, reached over its REST API. `driver-core` defines the trait boundary (`VmDriver`) between the daemon and that backend; there is no other backend to select — the systemd-machined/systemd-vmspawn driver (`machinectl-driver`/`machined-dbus`) that used to fill this role has been deleted.

| Crate                        | Path                              | Description                                              |
|------------------------------|-----------------------------------|----------------------------------------------------------|
| `zyvor-fabric-driver-core`       | `backend/crates/driver-core`      | Trait definitions the driver implements: `VMDriver` (lifecycle), `ResourceControlDriver`/`ResourceStatsDriver` (cgroup quotas, freeze/thaw, metrics, PSI pressure), `LogDriver` (log streaming), `ImageDriver` (image registry CRUD), `ShellDriver` (exec/copy), `ConsoleDriver` (interactive console), `CapabilityProvider`. Blanket-impl'd as `VmDriver`. |
| `zyvor-fabric-vm-driver`             | `backend/zyvor-fabric-vm-driver`          | Builds VM disk images via `mkosi` (an offline OS-image-building tool) -- unrelated to VM lifecycle, which is entirely Ephemera's job. |
| `zyvor-fabric-ephemera-client`   | `backend/crates/ephemera-client`  | REST client for Ephemera's API -- hand-maintained DTO mirror, since the integration is out-of-process REST rather than a Cargo dependency on Ephemera's own crates. |
| `zyvor-fabric-ephemera-driver`   | `backend/crates/ephemera-driver`  | `VmDriver` implementation backed by Ephemera. A few `ImageDriver` operations (tar-format images) intentionally error rather than fake an equivalent that can't exist -- a tar rootfs isn't a bootable disk image for a real hardware VM. |

## Networking

Ten crates provide a full-featured software-defined networking stack.

| Crate            | Path                         | Description                                              |
|------------------|------------------------------|----------------------------------------------------------|
| `networking`     | `backend/networking`         | Base networking utilities. Bridge, VLAN, TAP, bond, and VXLAN setup via direct netlink (`rtnetlink`) calls -- no config-file/reload step, no systemd-networkd dependency. |
| `network-policy` | `backend/network-policy`     | L3/L4 network access control. Policy engine for identity-based traffic rules. Integrates with nftables for enforcement. |
| `service-mesh`   | `backend/service-mesh`       | Service discovery and load balancing. Service registration, backend health checking, traffic routing. |
| `traffic-shaping`| `backend/traffic-shaping`    | Quality of Service (QoS) management. Bandwidth limits, priority queuing via Linux `tc` (traffic control). |
| `dns-policy`     | `backend/dns-policy`         | DNS zone and record management. Per-VM DNS policies, zone delegation, integration with systemd-resolved. |
| `vm-firewall`    | `backend/vm-firewall`        | Per-VM firewall management. Firewall profiles and zones. Rules enforcement via nftables. |
| `vpn-mesh`       | `backend/vpn-mesh`           | VPN mesh networking. WireGuard tunnel creation and management, overlay network topology. |
| `packet-mirror`  | `backend/packet-mirror`      | Traffic mirroring. Mirror session management for network debugging and analysis. |
| `nat-gateway`    | `backend/nat-gateway`        | NAT gateway management. SNAT/DNAT rules, NAT pools, gateway lifecycle. |
| `net-monitor`    | `backend/net-monitor`        | Network monitoring. Per-VM bandwidth metrics collection, alerting policies, threshold-based notifications. |
| `zyvor-fabric-dnsmasq-manager` | `backend/crates/dnsmasq-manager` | Per-bridge DHCP server: spawns and supervises a `dnsmasq` process directly, replacing systemd-networkd's built-in `[DHCPServer]`. |

## Storage

| Crate                | Path                         | Description                                              |
|----------------------|------------------------------|----------------------------------------------------------|
| `Zyvor Fabric-storage`   | `backend/crates/storage`     | Storage pool and volume management. Supports Local, NFS, LVM, LVM-Thin, ZFS, and Ceph backends. Volume attach/detach, online resize. |
| `distributed-storage`| `backend/distributed-storage`| Distributed storage orchestration. Datastore clusters, storage migration, storage policies, SDRS recommendations, compliance checking. |

## System Internals

| Crate                 | Path                          | Description                                              |
|-----------------------|-------------------------------|----------------------------------------------------------|
| `Zyvor Fabric-system`     | `backend/crates/system`       | System resource management. CPU topology, NUMA placement, memory balloon, hugepages, KSM deduplication, nested virtualization. |
| `Zyvor Fabric-vm`         | `backend/crates/vm`           | VM-level utilities. Checkpoint/restore, VM forking, hotplug (CPU, memory, disk, NIC), firmware management (UEFI, Secure Boot, TPM). |
| `Zyvor Fabric-lock-manager`| `backend/crates/lock-manager`| Distributed lock management. Per-resource advisory locks with configurable TTL and automatic renewal. |
| `Zyvor Fabric-cgroup`     | `backend/crates/cgroup`       | Cgroup v2 integration. Resource accounting, CPU/memory/IO limits for VMs via the cgroup hierarchy. |

## Management

Enterprise management features for large-scale VM deployments.

| Crate                | Path                          | Description                                              |
|----------------------|-------------------------------|----------------------------------------------------------|
| `lifecycle-manager`  | `backend/lifecycle-manager`   | Host lifecycle management. Baseline definitions, compliance scanning, remediation tasks, rolling updates with pause/advance. |
| `certificate-manager`| `backend/certificate-manager` | PKI and certificate management. CA creation, certificate issuance/renewal/revocation, automated rotation, security baselines, hardware attestation. |
| `resource-pools`     | `backend/resource-pools`      | Resource pool management. CPU/memory/storage reservation, admission control, VM assignment, pool-level quotas. |
| `encryption`         | `backend/encryption`          | VM disk encryption. Key management provider integration, encryption policies, per-VM encrypt/decrypt, key rotation. |
| `site-recovery`      | `backend/site-recovery`       | Disaster recovery orchestration. Recovery plans, planned migration, disaster failover, test failover, reprotection workflows. |
| `replication`        | `backend/replication`         | VM replication. Multi-site replication configuration, sync scheduling, RPO monitoring, recovery instance management. |
| `migration`          | `backend/migration`           | VM migration. Live migration between hosts, progress tracking, migration cancellation. |
| `predictive-drs`     | `backend/predictive-drs`      | Predictive Distributed Resource Scheduler. Resource demand forecasting, proactive placement, trend analysis. |
| `secrets-manager`    | `backend/secrets-manager`     | Secrets and credential storage. Encrypted at-rest secret store with CRUD API, access policies, and automatic rotation. |
| `compliance`         | `backend/compliance`          | Compliance profile scanning. Built-in profiles (CIS, STIG, PCI-DSS), per-VM scanning, finding severity, remediation guidance. |
| `billing`            | `backend/billing`             | Usage tracking, pricing, and invoicing. Per-VM metering, configurable pricing tiers, invoice generation, chargeback reports. |

## Infrastructure

| Crate             | Path                       | Description                                              |
|-------------------|----------------------------|----------------------------------------------------------|
| `datacenter`      | `backend/datacenter`       | Datacenter hierarchy management. Datacenters, clusters, hosts. Host registration, heartbeat, maintenance mode, health monitoring, auto-discovery. |
| `host-agent`      | `backend/host-agent`       | Agent for remote host management. Runs on cluster member hosts, reports resource availability, executes controller commands. |
| `fault-tolerance`  | `backend/fault-tolerance`  | High availability. Continuous VM replication, automatic failover detection, test failover, replication suspend/resume, FT metrics. |
| `content-library` | `backend/content-library`  | Centralized content management. Image and template libraries, cross-site synchronization, customization specs, host profiles, compliance. |
| `tpm-support`     | `backend/tpm-support`      | TPM 2.0 integration. Virtual TPM device management for Secure Boot and measured boot chains. |

## Utilities

| Crate                 | Path                           | Description                                              |
|-----------------------|--------------------------------|----------------------------------------------------------|
| `cloud-init`          | `backend/cloud-init`           | Cloud-init configuration generation. User-data, meta-data, network-config for NoCloud datasource. SSH key injection, package installation. |
| `prometheus-exporter` | `backend/prometheus-exporter`  | Prometheus metrics. Exposes `zyvor_fabricd_vms_total`, `zyvor_fabricd_vms_running`, `zyvor_fabricd_vm_starts_total`, etc. via `/metrics` endpoint. |
| `vnc-proxy`           | `backend/vnc-proxy`            | WebSocket-to-VNC proxy. Bridges browser-based noVNC client to QEMU VNC server for graphical VM console. |
| `ova-tools`           | `backend/ova-tools`            | OVA/OVF export and import. Builds OVA archives from VM disk images and metadata, parses OVF descriptors for import. |

## CLI and UI

| Crate       | Path                  | Description                                              |
|-------------|-----------------------|----------------------------------------------------------|
| `zyvorctl`     | `backend/zyvorctl`       | Command-line client. Talks to Zyvor Fabric REST API. VM lifecycle commands, image management, status queries. |
| `zyvor-fabric-sdk`| `backend/zyvor-fabric-sdk` | Typed Rust SDK for the Zyvor Fabric API. Async client with builder pattern, authentication helpers, VM lifecycle, storage, networking, and streaming support. |

### Web UI (not a Rust crate)

| Component       | Path         | Description                                              |
|-----------------|--------------|----------------------------------------------------------|
| `Zyvor Fabric-web`  | `web/`      | React 19 + TypeScript web application. Vite build, Tailwind CSS, React Router, Recharts dashboards, xterm.js console, noVNC graphical console. |

---

## Dependency Summary

### External Crate Dependencies

| Dependency             | Version | Used By           | Purpose                          |
|------------------------|---------|-------------------|----------------------------------|
| `tokio`                | 1.44    | All async crates  | Async runtime                    |
| `axum`                 | 0.8     | Zyvor Fabric          | HTTP framework                   |
| `serde` / `serde_json` | 1.0     | All crates        | Serialization                    |
| `anyhow` / `thiserror` | 1.0/2.0 | All crates        | Error handling                   |
| `tracing`              | 0.1     | All crates        | Structured logging               |
| `tower-http`           | 0.6     | Zyvor Fabric          | CORS, file serving, tracing      |
| `reqwest`              | 0.12    | Zyvor Fabric          | HTTP client for webhooks         |
| `lettre`               | 0.11    | Zyvor Fabric          | SMTP email notifications         |
| `rusqlite`             | -       | security          | SQLite user database             |
| `jsonwebtoken`         | -       | security          | JWT encode/decode                |
| `pam`                  | -       | security          | PAM authentication               |
| `prometheus`           | -       | prometheus-exporter | Metrics registry               |
| `uuid`                 | 1.16    | All crates        | UUID v4/v5 generation            |
| `chrono`               | 0.4     | All crates        | Date/time handling               |
| `clap`                 | 4.5     | zyvorctl          | CLI argument parsing             |
| `futures`              | 0.3     | Async crates      | Stream/sink utilities            |
| `rand`                 | 0.9     | security, core    | Random number generation         |
| `tar` / `flate2`       | 0.4/1.1 | content-library   | Archive handling                 |
| `regex`                | 1.11    | validation        | Input validation patterns        |
| `toml`                 | 0.8     | Zyvor Fabric          | Configuration file parsing       |
| `tokio-util`           | 0.7     | Zyvor Fabric          | CancellationToken for shutdown   |

### Internal Dependency Flow

```
Zyvor Fabric (main binary)
  |-- vm-model
  |-- state-store --> vm-model
  |-- security
  |-- zyvor-fabric-vm-driver
  |-- zyvor-fabric-driver-core --> vm-model
  |-- zyvor-fabric-ephemera-client
  |-- zyvor-fabric-ephemera-driver --> zyvor-fabric-driver-core, zyvor-fabric-ephemera-client
  |-- Zyvor Fabric-storage
  |-- Zyvor Fabric-system
  |-- Zyvor Fabric-vm
  |-- Zyvor Fabric-lock-manager
  |-- Zyvor Fabric-cgroup
  |-- networking
  |-- zyvor-fabric-dnsmasq-manager
  |-- network-policy
  |-- service-mesh
  |-- traffic-shaping
  |-- dns-policy
  |-- vm-firewall
  |-- vpn-mesh
  |-- packet-mirror
  |-- nat-gateway
  |-- net-monitor
  |-- cloud-init
  |-- prometheus-exporter
  |-- vnc-proxy
  |-- tpm-support
  |-- datacenter
  |-- resource-pools
  |-- encryption
  |-- predictive-drs
  |-- distributed-storage
  |-- fault-tolerance
  |-- replication
  |-- migration
  |-- site-recovery
  |-- content-library
  |-- lifecycle-manager
  |-- certificate-manager
  |-- ova-tools --> vm-model
  |-- secrets-manager
  |-- compliance --> vm-model, state-store
  |-- billing --> vm-model, state-store
```
