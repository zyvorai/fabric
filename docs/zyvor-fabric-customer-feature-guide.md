# Zyvor Fabric — Feature Guide

> **A systemd-native private cloud control plane.**

Zyvor Fabric wraps systemd-vmspawn and systemd-machined in a complete Rust control plane, giving you Proxmox- and KubeVirt-class capabilities without the heavyweight stack. Manage the same infrastructure five ways — CLI, terminal UI, web dashboard, Kubernetes operator, or Terraform — over a single daemon exposing 480+ REST endpoints and live WebSocket channels. VMs become first-class systemd units with journal logging, watchdogs, and socket activation, so there are no custom hypervisor patches or kernel modules to maintain.

**480+** REST API endpoints · **5** management interfaces · **40+** Rust backend crates · **6** storage backends · **37+** web dashboard pages · **1** binary, one config, one service

This is the customer-facing feature reference. A print-ready PDF of the same content sits alongside this file. Generated from the product's actual capabilities.

## Contents

1. [VM Lifecycle & Provisioning](#1-vm-lifecycle-provisioning)
2. [Storage Orchestration](#2-storage-orchestration)
3. [Software-Defined Networking](#3-software-defined-networking)
4. [Security & Identity](#4-security-identity)
5. [High Availability & Disaster Recovery](#5-high-availability-disaster-recovery)
6. [Compute, GPU & Virtualization](#6-compute,-gpu-virtualization)
7. [Monitoring, Automation & Operations](#7-monitoring,-automation-operations)
8. [Interfaces & Automation Surfaces](#8-interfaces-automation-surfaces)
9. [Fleet, Cost & Governance](#9-fleet,-cost-governance)

## 1. VM Lifecycle & Provisioning

_Create, run, and reshape virtual machines on systemd-vmspawn with declarative or interactive workflows._

- **Full VM Lifecycle** — Create, start, stop, restart, pause, resume, hibernate, and delete VMs backed by systemd-vmspawn and KVM. — _One consistent lifecycle across CLI, TUI, web, Terraform, and Kubernetes._
- **Declarative Apply** — Define VMs in YAML and reconcile them with vmctl apply -f config.yaml. — _GitOps-friendly infrastructure without a control-plane rewrite._
- **Cloning & Templates** — Full and linked copy-on-write clones plus reusable templates for rapid deployment. — _Stand up fleets from a golden image in seconds, not minutes._
- **Hibernate & Checkpoint** — Suspend-to-disk hibernate, resume from snapshot, and VM checkpoint/restore and forking. — _Pause idle workloads and restore exact machine state on demand._
- **Live Hotplug** — Hotplug CPU, memory, disk, and NIC into running VMs without a reboot. — _Scale a VM to demand while it keeps serving traffic._
- **Disk Import & Conversion** — Import VMs from VMDK, VDI, and VHD with auto-conversion to qcow2, and online disk resize via QMP. — _Bring machines off VMware or VirtualBox without downtime._

> VMs are ordinary systemd units — journalctl, watchdogs, and socket activation work exactly as operators already expect.

## 2. Storage Orchestration

_Six pluggable backends, live disk mobility, and a built-in cloud-image catalog._

- **Six Storage Backends** — Pool and volume management across Local, NFS, LVM, LVM-thin, ZFS, and Ceph/RBD. — _Use the storage you already run — no dedicated SAN required._
- **Volume Management** — Full volume CRUD with attach/detach, online resize, and clone operations. — _Reshape storage for a workload without recreating the VM._
- **Snapshots & Retention** — Create and restore snapshots with configurable retention policies. — _Roll back a bad change in seconds and prune old state automatically._
- **Storage Live Migration** — Move VM disks between pools with no downtime, guided by SDRS recommendations. — _Rebalance or evacuate storage while VMs stay online._
- **ZFS Replication** — Incremental ZFS send/receive replication between hosts and sites. — _Efficient, block-level DR copies that only ship the delta._
- **Cloud Image & ISO Catalog** — Built-in downloader for Ubuntu, Fedora, Debian, and Alma images plus ISO download/list/delete. — _Boot a fresh distro without hunting for images._

## 3. Software-Defined Networking

_A full SDN stack — policies, firewalling, load balancing, VPN mesh, and observability._

- **Network Policies** — Cilium-style label-based ingress/egress rules enforced through nftables. — _Segment east-west traffic with identity, not brittle IP lists._
- **Per-VM Firewall** — Firewall profiles and zones applied per VM via nftables, with IPv6 dual-stack support. — _Ship each workload with its own hardened perimeter._
- **Service Mesh** — Virtual-IP load balancing with round-robin, least-connection, random, and IP-hash strategies plus health checks. — _Front a pool of VMs behind one resilient endpoint._
- **WireGuard VPN Mesh** — Point-to-point, hub-spoke, and full-mesh WireGuard overlay tunnels. — _Securely stitch VMs across sites without external appliances._
- **QoS Traffic Shaping** — Guaranteed and maximum rates, burst, and priority queuing via Linux tc. — _Protect critical workloads from noisy-neighbor bandwidth spikes._
- **DNS Policy & NAT Gateway** — Zone management, upstream servers, domain blocking, plus SNAT/DNAT/hairpin NAT gateways. — _Own DNS and egress routing for every tenant network._
- **Packet Mirror & Net Monitor** — Mirror sessions for traffic capture and per-VM bandwidth tracking with threshold alerts. — _Debug and meter network behavior without leaving the fabric._

## 4. Security & Identity

_JWT auth, enterprise SSO, RBAC, multi-tenancy, and encryption on every endpoint._

- **JWT Auth + RBAC** — JWT authentication with configurable expiry and 3-tier RBAC (Admin/User/Viewer) enforced on every endpoint. — _Least-privilege access is the default, not an add-on._
- **Enterprise SSO** — LDAP and OIDC/OAuth2 integration plus API keys for service-to-service auth. — _Plug into existing identity providers instead of a new user silo._
- **Multi-Tenancy** — Project isolation with member roles and per-project quotas. — _Give teams their own bounded slice of the fabric._
- **Encryption & Secrets** — Encryption at rest, per-VM disk encryption with key rotation, and an encrypted secrets store with access policies. — _Protect data and credentials without external KMS scaffolding._
- **Audit Logging** — Audit trail on all VM lifecycle operations with JSON/CSV export. — _Answer 'who did what, when' for compliance and RCA._
- **PKI & Certificate Manager** — CA creation, certificate issue/renew/revoke, automated rotation, and hardware attestation. — _Run internal TLS without a separate PKI product._
- **Compliance Scanning** — Built-in CIS, STIG, and PCI-DSS profiles with per-VM findings and remediation guidance. — _Prove and improve posture against recognized benchmarks._

> The codebase carries a documented multi-round security audit: zero unsafe Rust, no shell pipelines, parameterized queries, SSRF and path-traversal protection, and bcrypt-hashed credentials.

## 5. High Availability & Disaster Recovery

_Clustering, live migration, fault tolerance, and multi-site recovery._

- **etcd Clustering** — Multi-node clustering on an etcd state store with leader election and heartbeat-based health. — _No single control-plane node to take the fleet down with it._
- **Live Migration** — Move running VMs between hosts with iterative rsync pre-copy and cutover, with progress tracking and cancel. — _Drain a host for maintenance without stopping workloads._
- **Fault Tolerance & Fencing** — Continuous VM replication with automatic failover detection, fencing, and FT metrics. — _Survive a node loss with minimal recovery time._
- **Predictive DRS** — Distributed resource scheduling with demand forecasting, proactive placement, and affinity/anti-affinity rules. — _Keep clusters balanced before hotspots become outages._
- **Site Recovery** — Recovery plans with planned migration, disaster failover, test failover, and reprotection workflows. — _Rehearse and execute cross-site DR with confidence._
- **Multi-Site Replication** — Cross-site VM replication with sync scheduling, RPO monitoring, and recovery instances. — _Meet recovery-point targets you can actually measure._

## 6. Compute, GPU & Virtualization

_Low-level control over CPU topology, memory, accelerators, and firmware._

- **GPU Passthrough** — First-class GPU passthrough for NVIDIA, AMD, and Intel GVT-g on Linux KVM. — _Run AI, rendering, and CAD workloads at near-bare-metal speed._
- **CPU Pinning & NUMA** — CPU topology control, pinning, NUMA-aware placement, and nested virtualization. — _Squeeze predictable performance from latency-sensitive VMs._
- **Memory Optimization** — Memory ballooning, hugepages, and KSM page deduplication via a system resource manager. — _Fit more VMs per host without starving any of them._
- **vTPM & Secure Boot** — TPM 1.2/2.0 via swtpm with per-VM isolated state, UEFI, and Secure Boot firmware management. — _Support BitLocker, LUKS, and measured boot inside guests._
- **cloud-init Provisioning** — NoCloud datasource generation for users, packages, network config, and SSH key injection. — _Boot fully configured VMs on first start, hands-free._
- **OVA/OVF & Content Library** — OVA/OVF export and import plus a content library with cross-site image/template sync and customization specs. — _Standardize and share golden images across every site._

## 7. Monitoring, Automation & Operations

_Metrics, scheduling, notifications, and self-checks that keep the fabric healthy._

- **Prometheus Metrics** — A /metrics endpoint exposing per-VM CPU, memory, disk, and network stats plus API latency, with a prebuilt Grafana dashboard. — _Drop into your existing observability stack instantly._
- **Scheduling & Auto Backups** — Once/daily/weekly VM schedules plus automated daily backups and weekly state-store cleanup via systemd timers. — _Routine operations run themselves, on time, every time._
- **Backup & Restore** — Per-VM and bulk backups with retention policies and incremental backups from web UI and TUI. — _Recover a single VM or the whole fleet on your own terms._
- **Multi-Channel Notifications** — Email, Slack, Microsoft Teams, and webhook alerts with retry and backoff. — _The right people hear about problems the moment they happen._
- **Health & Auto-Verify** — Deep health checks (API, disk, DB, timers, KVM) and post-install smoke tests of API, auth, VM CRUD, and backups. — _Catch a broken deploy before your users do._
- **Config Snapshots & Events** — Versioned config-snapshot API, retained lifecycle events, and an SSE event stream for time-machine correlation. — _Diff infrastructure over time and reconstruct incidents._

## 8. Interfaces & Automation Surfaces

_Five first-class ways to drive the same daemon — pick per task, not per product._

| Interface | Best for | Highlights |
|---|---|---|
| vmctl CLI | Scripting & automation | JSON/YAML/table output, apply -f |
| vmctl-tui | Live terminal ops | vim keys, sparklines, per-VM actions |
| Web dashboard | Operators & teams | 37+ pages, Ctrl+K palette, bulk ops |
| K8s operator | GitOps / K8s shops | VirtualMachine CRD reconciliation |
| Terraform / SDK | Infra-as-code | plan/apply, typed Rust + Python + Ansible |

- **vmctl CLI** — Scriptable command-line client with JSON/YAML/table output covering VM, policy, storage, and network operations. — _Automate anything the platform can do from a shell script._
- **vmctl-tui** — k9s-style ratatui terminal dashboard with vim keybindings, sparklines, and live per-VM actions. — _Fleet control from a terminal, no browser required._
- **Web Dashboard** — React web UI with 37+ pages, a Ctrl+K command palette, dark theme, live WebSocket updates, and bulk operations. — _Give operators a full GUI without giving up the API._
- **Console & VNC** — Browser terminal via xterm.js over WebSocket and graphical VNC via a noVNC proxy, authenticated with the same JWT. — _Reach any VM's console without exposing raw ports._
- **Kubernetes Operator** — Manage VMs as VirtualMachine CRDs with continuous reconciliation via a Helm-installable operator. — _Define VMs alongside containers in the same GitOps flow._
- **Terraform, SDK & Ansible** — A Terraform provider with full plan/apply, a typed Rust vmspawn-sdk, plus Python and Ansible SDKs. — _Provision the fabric from whatever IaC tooling your team already uses._

## 9. Fleet, Cost & Governance

_Datacenter hierarchy, resource pools, chargeback, and lifecycle compliance at scale._

- **Datacenter Hierarchy** — Model datacenters, clusters, and hosts with registration, heartbeat, maintenance mode, and auto-discovery. — _Organize sprawling infrastructure into a navigable topology._
- **Resource Pools & Quotas** — CPU/memory/storage reservations with admission control, overcommit ratios, and pool-level quotas. — _Guarantee capacity to teams while preventing runaway usage._
- **Billing & Chargeback** — Per-VM metering, configurable pricing tiers, invoice generation, and chargeback reports. — _Show every team the true cost of what they run._
- **Lifecycle Manager** — Host baseline definitions, compliance scanning, remediation, and rolling updates with pause/advance. — _Keep every host on a known-good, patched baseline._
- **Distributed Storage Policies** — Datastore clusters, storage policies, SDRS recommendations, and compliance checking. — _Enforce storage placement rules automatically across pools._

> Deployment scales from a single 4GB edge server to a 3+ node etcd cluster with shared storage and HA failover — same binary, same API.

## Getting started

1. **Install in one command** — Clone the repo and run make build && sudo make install, or ./vmspawnctl deploy for an auto-sudo end-to-end setup.
2. **Start the service** — Run sudo systemctl enable --now zyvor-fabric, then read the auto-generated admin password with ./vmspawnctl password.
3. **Create your first VM** — Use vmctl vm create --name web-01 --cpus 2 --memory 4G, or declare it in YAML and run vmctl apply -f config.yaml.
4. **Open your interface of choice** — Launch vmctl-tui in a terminal or open the web dashboard at https://localhost:8443 to manage the fleet.
5. **Verify and monitor** — Run ./vmspawnctl verify and ./vmspawnctl health, then scrape /metrics into Prometheus and import the bundled Grafana dashboard.

> **Good to know:** Zyvor Fabric requires Linux with systemd 256+ (Fedora, Ubuntu, Debian, RHEL, or SUSE) and KVM; it is not a hosted or Windows-server product. Some enterprise capabilities carry environmental prerequisites — swtpm for vTPM, an etcd cluster and shared/replicated storage for HA and live migration, and matching hardware/IOMMU for GPU passthrough. Multi-node HA is designed for 3+ nodes; single-server deployments run standalone. The published endpoint and page counts (480+ REST endpoints, 37+ web pages) reflect current documentation and may vary by release, and the macOS Machina workbench is a separate desktop product that consumes the Fabric API rather than part of this daemon.

---
_Zyvor Fabric is developed by ZyvorAI Labs. Contact **info@zyvor.dev** · Proprietary & Confidential._
