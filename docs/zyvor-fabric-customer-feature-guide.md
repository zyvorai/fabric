# Zyvor Fabric — Feature Guide

> **A systemd-native private cloud control plane.**

Zyvor Fabric wraps systemd-vmspawn and systemd-machined in a complete Rust control plane, giving you Proxmox- and KubeVirt-class capabilities without the heavyweight stack. Manage the same infrastructure five ways — CLI, terminal UI, web dashboard, Kubernetes operator, or Terraform — over a single daemon exposing 480+ REST endpoints and live WebSocket channels. VMs become first-class systemd units with journal logging, watchdogs, and socket activation, so there are no custom hypervisor patches or kernel modules to maintain.

**480+** REST API endpoints · **5** management interfaces · **40+** Rust backend crates · **6** storage backends · **37+** web dashboard pages · **1** binary, one config, one service

This is the customer-facing onboarding guide — how to access the product, your first workflows, and how to use every feature. A print-ready PDF of the same content sits alongside this file.

## Contents

0. [Getting started — access & first workflows](#getting-started)
1. [VM Lifecycle & Provisioning](#1-vm-lifecycle-provisioning)
2. [Storage Orchestration](#2-storage-orchestration)
3. [Software-Defined Networking](#3-software-defined-networking)
4. [Security & Identity](#4-security-identity)
5. [High Availability & Disaster Recovery](#5-high-availability-disaster-recovery)
6. [Compute, GPU & Virtualization](#6-compute,-gpu-virtualization)
7. [Monitoring, Automation & Operations](#7-monitoring,-automation-operations)
8. [Interfaces & Automation Surfaces](#8-interfaces-automation-surfaces)
9. [Fleet, Cost & Governance](#9-fleet,-cost-governance)

## Getting started

**How to access it**

- **Web:** React dashboard served by the `vmspawnd` daemon at https://localhost:8443 — dark-themed, 37+ pages, a `Ctrl+K` command palette, and live WebSocket/SSE updates. It shares the daemon's origin (no separate web server); generate the TLS cert with `./vmspawnctl tls`.
- **CLI:** `vmctl` — scriptable client with table/JSON/YAML output (`--output json`). Examples: `vmctl vm list`, `vmctl vm create --name web-01 --cpus 2 --memory 4G`, `vmctl vm start web-01`, `vmctl apply -f config.yaml`. Live terminal dashboard: `vmctl-tui` (k9s-style, vim keys, 8 views), pointed at the daemon with `--url http://:`.
- **API:** REST + WebSocket exposed by the `vmspawnd` daemon (480+ endpoints under `/api/...`). Obtain a token with `POST /api/auth/login`, then pass `Authorization: Bearer ` on every call. The same API also backs the Terraform provider, the Kubernetes `VirtualMachine` CRD operator, and the Rust/Python/Ansible SDKs.
- **Login:** Username `admin`; the initial password is auto-generated on first run — read it with `./vmspawnctl password` (or `sudo cat /var/lib/vmspawnd/.admin_password`). JWT tokens last 24h by default (`auth.token_expiration_hours`); 3-tier RBAC (admin/user/viewer) is enforced on every endpoint, with optional TOTP 2FA.
- **Needs:** A Linux host with systemd 256+ and KVM; install and bring the daemon up with `sudo systemctl enable --now zyvor-fabric`.

**Your first workflows**

- **Launch your first VM in five minutes**
  1. Start the daemon: `sudo systemctl enable --now zyvor-fabric`, then read the admin password with `./vmspawnctl password`.
  1. Pull a cloud image from the built-in catalog (`POST /api/images/cloud/download` with `{"name":"fedora-41"}`), or list options first with `GET /api/images/cloud`.
  1. Create the VM: `vmctl vm create --name web-01 --cpus 2 --memory 4G` (image `fedora-41`).
  1. Start it: `vmctl vm start web-01`, then confirm `state: running` with `vmctl vm list`.
  1. Open a console from the web dashboard (https://localhost:8443) or drive it from `vmctl-tui`.
- **Manage VMs declaratively (GitOps)**
  1. Describe one or more VMs (name, cpus, memory, disk, image, tags/labels) in a YAML file.
  1. Reconcile them into the fabric: `vmctl apply -f config.yaml`.
  1. Commit `config.yaml` to git as the source of truth; re-run `vmctl apply -f config.yaml` to converge after edits.
  1. For K8s shops, express the same VMs as `VirtualMachine` CRDs and let the Helm-installed operator reconcile them continuously.
- **Wire up VM networking**
  1. Create a bridge (virtual switch): `POST /api/networkd/bridges` with a name, address, and MTU — every change writes `.netdev`/`.network` files and reloads networkd.
  1. Segment traffic with a VLAN: `POST /api/networkd/vlans` (`{name, id, parent}`), or bond NICs via `POST /api/networkd/bonds`.
  1. Hand out addresses: `POST /api/networkd/dhcp` with the bridge name and a pool range.
  1. Expose a guest service with a port-forward: `POST /api/networkd/port-forwards`.
  1. Do the same from the Web Network Security page (9 Cilium-style tabs) or the `vmctl-tui` Network / Net Security views.
- **Protect a VM with snapshots and backups**
  1. Before a risky change, take a snapshot: `POST /api/vms/web-01/snapshots` (use `snapshot_type: Full` to include memory state).
  1. Roll back if needed: `POST /api/vms/web-01/snapshots//revert`.
  1. Create a durable backup: `POST /api/backups` (`{vm_name, backup_type: full|incremental, retention_days}`).
  1. Automate it with a policy: `POST /api/backups/policies` (daily/weekly, matched by VM tag) — scheduled via systemd timers.
  1. Restore any time with `POST /api/backups/restore`, or drive all of this from the Web Backups page and TUI.
- **Turn a golden image into a fleet**
  1. Build or download a base image, create and configure one VM, then customize first boot via `POST /api/vms/base/cloud-init` (users, packages, SSH keys).
  1. Capture it as a reusable template: `POST /api/templates` (`{name, source_vm}`).
  1. Stamp out instances: `POST /api/templates//deploy` per VM, or `POST /api/vms/base/clone` for full/linked copy-on-write clones.
  1. Deploy from templates and clone VMs directly in the Web Templates / VM Cloning pages.

## 1. VM Lifecycle & Provisioning

_Create, run, and reshape virtual machines on systemd-vmspawn with declarative or interactive workflows._

- **Full VM Lifecycle** — Create, start, stop, restart, pause, resume, hibernate, and delete VMs backed by systemd-vmspawn and KVM. — _One consistent lifecycle across CLI, TUI, web, Terraform, and Kubernetes._
  - **How:** CLI `vmctl vm start|stop|restart|pause|resume|delete ` · Web dashboard VM-list quick actions · TUI VMs view (`s`/`t`/`r`/`d`) · REST `POST /api/vms/:name/{start,stop,restart,pause,resume}` and `DELETE /api/vms/:name`.
- **Declarative Apply** — Define VMs in YAML and reconcile them with vmctl apply -f config.yaml. — _GitOps-friendly infrastructure without a control-plane rewrite._
  - **How:** CLI `vmctl apply -f config.yaml` reconciles a YAML spec (version it in git); equivalent imperative path is REST `POST /api/vms`, or a `VirtualMachine` CRD via the K8s operator.
- **Cloning & Templates** — Full and linked copy-on-write clones plus reusable templates for rapid deployment. — _Stand up fleets from a golden image in seconds, not minutes._
  - **How:** REST `POST /api/vms/:name/clone` (`linked_clone: true|false`) · templates via `POST /api/templates` and `POST /api/templates/:id/deploy` · Web Templates / VM Cloning pages · `vmctl vm clone`.
- **Hibernate & Checkpoint** — Suspend-to-disk hibernate, resume from snapshot, and VM checkpoint/restore and forking. — _Pause idle workloads and restore exact machine state on demand._
  - **How:** Capture machine state with a full snapshot: REST `POST /api/vms/:name/snapshots` (`snapshot_type: Full`) then `POST .../snapshots/:id/revert` · Web VM detail Snapshots tab · TUI/CLI snapshot actions.
- **Live Hotplug** — Hotplug CPU, memory, disk, and NIC into running VMs without a reboot. — _Scale a VM to demand while it keeps serving traffic._
  - **How:** Web VM detail Hotplug tab (live CPU/memory/disk/NIC) · REST resource endpoints under `/api/system/vms/:name/...` · emits `cpu_hotplug`/`memory_hotplug`/`disk_attached` events on the SSE stream.
- **Disk Import & Conversion** — Import VMs from VMDK, VDI, and VHD with auto-conversion to qcow2, and online disk resize via QMP. — _Bring machines off VMware or VirtualBox without downtime._
  - **How:** REST `POST /api/images/import` (VMDK/VDI/VHD → qcow2) and online resize `POST /api/images/:id/resize` · Web VM Create from imported image · `vmctl` image import.

> VMs are ordinary systemd units — journalctl, watchdogs, and socket activation work exactly as operators already expect.

## 2. Storage Orchestration

_Six pluggable backends, live disk mobility, and a built-in cloud-image catalog._

- **Six Storage Backends** — Pool and volume management across Local, NFS, LVM, LVM-thin, ZFS, and Ceph/RBD. — _Use the storage you already run — no dedicated SAN required._
  - **How:** REST `POST /api/storage/pools/{local,nfs,lvm,lvm-thin,zfs,ceph}`, list with `GET /api/storage/pools` · Web Storage page · TUI Storage view (type auto-detected).
- **Volume Management** — Full volume CRUD with attach/detach, online resize, and clone operations. — _Reshape storage for a workload without recreating the VM._
  - **How:** Volume CRUD + attach/detach/resize/clone via the `/api/storage/...` volume endpoints · Web Storage → Volumes (capacity + attachment info) · `vmctl` storage commands.
- **Snapshots & Retention** — Create and restore snapshots with configurable retention policies. — _Roll back a bad change in seconds and prune old state automatically._
  - **How:** REST `POST /api/vms/:name/snapshots`, `GET .../snapshots/tree`, `POST .../snapshots/:id/revert` · Web VM Snapshots tab · retention applied per backup/snapshot policy.
- **Storage Live Migration** — Move VM disks between pools with no downtime, guided by SDRS recommendations. — _Rebalance or evacuate storage while VMs stay online._
  - **How:** Trigger a disk move between pools (SDRS-recommended) via the datastore-cluster/storage-migration REST endpoints · Web Storage policies / Site Operations.
- **ZFS Replication** — Incremental ZFS send/receive replication between hosts and sites. — _Efficient, block-level DR copies that only ship the delta._
  - **How:** Configure incremental send/receive between hosts via the replication REST endpoints · Web replication page · requires ZFS pools on both ends.
- **Cloud Image & ISO Catalog** — Built-in downloader for Ubuntu, Fedora, Debian, and Alma images plus ISO download/list/delete. — _Boot a fresh distro without hunting for images._
  - **How:** REST `GET /api/images/cloud`, `POST /api/images/cloud/download`, ISOs under `GET /api/images/iso` · Web Content Library / Images · files land in `/var/lib/vmspawnd/images`.

## 3. Software-Defined Networking

_A full SDN stack — policies, firewalling, load balancing, VPN mesh, and observability._

- **Network Policies** — Cilium-style label-based ingress/egress rules enforced through nftables. — _Segment east-west traffic with identity, not brittle IP lists._
  - **How:** Label-selector rules via the network-policy REST endpoints · Web Network Security → Policies (direction/priority/enforcement badges) · TUI Net Security → Policies (`S` sync / `d` delete).
- **Per-VM Firewall** — Firewall profiles and zones applied per VM via nftables, with IPv6 dual-stack support. — _Ship each workload with its own hardened perimeter._
  - **How:** REST `GET/POST /api/firewall-profiles` (compiled to nftables) · Web Network Security → Firewall rule builder (protocol/port/CIDR/action) + zones + VM assignments · TUI Firewall tab.
- **Service Mesh** — Virtual-IP load balancing with round-robin, least-connection, random, and IP-hash strategies plus health checks. — _Front a pool of VMs behind one resilient endpoint._
  - **How:** Virtual-IP service + backend pool via the service/load-balancer REST endpoints (algorithm selectable) · Web Network Security → Services · TUI Services tab.
- **WireGuard VPN Mesh** — Point-to-point, hub-spoke, and full-mesh WireGuard overlay tunnels. — _Securely stitch VMs across sites without external appliances._
  - **How:** WireGuard tunnels/networks via the VPN REST endpoints · Web Network Security → VPN peer editor + topology selector · TUI VPN tab.
- **QoS Traffic Shaping** — Guaranteed and maximum rates, burst, and priority queuing via Linux tc. — _Protect critical workloads from noisy-neighbor bandwidth spikes._
  - **How:** tc-based guaranteed/max rate, burst, and priority via the QoS REST endpoints · Web Network Security → QoS · TUI QoS tab.
- **DNS Policy & NAT Gateway** — Zone management, upstream servers, domain blocking, plus SNAT/DNAT/hairpin NAT gateways. — _Own DNS and egress routing for every tenant network._
  - **How:** DNS zones/upstreams/blocking + SNAT/DNAT/hairpin via the DNS and `/api/networkd/...` REST endpoints (`POST /api/networkd/port-forwards`, `POST /api/networkd/dhcp`) · Web Network Security → DNS / NAT tabs.
- **Packet Mirror & Net Monitor** — Mirror sessions for traffic capture and per-VM bandwidth tracking with threshold alerts. — _Debug and meter network behavior without leaving the fabric._
  - **How:** Mirror sessions via the mirror REST endpoints; per-VM bandwidth via `GET /api/network-metrics/:vm` with threshold alerts · Web Network Security → Mirror / Monitor tabs · TUI Net Security.

## 4. Security & Identity

_JWT auth, enterprise SSO, RBAC, multi-tenancy, and encryption on every endpoint._

- **JWT Auth + RBAC** — JWT authentication with configurable expiry and 3-tier RBAC (Admin/User/Viewer) enforced on every endpoint. — _Least-privilege access is the default, not an add-on._
  - **How:** `POST /api/auth/login` returns a bearer JWT (`auth.token_expiration_hours`, default 24); roles admin/user/viewer are enforced per endpoint · Web login form · CLI/SDK send the token in `Authorization`.
- **Enterprise SSO** — LDAP and OIDC/OAuth2 integration plus API keys for service-to-service auth. — _Plug into existing identity providers instead of a new user silo._
  - **How:** Configure LDAP/OIDC in `vmspawnd.toml` `[auth]`; issue API keys for service-to-service calls · Web Administration → users/roles.
- **Multi-Tenancy** — Project isolation with member roles and per-project quotas. — _Give teams their own bounded slice of the fabric._
  - **How:** Projects with member roles and per-project quotas via the tenant/project REST endpoints · Web Quotas + Administration pages.
- **Encryption & Secrets** — Encryption at rest, per-VM disk encryption with key rotation, and an encrypted secrets store with access policies. — _Protect data and credentials without external KMS scaffolding._
  - **How:** Encrypted secrets store via `GET/POST/PUT/DELETE /api/secrets` (values always redacted in responses); per-VM disk encryption + key rotation · Web Administration → encryption keys.
- **Audit Logging** — Audit trail on all VM lifecycle operations with JSON/CSV export. — _Answer 'who did what, when' for compliance and RCA._
  - **How:** Audit trail via `GET /api/audit/logs` with JSON/CSV export · Web Audit page (filter by user/action/resource/time) · TUI Logs view.
- **PKI & Certificate Manager** — CA creation, certificate issue/renew/revoke, automated rotation, and hardware attestation. — _Run internal TLS without a separate PKI product._
  - **How:** CA create + cert issue/renew/revoke + rotation via the certificate REST endpoints; `./vmspawnctl tls` generates the web-server cert · Web Administration → certificates.
- **Compliance Scanning** — Built-in CIS, STIG, and PCI-DSS profiles with per-VM findings and remediation guidance. — _Prove and improve posture against recognized benchmarks._
  - **How:** REST `GET /api/compliance/profiles`, `POST /api/compliance/scan/:vm` (`profile_id` cis-level1/cis-level2/stig/pci-dss/hipaa), `GET /api/compliance/results` · Web Compliance page · `[compliance]` config enables auto-scan.

> The codebase carries a documented multi-round security audit: zero unsafe Rust, no shell pipelines, parameterized queries, SSRF and path-traversal protection, and bcrypt-hashed credentials.

## 5. High Availability & Disaster Recovery

_Clustering, live migration, fault tolerance, and multi-site recovery._

- **etcd Clustering** — Multi-node clustering on an etcd state store with leader election and heartbeat-based health. — _No single control-plane node to take the fleet down with it._
  - **How:** Set `[controller] enabled=true, mode="controller"` in `vmspawnd.toml` (etcd-backed state, leader election, heartbeat health) · cluster status via the cluster REST endpoints · Web Administration → datacenter.
- **Live Migration** — Move running VMs between hosts with iterative rsync pre-copy and cutover, with progress tracking and cancel. — _Drain a host for maintenance without stopping workloads._
  - **How:** Migrate a running VM between hosts (iterative rsync pre-copy + cutover) via the migration REST endpoints with progress/cancel · Web Site Operations.
- **Fault Tolerance & Fencing** — Continuous VM replication with automatic failover detection, fencing, and FT metrics. — _Survive a node loss with minimal recovery time._
  - **How:** Continuous replication + automatic failover detection + fencing via the fault-tolerance REST endpoints (FT metrics exposed) · Web Site Operations → Fault tolerance.
- **Predictive DRS** — Distributed resource scheduling with demand forecasting, proactive placement, and affinity/anti-affinity rules. — _Keep clusters balanced before hotspots become outages._
  - **How:** DRS with demand forecasting + affinity/anti-affinity rules via the DRS REST endpoints · Web Site Operations → DRS configuration & recommendations.
- **Site Recovery** — Recovery plans with planned migration, disaster failover, test failover, and reprotection workflows. — _Rehearse and execute cross-site DR with confidence._
  - **How:** Build recovery plans (planned migration, disaster/test failover, reprotect) via the site-recovery REST endpoints · Web Site Operations → Site recovery.
- **Multi-Site Replication** — Cross-site VM replication with sync scheduling, RPO monitoring, and recovery instances. — _Meet recovery-point targets you can actually measure._
  - **How:** Cross-site VM replication with sync scheduling + RPO monitoring + recovery instances via the replication REST endpoints · Web Site Operations.

## 6. Compute, GPU & Virtualization

_Low-level control over CPU topology, memory, accelerators, and firmware._

- **GPU Passthrough** — First-class GPU passthrough for NVIDIA, AMD, and Intel GVT-g on Linux KVM. — _Run AI, rendering, and CAD workloads at near-bare-metal speed._
  - **How:** Attach host PCI/GPU devices via the Web VM detail Devices tab and the device-passthrough REST endpoints (NVIDIA/AMD/Intel GVT-g); requires matching IOMMU/hardware.
- **CPU Pinning & NUMA** — CPU topology control, pinning, NUMA-aware placement, and nested virtualization. — _Squeeze predictable performance from latency-sensitive VMs._
  - **How:** REST `GET /api/system/numa-topology`, placement hint `GET /api/system/numa/placement`, and `POST /api/system/vms/:name/cpu-pinning` (Auto/NumaNode/Socket/Explicit) · Web VM advanced CPU settings.
- **Memory Optimization** — Memory ballooning, hugepages, and KSM page deduplication via a system resource manager. — _Fit more VMs per host without starving any of them._
  - **How:** REST `POST /api/system/vms/:name/memory-ballooning`, `/memory-limit`, and `POST /api/system/hugepages/allocate`; KSM handled by the resource manager · Web VM settings.
- **vTPM & Secure Boot** — TPM 1.2/2.0 via swtpm with per-VM isolated state, UEFI, and Secure Boot firmware management. — _Support BitLocker, LUKS, and measured boot inside guests._
  - **How:** Pass `tpm: true` / `secure_boot` in VMStartOptions on `POST /api/vms/:name/start` (swtpm gives each VM isolated state) · Web VM Create advanced boot/display settings · requires swtpm on the host.
- **cloud-init Provisioning** — NoCloud datasource generation for users, packages, network config, and SSH key injection. — _Boot fully configured VMs on first start, hands-free._
  - **How:** REST `POST /api/vms/:name/cloud-init` (users, packages, runcmd, write_files → NoCloud ISO) · Web VM detail Cloud-init tab · applied on next start/restart.
- **OVA/OVF & Content Library** — OVA/OVF export and import plus a content library with cross-site image/template sync and customization specs. — _Standardize and share golden images across every site._
  - **How:** Export via `POST /api/vms/:name/export` (OVA) and import to bring appliances in; cross-site sync + customization specs in the Content Library · Web Content Library page.

## 7. Monitoring, Automation & Operations

_Metrics, scheduling, notifications, and self-checks that keep the fabric healthy._

- **Prometheus Metrics** — A /metrics endpoint exposing per-VM CPU, memory, disk, and network stats plus API latency, with a prebuilt Grafana dashboard. — _Drop into your existing observability stack instantly._
  - **How:** Scrape `GET /metrics` (no auth) into Prometheus; per-VM detail via `GET /api/vms/:name/metrics` · Web Monitoring page · import the bundled Grafana dashboard.
- **Scheduling & Auto Backups** — Once/daily/weekly VM schedules plus automated daily backups and weekly state-store cleanup via systemd timers. — _Routine operations run themselves, on time, every time._
  - **How:** Once/daily/weekly schedules via the schedule REST endpoints (backed by systemd timers) · Web Scheduling page (cron-style + one-time, with execution history).
- **Backup & Restore** — Per-VM and bulk backups with retention policies and incremental backups from web UI and TUI. — _Recover a single VM or the whole fleet on your own terms._
  - **How:** REST `POST /api/backups` (full/incremental + retention), `POST /api/backups/restore`, policies via `POST /api/backups/policies` · Web Backups page (bulk) · TUI.
- **Multi-Channel Notifications** — Email, Slack, Microsoft Teams, and webhook alerts with retry and backoff. — _The right people hear about problems the moment they happen._
  - **How:** REST `POST /api/notifications/channels` (email/slack/webhook/teams) + `/rules`, verify with `POST .../channels/:id/test` · Web Notifications page · exponential-backoff retry (max 10 attempts).
- **Health & Auto-Verify** — Deep health checks (API, disk, DB, timers, KVM) and post-install smoke tests of API, auth, VM CRUD, and backups. — _Catch a broken deploy before your users do._
  - **How:** Run `./vmspawnctl health` (API/disk/DB/timers/KVM) and `./vmspawnctl verify` (post-install smoke tests of API, auth, VM CRUD, backups) · health also exposed over REST.
- **Config Snapshots & Events** — Versioned config-snapshot API, retained lifecycle events, and an SSE event stream for time-machine correlation. — _Diff infrastructure over time and reconstruct incidents._
  - **How:** Versioned config-snapshot REST API + recent events `GET /api/events` and live SSE `GET /api/events/stream` (created/started/stopped/migrated/error/…) · Web activity feed.

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
  - **How:** Install the `vmctl` binary and point it at the daemon: `vmctl vm list`, `vmctl vm create --name web-01 --cpus 2 --memory 4G`, `vmctl apply -f config.yaml`, with `--output json|yaml|table`.
- **vmctl-tui** — k9s-style ratatui terminal dashboard with vim keybindings, sparklines, and live per-VM actions. — _Fleet control from a terminal, no browser required._
  - **How:** Run `vmctl-tui` (optionally `--url http://: --refresh-interval N`); 8 views, vim navigation, per-VM `s`/`t`/`r`/`d`, bulk select with `v`/`Space`.
- **Web Dashboard** — React web UI with 37+ pages, a Ctrl+K command palette, dark theme, live WebSocket updates, and bulk operations. — _Give operators a full GUI without giving up the API._
  - **How:** Browse to https://localhost:8443 and log in as `admin`; `Ctrl+K` command palette, 37+ pages, bulk ops, and live WebSocket/SSE updates — served by the daemon itself.
- **Console & VNC** — Browser terminal via xterm.js over WebSocket and graphical VNC via a noVNC proxy, authenticated with the same JWT. — _Reach any VM's console without exposing raw ports._
  - **How:** Web VM Console (xterm.js) / VNC (noVNC) buttons · WebSocket `ws:///api/vms/:name/console?token=` (also `/ws/vnc/:name`) · `websocat` from the CLI.
- **Kubernetes Operator** — Manage VMs as VirtualMachine CRDs with continuous reconciliation via a Helm-installable operator. — _Define VMs alongside containers in the same GitOps flow._
  - **How:** Install the Helm-packaged operator, then declare `VirtualMachine` CRDs; the operator continuously reconciles them against the Fabric API.
- **Terraform, SDK & Ansible** — A Terraform provider with full plan/apply, a typed Rust vmspawn-sdk, plus Python and Ansible SDKs. — _Provision the fabric from whatever IaC tooling your team already uses._
  - **How:** Use the Terraform provider (`terraform plan` / `apply`), the typed Rust `vmspawn-sdk`, or the Python / Ansible SDKs — all target the same REST API.

## 9. Fleet, Cost & Governance

_Datacenter hierarchy, resource pools, chargeback, and lifecycle compliance at scale._

- **Datacenter Hierarchy** — Model datacenters, clusters, and hosts with registration, heartbeat, maintenance mode, and auto-discovery. — _Organize sprawling infrastructure into a navigable topology._
  - **How:** Register datacenters/clusters/hosts (heartbeat, maintenance mode, auto-discovery) via the datacenter REST endpoints · Web Administration → datacenter / hosts.
- **Resource Pools & Quotas** — CPU/memory/storage reservations with admission control, overcommit ratios, and pool-level quotas. — _Guarantee capacity to teams while preventing runaway usage._
  - **How:** Pool reservations + overcommit ratios + admission control via the resource-pool/quota REST endpoints · Web Quotas page (usage-vs-limit visualization).
- **Billing & Chargeback** — Per-VM metering, configurable pricing tiers, invoice generation, and chargeback reports. — _Show every team the true cost of what they run._
  - **How:** REST `GET/PUT /api/billing/pricing`, `GET /api/billing/usage`, `POST /api/billing/invoice/:tenant_id` · Web Monitoring/Analytics · rates set in `[billing]` config.
- **Lifecycle Manager** — Host baseline definitions, compliance scanning, remediation, and rolling updates with pause/advance. — _Keep every host on a known-good, patched baseline._
  - **How:** Define host baselines and run remediation + rolling updates (pause/advance) via the lifecycle REST endpoints · Web Administration → lifecycle.
- **Distributed Storage Policies** — Datastore clusters, storage policies, SDRS recommendations, and compliance checking. — _Enforce storage placement rules automatically across pools._
  - **How:** Define datastore clusters + storage policies and act on SDRS recommendations via the storage-policy REST endpoints · Web Storage policies page.

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
