<div align="center">

# Zyvor Fabric

### Private cloud control plane for Linux — VMs, networking, storage, and security from one daemon.

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/zyvorai/fabric/actions/workflows/ci.yml/badge.svg)](https://github.com/zyvorai/fabric/actions/workflows/ci.yml)
[![Rust](https://img.shields.io/badge/rust-%23000000.svg?logo=rust&logoColor=white)](backend/)
[![Kubernetes](https://img.shields.io/badge/kubernetes-ready-326CE5?logo=kubernetes&logoColor=white)](docs/KUBERNETES.md)
[![Built on FluxVM](https://img.shields.io/badge/VM%20engine-FluxVM-8a2be2)](https://github.com/zyvorai/fluxvm)
[![Built on GuestKit](https://img.shields.io/badge/guest%20tooling-GuestKit-2ea44f)](https://github.com/zyvorai/guestkit)

[Quick start](#quick-start) · [Deploy](#deploy) · [Kubernetes](#run-on-kubernetes) · [Why Fabric](#why-zyvor-fabric) · [Architecture](#built-on-fluxvm--guestkit) · [Network Fabric](#network-fabric-architecture-how-it-works) · [Ahead of other VMMs](#why-fabric--network-fabric-is-ahead-of-other-vmms) · [Docs](#documentation)

</div>

---

Run enterprise-grade virtual machines, software-defined networking, pluggable storage, and security policy on **any Linux server with KVM** — no vCenter, no heavyweight hypervisor stack, no systemd hard-requirement. One Rust daemon exposes **480+ REST endpoints** and live WebSocket channels; drive it from a **CLI, web dashboard, Kubernetes operator, or Terraform provider** — all four talk to the same daemon, so nothing drifts.

Zyvor Fabric doesn't implement VM execution itself. It's the orchestration, API, auth, and UX layer on top of two independent sibling projects — [FluxVM](https://github.com/zyvorai/fluxvm) (VM engine) and [GuestKit](https://github.com/zyvorai/guestkit) (offline disk tooling).

**Naming:** product is **Zyvor Fabric**; daemon/unit/paths stay `zyvor-fabricd`. Canonical repo: [zyvorai/fabric](https://github.com/zyvorai/fabric). See [docs/NAMING.md](docs/NAMING.md) and [docs/POSITIONING.md](docs/POSITIONING.md).

### Feature guides

- **[User Feature Guide](docs/zyvor-fabric-user-feature-guide.md)** — **55 features** across **9 areas** (also [PDF](docs/zyvor-fabric-user-feature-guide.pdf))
- **[User manual](docs/user/README.md)** — every console surface, page by page

---

## Quick start

```bash
git clone https://github.com/zyvorai/fabric.git && cd fabric
make build && sudo make install

# Start the daemon (systemd optional)
sudo zyvor-fabricd
# or: sudo systemctl enable --now zyvor-fabricd

# CLI
zyvorctl list
zyvorctl create web-01 --image fedora-41 --cpus 2 --memory 4096 --tenant acme

# Web UI → https://localhost:9095  (console at /app; Create VM has optional Tenant)
```

| Goal | Path |
|------|------|
| Local eval with containers | `make docker-up` → [docs/DOCKER.md](docs/DOCKER.md) |
| Bare-metal remote host | `./scripts/deploy remote USER@HOST` |
| **Kubernetes (k3s lab / Helm)** | [`./scripts/deploy k8s USER@HOST`](#run-on-kubernetes) → [docs/KUBERNETES.md](docs/KUBERNETES.md) |
| Declarative VMs | `zyvorctl apply -f config.yaml` |
| Terraform | [terraform-provider/](terraform-provider/) |
| K8s operator (CRDs → API) | [operator/](operator/) |
| Ansible | [ansible/](ansible/) |
| Dev on a laptop | [QUICKSTART.md](QUICKSTART.md) |

Default ports: **9095** (API + UI), **7788** (FluxVM on localhost).

Verify after start:

```bash
curl -sf http://127.0.0.1:9095/health
curl -sf http://127.0.0.1:9095/readyz | jq '{ok, store, fluxvm_ok: .fluxvm.ok}'
curl -sf http://127.0.0.1:7788/readyz | jq .
# Multi-tenant: zyvorctl create … --tenant acme; JWT tenant claim scopes list/get/mutate
# When FluxVM auth is on: set driver.fluxvm_token in zyvor-fabricd.toml
```

---

## Deploy

Four first-class ways to run Fabric. Pick one:

```text
┌─────────────────┬──────────────────┬──────────────────┬─────────────────┐
│  Bare metal     │  Docker/Podman   │  Kubernetes      │  Operator only  │
│  systemd/binary │  compose         │  DaemonSets      │  CRDs → API     │
├─────────────────┼──────────────────┼──────────────────┼─────────────────┤
│  Production     │  Local eval      │  Lab k3s /       │  GitOps VMs     │
│  hosts          │                  │  in-cluster CP   │  against fabricd│
└─────────────────┴──────────────────┴──────────────────┴─────────────────┘
```

### Bare metal (systemd)

```bash
./scripts/deploy remote sus@HOST
./scripts/deploy remote sus@HOST --quick    # skip OS deps
./scripts/deploy check sus@HOST
```

Installs `zyvor-fabricd` + web UI, opens `0.0.0.0:9095` (HTTPS, self-signed by default). Admin password is generated on deploy unless you set `FABRIC_ADMIN_PASSWORD` / `ZYVOR_FABRICD_ADMIN_PASSWORD`, or `FABRIC_LAB_DEFAULTS=1` for convenient lab default `Admin@321`. Retrieve: `sudo cat /var/lib/zyvor-fabricd/.admin_password`. Reseed with `FORCE_ADMIN_RESET=1 ./scripts/deploy remote USER@HOST --quick`.

### Docker / Podman

```bash
./scripts/build-container-images.sh   # needs ../FluxVM + ../guestkit
make docker-up                        # hostNetwork + /dev/kvm
# → http://localhost:9095   admin / eval-admin-only
```

See [docs/DOCKER.md](docs/DOCKER.md) for host prerequisites (`nbd`, KVM, rootful engine, cgroup v2).

---

## Run on Kubernetes

Fabric on Kubernetes uses the same **lab packaging pattern as Ragnarok** (manifests, Helm, remote `k3s ctr import`), but workloads are **privileged `hostNetwork` DaemonSets** — required for nftables, KVM, and FluxVM on `127.0.0.1:7788` (same model as compose).

> Full guide: **[docs/KUBERNETES.md](docs/KUBERNETES.md)**

### Lab remote (recommended)

```bash
# First time: build images on the node, import into k3s, apply manifests
./scripts/deploy k8s sus@HOST

# Later: re-apply + rollout only
./scripts/deploy k8s sus@HOST --quick

# Remove
./scripts/deploy k8s sus@HOST --uninstall
```

| Surface | Port |
|---------|------|
| UI + API (NodePort) | **30095** |
| UI + API (hostNetwork) | **9095** |
| FluxVM | **7788** (node-local) |

Open `http://HOST:30095/` after deploy. **Login:** `admin` + password from Secret `zyvor-fabric-secrets` (generated unless `FABRIC_ADMIN_PASSWORD` or `FABRIC_LAB_DEFAULTS=1`). Retrieve: `kubectl -n zyvor-fabric get secret zyvor-fabric-secrets -o jsonpath='{.data.admin-password}' | base64 -d; echo`.

### Local kubectl / Helm

```bash
# Manifests (images must be visible to the cluster)
make k8s-deploy
# or: BUILD_IMAGES=true ./scripts/deploy-k8s.sh

# Helm
helm upgrade --install zyvor-fabric ./charts/zyvor-fabric \
  --namespace zyvor-fabric --create-namespace \
  --set security.adminPassword='...' \
  --set security.jwtSecret="$(openssl rand -base64 32)"
```

### Platform chart vs operator

| Piece | What it does |
|-------|----------------|
| **`charts/zyvor-fabric`** / `k8s/base/` | Runs **fabricd + FluxVM** in the cluster |
| **`operator/charts/zyvor-fabricd-operator`** | Watches `VirtualMachine` CRs and calls an **already-running** fabricd API |

Point the operator at NodePort or the node IP (`ZYVOR_FABRICD_URL=http://NODE_IP:30095`). Do not expect ClusterIP DNS to replace `hostNetwork` across nodes.

### Requirements (K8s)

- Node with `/dev/kvm`
- Namespace PSS **privileged** (cannot run restricted)
- Rootful `podman` or `docker` on the build host for image builds
- Optional: sibling checkouts `../FluxVM` and `../guestkit` for the FluxVM image

---

## Why Zyvor Fabric

| Problem | Zyvor Fabric answer |
|---------|---------------------|
| Private cloud usually means a heavy hypervisor stack | A lightweight, disposable VM engine underneath ([FluxVM](https://github.com/zyvorai/fluxvm)) — no systemd dependency, no vCenter |
| No unified API across interfaces | 480+ REST endpoints and 3 WebSocket channels, one daemon, four front doors |
| Scripting vs. GUI is usually either/or | CLI (`zyvorctl`) + web console + Terraform + Kubernetes operator, all first-class |
| Enterprise needs RBAC, audit, and encryption | JWT auth, roles, audit export, encryption at rest |
| GPU passthrough is bolted on elsewhere | Generic PCI/VFIO passthrough REST API on Linux KVM |
| Guest images ship without your tooling | Offline image customization via [GuestKit](https://github.com/zyvorai/guestkit) |

---

## Built on FluxVM + GuestKit

Zyvor Fabric is a thin, opinionated layer. It doesn't own a hypervisor or a guest-filesystem library — it composes two sibling projects:

### [FluxVM](https://github.com/zyvorai/fluxvm) — the VM engine

`zyvor-fabricd` never touches QEMU directly. It talks to a local FluxVM instance over REST (`127.0.0.1:7788`) for VM process lifecycle, disks, console/VNC, cgroups, and per-VM network namespaces. Backends (QEMU, Cloud Hypervisor, Firecracker) are an FluxVM-side concern.

### [GuestKit](https://github.com/zyvorai/guestkit) — guest-side tooling

Before first boot, FluxVM uses GuestKit to reach inside disk images (NBD mount, chroot customize, bake in `fluxvm-guest-agent`) without a libguestfs appliance VM.

```mermaid
flowchart TB
  subgraph Interfaces
    CLI[zyvorctl CLI]
    Web[Web console]
    TF[Terraform provider]
    Op[Kubernetes operator]
  end
  CLI --> Daemon
  Web --> Daemon
  TF --> Daemon
  Op --> Daemon

  Daemon[Zyvor Fabric daemon<br/>API · auth · RBAC · networking · storage · monitoring]
  Daemon -- REST :7788 --> Flux[FluxVM<br/>VM lifecycle · QEMU / CH / Firecracker]
  Flux -- library call --> GK[GuestKit<br/>offline mount · chroot · agent bake-in]
  Flux -- vsock --> Agent[fluxvm-guest-agent<br/>inside the running guest]
  Daemon -- "/api/vms/name/dataplane/*" --> Flux
  Flux -- TC eBPF --> Edge[VM edge dataplane<br/>Network Fabric schema v4]
```

**Fabric decides what should exist; FluxVM makes it exist; GuestKit prepares the disk.** Each layer is independently useful and Apache-2.0 licensed.

---

## Network Fabric architecture (how it works)

Fabric exposes FluxVM **Network Fabric schema v4** (TC/eBPF VM-edge dataplane) as first-class API, CLI, and UI — while keeping Fabric's own host SDN separate. Operator guide: [docs/guides/vm-drivers/fluxvm-dataplane.md](docs/guides/vm-drivers/fluxvm-dataplane.md). Kernel program source of truth: [FluxVM Network Fabric](https://github.com/zyvorai/fluxvm#network-fabric-architecture-how-it-works).

### Two policy planes (do not conflate)

| Plane | Owns | API / UX |
|-------|------|----------|
| **Fabric SDN** | Host isolation (label → nftables) | `/api/network-policies` · Security → Network Policies |
| **VM edge (Network Fabric schema v4)** | Per-VM allowlists, Mbps/PPS, stats/flows on the TAP/netns edge | `/api/vms/{name}/dataplane/*` · VM → **Dataplane** tab · `zyvorctl dataplane …` |
| **Service Fabric v6** (BPF schema 4 / gen 6) | Maglev VIP LB + EDT/FluxScope/host-routing + leases + HA deltas + identity/L7 policy | `/api/dataplane/services…` · Edge Dataplane → **Services** · [docs/ebpf-service-fabric.md](docs/ebpf-service-fabric.md) |

```mermaid
flowchart LR
  UI[Web / zyvorctl / Terraform]
  Fabricd[zyvor-fabricd]
  Client[fluxvm-client]
  FluxVM["fluxvm serve"]
  TC[TC eBPF VM edge]
  SDN[Fabric network-policies nftables]

  UI --> Fabricd
  Fabricd -->|"/api/vms/name/dataplane/*"| Client
  Client -->|"/v1/vms/id/network/*"| FluxVM
  FluxVM --> TC
  Fabricd --> SDN
```

### Big picture (Fabric + FluxVM + kernel)

```mermaid
flowchart TB
  subgraph fabricCtrl [Fabric control plane]
    WebTab[VM Dataplane tab]
    Zctl[zyvorctl dataplane]
    FabAPI["/api/vms/name/dataplane\nstatus policy stats flows"]
    Driver[VmDataplaneDriver]
    FClient[fluxvm-client]
    WebTab --> FabAPI
    Zctl --> FabAPI
    FabAPI --> Driver --> FClient
  end

  subgraph fluxCtrl [FluxVM control plane]
    NetAPI["/v1/vms/id/network"]
    Sched[fluxvm-scheduler]
    DP[fluxvm-network dataplane]
    NetAPI --> Sched --> DP
  end

  subgraph durable [Durable + runtime state]
    PolJSON["/var/lib/fluxvm/network-policy/uuid.json"]
    Pins["/sys/fs/bpf/fluxvm/vms/uuid/\nprogs + maps"]
    Meta["/run/fluxvm/ebpf/vms/uuid/\niface prog_id schema fingerprint"]
  end

  subgraph guestPath [Guest packet path]
    Guest[Guest OS]
    TAP[TAP / macvtap / netns]
    HostEdge["Host-visible iface\nvh-star or tap"]
    TC["TC ingress\nfluxvm_egress"]
    HostRt[Host routing / Cilium / Fabric SDN]
    Guest --> TAP --> HostEdge --> TC --> HostRt
  end

  FClient --> NetAPI
  DP -->|configure maps before attach| Pins
  DP -->|fsync policy + fingerprint| PolJSON
  DP -->|ownership sidecars| Meta
  DP -->|tc filter add / reconfigure| TC
  Sched -->|reconcile heal + orphan GC| DP
```

### Namespaced TAP path (what Fabric bridged VMs use)

Fabric creates bridged VMs with `NetworkSpec::Tap { netns: true }`. The classifier attaches on the **host** veth (`vh-…`), not inside the guest:

```mermaid
flowchart LR
  VM[Guest]
  TapNs[TAP in netns]
  Br[netns bridge]
  VethNs[veth in netns]
  VethHost["host veth vh-id"]
  TcHook["TC ingress FluxVM eBPF"]
  Out[Host stack / Cilium / SDN]

  VM --> TapNs --> Br --> VethNs --> VethHost --> TcHook --> Out
```

Direct TAP/macvtap (non-netns) attaches on the host-visible TAP/macvtap itself.

### Packet decision inside the TC program

```mermaid
flowchart TD
  In[Packet on ingress] --> Look{fluxvm_id<br/>ifindex lookup}
  Look -->|miss| Pass[TC_ACT_OK / pass]
  Look -->|hit| Boot{ARP/DHCP/NDP/DHCPv6?}
  Boot -->|yes| Allow[allow + stats/flows]
  Boot -->|no| Fam{IPv4 or IPv6?}
  Fam -->|other| Def{default_allow?}
  Def -->|true| Allow
  Def -->|false| Drop[drop + stats/events]
  Fam -->|v4/v6| Cidr{enforce_cidr?}
  Cidr -->|yes| Lpm["LPM fluxvm_v4 / fluxvm_v6"]
  Lpm -->|miss| Drop
  Lpm -->|hit| L4
  Cidr -->|no| L4{enforce_l4?}
  L4 -->|yes| Port["fluxvm_l4 proto+port"]
  Port -->|miss| Drop
  Port -->|hit| Rate
  L4 -->|no| Rate{Mbps/PPS set?}
  Rate -->|yes| Win["fluxvm_rate fixed 1s window"]
  Win -->|over| Drop
  Win -->|ok| Allow
  Rate -->|no| Allow
```

### Control-plane lifecycle (through Fabric)

```mermaid
sequenceDiagram
  participant Op as Operator Web or CLI
  participant Fab as zyvor-fabricd
  participant Fv as FluxVM scheduler
  participant Dp as dataplane eBPF
  participant Kern as Kernel TC maps

  Op->>Fab: create or start bridged VM
  Fab->>Fv: POST v1 vms Tap netns true
  Fv->>Dp: apply_sandbox_policy
  Dp->>Kern: load and pin prog maps
  Dp->>Kern: write fluxvm_id CIDR L4 rate maps
  Dp->>Kern: tc filter add after maps ready
  Dp->>Dp: write run meta and fingerprint

  Op->>Fab: POST dataplane policy
  Fab->>Fv: POST network policy
  Fv->>Dp: reconfigure_sandbox_policy
  Dp->>Kern: deny-all on iface
  Dp->>Kern: replace CIDR L4 rate maps
  Dp->>Kern: publish final iface config
  Note over Dp,Kern: Brief over-deny window only never allow-all

  Op->>Fab: GET dataplane status stats flows
  Fab->>Fv: GET network status stats flows
  Fv-->>Fab: JSON
  Fab-->>Op: same shape

  Fv->>Dp: reconcile tick
  alt needsRepair
    Dp->>Kern: ensure_sandbox_policy reload
  end
  Dp->>Dp: reconcile_orphan_pins for dead UUIDs
```

### Where state lives

| Location | Contents |
|----------|----------|
| Fabric API | Name-keyed proxy; resolves VM name → FluxVM UUID via `fluxvm-client` |
| `/sys/fs/bpf/fluxvm/vms/<uuid>/` | Pinned TC program + maps (`fluxvm_id`, `v4`, `v6`, `l4`, `rate`, `stats`, `flows`, `events`) |
| `/run/fluxvm/ebpf/vms/<uuid>/` | `iface`, `prog_id`, `schema_version`, `policy_fingerprint` (not on bpffs) |
| `/run/fluxvm/xdp/` | Optional XDP `iface` + `prog_id` |
| `/var/lib/fluxvm/network-policy/<uuid>.json` | Durable per-VM policy (fsync + rename) |

### Modes vs ownership

```mermaid
flowchart TB
  Mode{sandbox.dataplane.mode}
  Mode -->|legacy| Nft[nftables only]
  Mode -->|ebpf| Edge[FluxVM TC on VM edge]
  Mode -->|cilium| Check[Require cilium.sock + bpffs]
  Check --> Edge
  Edge --> Own["Pins only under /sys/fs/bpf/fluxvm\nnever Cilium private maps"]
  Xdp[Optional XDP on uplink]
  Edge -.->|refused when cilium| Xdp
  FabSDN[Fabric /network-policies]
  FabSDN -.->|independent host SDN| HostNft[host nftables]
```

### REST surface (Fabric ↔ FluxVM)

| Fabric | FluxVM | Role |
|--------|--------|------|
| `GET …/dataplane/status` | `GET …/network/status` | mode, attached, schema_version, policy_synced, iface |
| `GET/POST …/dataplane/policy` | `GET/POST …/network/policy` | Read / replace durable policy (+ live map update) |
| `GET …/dataplane/stats` | `GET …/network/stats` | allow/drop packet + byte counters |
| `GET …/dataplane/flows?limit=` | `GET …/network/flows?limit=` | LRU flows with `family` 4/6 |

```bash
zyvorctl dataplane status <name>
zyvorctl dataplane policy get|set <name> [--file policy.json]
zyvorctl dataplane stats <name>
zyvorctl dataplane flows <name> [--limit 100]
```

HTTPS labs: `export ZYVOR_FABRIC_URL=https://127.0.0.1:9095` and `export ZYVOR_FABRIC_TOKEN=<jwt>` (from `/api/auth/login`).

### Enable packaging

Ship [`configs/fluxvm-dataplane.toml`](configs/fluxvm-dataplane.toml) (`mode = "ebpf"`). Compose/k8s mount it as `/etc/fluxvm.toml`, mount host `/sys/fs/bpf`, and raise memlock (`SYS_RESOURCE` / `ulimit memlock=-1`). Image must include `/usr/lib/fluxvm/bpf/fluxvm_tc.bpf.o`. After first green attach (`schema_version=4`, `attached=true`), set `required = true` for fail-closed production.

### Why Fabric + Network Fabric is ahead of other VMMs

Most hypervisor stacks still treat VM egress as **host netfilter theater**: libvirt/iptables chains, a shared bridge + firewall, or QEMU user-mode NAT. Fabric puts **operator UX (API · Web · CLI)** on top of FluxVM's **TC/eBPF VM-edge dataplane**, so policy, rate limits, and telemetry are first-class — not afterthought scripts.

```mermaid
flowchart LR
  subgraph traditional [Traditional VMM path]
    TGuest[Guest] --> TTap[TAP / bridge]
    TTap --> TNft[iptables / nft / virbr0]
    TNft --> TOut[Host / WAN]
  end

  subgraph fabricPath [Fabric + FluxVM Network Fabric schema v4]
    FGuest[Guest] --> FTap[TAP / netns veth]
    FTap --> FEbpf["TC eBPF on VM edge\nLPM · L4 · Mbps/PPS · flows"]
    FEbpf --> FOut[Host / Cilium / Fabric SDN]
    UX[Web Dataplane tab · zyvorctl · REST] -.->|live map rewrite| FEbpf
  end
```

```mermaid
quadrantChart
    title Control-plane maturity vs packet-path speed
    x-axis Slow / rebuild-heavy --> Fast / in-kernel maps
    y-axis Scripted / host-only --> API + UI + telemetry
    quadrant-1 Ahead today
    quadrant-2 UX without speed
    quadrant-3 Legacy baseline
    quadrant-4 Fast but opaque
    Libvirt nft: [0.25, 0.30]
    Shared bridge FW: [0.35, 0.35]
    QEMU usernet: [0.15, 0.20]
    Cloud hypervisor raw: [0.55, 0.25]
    Firecracker CNI: [0.60, 0.40]
    Fabric plus Network Fabric schema v4: [0.88, 0.90]
```

| Capability | libvirt / virsh + nft | Shared bridge + host FW | QEMU user NAT | Typical microVM + CNI | **Fabric + Network Fabric schema v4** |
|---|---|---|---|---|---|
| Per-VM L3/L4 egress allowlists | Manual chains | Host-wide rules | Soft / limited | Pod-oriented | **First-class** `allow_cidrs` + `tcp\|udp/PORT` |
| Live policy without detach | Flush/reload gaps | Blast radius | Restart usernet | CNI reconcile | **In-place BPF map update** (~100–120 ms p50 in lab) |
| Mbps / PPS egress caps | Separate tc/htb | Rare | Soft | Depends on CNI | **Maps on the same classifier** |
| Dual-stack L3+L4 | Easy to drift | Often IPv4-only | Limited | Varies | **One TC program** |
| Per-VM stats + LRU flows via API | tcpdump / conntrack | Host-centric | Almost none | Sidecar / Hubble-ish | **`/dataplane/stats` + `/flows`** |
| Operator UX | virsh + shell | Same | Same | kubectl-heavy | **VM → Dataplane tab · `zyvorctl dataplane` · 4 REST verbs** |
| Host SDN still available | You build it | You build it | N/A | NetworkPolicy | **Fabric `/network-policies` orthogonal** |
| Cilium coexistence | iptables fights | Same | N/A | Native | **`mode=cilium` — FluxVM owns VM edge only** |

**Shipped in Fabric UX (all wired; lab UX verified):**

| Surface | Status · Policy · Stats · Flows |
|---------|----------------------------------|
| Web | VM details → **Dataplane** (presets, JSON, identity column, auto-refresh) |
| REST | `/api/vms/{name}/dataplane/{status,policy,stats,flows}` |
| CLI | `zyvorctl dataplane …` (`ZYVOR_FABRIC_URL` + `ZYVOR_FABRIC_TOKEN` for HTTPS labs) |
| Dashboard | **VM dataplane** capability card (`mode` / attached / schema) |

Operator guide (enablement, create-bridged recipe, troubleshooting, UX checklist):
[docs/guides/vm-drivers/fluxvm-dataplane.md](docs/guides/vm-drivers/fluxvm-dataplane.md).
User console: [docs/user/pages/infrastructure/dataplane.md](docs/user/pages/infrastructure/dataplane.md).

Kernel program SoT: [FluxVM — Why Network Fabric is faster](https://github.com/zyvorai/fluxvm#why-network-fabric-is-faster-than-traditional-vm-networking).

---

## Platform at a glance

| Metric | Value |
|--------|-------|
| Rust crates | 48 |
| REST endpoints | 480+ |
| LOC | ~87K (60K Rust + 27K TS) |
| Interfaces | 4 (CLI, Web, Operator, Terraform) + Fabric Doctor |
| Web pages | 80+ console routes + marketing |
| Deploy modes | Bare metal · Docker · Kubernetes · Operator |

---

## Documentation

| Goal | Document |
|------|----------|
| **Docs index** | [docs/README.md](docs/README.md) |
| **Naming / clone URL** | [docs/NAMING.md](docs/NAMING.md) |
| **Product positioning** | [docs/POSITIONING.md](docs/POSITIONING.md) |
| **Kubernetes deploy** | [docs/KUBERNETES.md](docs/KUBERNETES.md) |
| **Docker / Podman** | [docs/DOCKER.md](docs/DOCKER.md) |
| Quick start (dev) | [QUICKSTART.md](QUICKSTART.md) |
| Features | [FEATURES.md](FEATURES.md) |
| Architecture | [docs/architecture.md](docs/architecture.md) |
| Project stats (generated) | [docs/generated/project-stats.md](docs/generated/project-stats.md) |
| Governance / branch protection | [docs/GOVERNANCE.md](docs/GOVERNANCE.md) |
| OIDC / SSO | [docs/oidc.md](docs/oidc.md) |
| Security policy | [SECURITY.md](SECURITY.md) |
| **Fabric Doctor (preflight)** | [docs/FABRIC_DOCTOR.md](docs/FABRIC_DOCTOR.md) · [tools/fabric-doctor](tools/fabric-doctor/) |
| FluxVM driver | [docs/guides/vm-drivers/fluxvm.md](docs/guides/vm-drivers/fluxvm.md) |
| **VM edge dataplane (Network Fabric schema v4)** | [docs/guides/vm-drivers/fluxvm-dataplane.md](docs/guides/vm-drivers/fluxvm-dataplane.md) |
| **Service Fabric v6 (Maglev VIP LB)** | [docs/ebpf-service-fabric.md](docs/ebpf-service-fabric.md) |
| Networking (SDN + modes) | [docs/networking.md](docs/networking.md) |
| Web UX | [docs/web-ui.md](docs/web-ui.md) |
| User stories | [docs/USER_STORIES.md](docs/USER_STORIES.md) |
| SCIM identity | [docs/scim-identity.md](docs/scim-identity.md) |
| OpenStack compatibility | [docs/openstack-compat.md](docs/openstack-compat.md) · [Tutorial](docs/tutorials/08-openstack-clients.md) |
| Host maintenance | [docs/host-lifecycle.md](docs/host-lifecycle.md) |
| User manuals | [docs/user/README.md](docs/user/README.md) |
| Full catalog | [docs/index.md](docs/index.md) |
| Integrations | [integrations/](integrations/) |
| Operator | [operator/README.md](operator/README.md) |

---

## Zyvor platform stack

| Product | Role |
|---------|------|
| **[FluxVM](https://github.com/zyvorai/fluxvm)** | Disposable compute engine — QEMU / Cloud Hypervisor / Firecracker |
| **[GuestKit](https://github.com/zyvorai/guestkit)** | Offline VM disk inspection, repair, and customization |
| **hypercluster** | Bare-metal Kubernetes bootstrap |
| **machina** | Physical hypervisor OS (libvirt/KVM) |
| **zeus-os** | Cloud / KubeVirt control plane |
| **hermes** | Application layer for Kubernetes |
| **forge** | AI infrastructure on Kubernetes |
| **hypersdk / hyper2kvm** | Multi-cloud VM migration |
| **packetwolf** | Kernel-native network intelligence |
| **Axiom** | k8s-native private cloud control plane |
| **Ragnarok** | AI-powered KubeVirt VM management |
| **Veyron** | KubeVirt VM command center |
| **IronWolf** | Metal3 bare-metal automation |
| **Zyvor Fabric** | Private cloud control plane on FluxVM (**this repo**) |

→ [zyvor.dev](https://zyvor.dev)

---

## Development

```bash
make build          # backend + web
make test           # Rust + web tests
make lint && make fmt
make helm-lint      # charts/zyvor-fabric
```

Historical build summaries in the repo root are snapshots — **`docs/` and this README are authoritative.**

---

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
