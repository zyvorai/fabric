# Network Fabric architecture (how it works)

This is the deep technical dive into Fabric's VM-edge dataplane. For the short version, see [README.md — Architecture](../README.md#architecture-fluxvm--guestkit); for the operator guide (enablement, troubleshooting, UX checklist), see [docs/guides/vm-drivers/fluxvm-dataplane.md](guides/vm-drivers/fluxvm-dataplane.md).

Fabric exposes FluxVM **Network Fabric schema v4** (TC/eBPF VM-edge dataplane) as first-class API, CLI, and UI — while keeping Fabric's own host SDN separate. Kernel program source of truth: [FluxVM Network Fabric](https://github.com/zyvorai/fluxvm#network-fabric-architecture-how-it-works).

## Two policy planes (do not conflate)

| Plane | Owns | API / UX |
|-------|------|----------|
| **Fabric SDN** | Host isolation (label → nftables) | `/api/network-policies` · Security → Network Policies |
| **VM edge (Network Fabric schema v4)** | Per-VM allowlists, Mbps/PPS, stats/flows on the TAP/netns edge | `/api/vms/{name}/dataplane/*` · VM → **Dataplane** tab · `zyvorctl dataplane …` |
| **Service Fabric v6** (BPF schema 4 / gen 6) | Maglev VIP LB + EDT/FluxScope/host-routing + leases + HA deltas + identity/L7 policy | `/api/dataplane/services…` · Edge Dataplane → **Services** · [docs/ebpf-service-fabric.md](ebpf-service-fabric.md) |

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

## Big picture (Fabric + FluxVM + kernel)

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

## Namespaced TAP path (what Fabric bridged VMs use)

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

## Packet decision inside the TC program

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

## Control-plane lifecycle (through Fabric)

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

## Where state lives

| Location | Contents |
|----------|----------|
| Fabric API | Name-keyed proxy; resolves VM name → FluxVM UUID via `fluxvm-client` |
| `/sys/fs/bpf/fluxvm/vms/<uuid>/` | Pinned TC program + maps (`fluxvm_id`, `v4`, `v6`, `l4`, `rate`, `stats`, `flows`, `events`) |
| `/run/fluxvm/ebpf/vms/<uuid>/` | `iface`, `prog_id`, `schema_version`, `policy_fingerprint` (not on bpffs) |
| `/run/fluxvm/xdp/` | Optional XDP `iface` + `prog_id` |
| `/var/lib/fluxvm/network-policy/<uuid>.json` | Durable per-VM policy (fsync + rename) |

## Modes vs ownership

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

## REST surface (Fabric ↔ FluxVM)

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

## Enable packaging

Ship [`configs/fluxvm-dataplane.toml`](../configs/fluxvm-dataplane.toml) (`mode = "ebpf"`). Compose/k8s mount it as `/etc/fluxvm.toml`, mount host `/sys/fs/bpf`, and raise memlock (`SYS_RESOURCE` / `ulimit memlock=-1`). Image must include `/usr/lib/fluxvm/bpf/fluxvm_tc.bpf.o`. After first green attach (`schema_version=4`, `attached=true`), set `required = true` for fail-closed production.

## Why Fabric + Network Fabric is ahead of other VMMs

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
| Live policy without detach | Flush/reload gaps | Blast radius | Restart usernet | CNI reconcile | **In-place BPF map update** (~100–120 ms p50 in lab) |
| Mbps / PPS egress caps | Separate tc/htb | Rare | Soft | Depends on CNI | **Maps on the same classifier** |
| Dual-stack L3+L4 | Easy to drift | Often IPv4-only | Limited | Varies | **One TC program** |
| Per-VM stats + LRU flows via API | tcpdump / conntrack | Host-centric | Almost none | Sidecar / Hubble-ish | **`/dataplane/stats` + `/flows`** |
| Operator UX | virsh + shell | Same | Same | kubectl-heavy | **VM → Dataplane tab · `zyvorctl dataplane` · 4 REST verbs** |
| Host SDN still available | You build it | You build it | N/A | NetworkPolicy | **Fabric `/network-policies` orthogonal** |
| Cilium coexistence | iptables fights | Same | N/A | Native | **`mode=cilium` — FluxVM owns VM edge only** |

> The ~100–120ms p50 map-update figure above is a lab observation from the development environment, not a published benchmark with a documented methodology across hardware/kernel versions — treat it as indicative, not a guaranteed SLA.

**Shipped in Fabric UX (all wired; lab UX verified):**

| Surface | Status · Policy · Stats · Flows |
|---------|----------------------------------|
| Web | VM details → **Dataplane** (presets, JSON, identity column, auto-refresh) |
| REST | `/api/vms/{name}/dataplane/{status,policy,stats,flows}` |
| CLI | `zyvorctl dataplane …` (`ZYVOR_FABRIC_URL` + `ZYVOR_FABRIC_TOKEN` for HTTPS labs) |
| Dashboard | **VM dataplane** capability card (`mode` / attached / schema) |

Operator guide (enablement, create-bridged recipe, troubleshooting, UX checklist): [docs/guides/vm-drivers/fluxvm-dataplane.md](guides/vm-drivers/fluxvm-dataplane.md). User console: [docs/user/pages/infrastructure/dataplane.md](user/pages/infrastructure/dataplane.md).

Kernel program SoT: [FluxVM — Why Network Fabric is faster](https://github.com/zyvorai/fluxvm#why-network-fabric-is-faster-than-traditional-vm-networking).
