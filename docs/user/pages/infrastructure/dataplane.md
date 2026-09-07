# VM Dataplane (Network Fabric)

## Purpose

Per-VM **edge** security and telemetry powered by FluxVM Network Fabric schema v4
(TC/eBPF on the host-visible TAP/netns interface). Use this to allowlist
destinations and ports, cap egress Mbps/PPS, and inspect allow/drop counters
and sampled flows — without touching Fabric’s host SDN.

This is **not** the same as [Net Security](network-security.md) network policies
(label → host nftables).

## When to use it

- Lock down what a sandbox / CI / AI agent VM can reach on the network
- Apply a live deny or rate limit without restarting the guest
- Prove what left the box (stats + flows) without a packet capture tax
- Confirm eBPF is attached (`schema_version=4`) before turning `required=true`

## How to get there

- Route: `/app/vms/:name` → tab **Dataplane**
- Shortcut: VM → **Network** → **Open Dataplane**
- Dashboard: capability card **VM dataplane** (`/app`)
- Nav: open any running bridged VM from **Virtual Machines**

## Operate from the console (UX)

### Prerequisites

1. FluxVM running with `[sandbox.dataplane] mode = "ebpf"` (see operator guide).
2. VM created with **bridged / network tap** (`network_tap: true`) so a host
   veth exists for TC attach.
3. Write permission on VMs to change policy (read-only users can view).

### Status

Confirm **Attached = yes**, **Mode = ebpf**, **Schema version = 3**, policy
synced, and the **Active policy snapshot** (CIDRs, ports, Mbps/PPS).

### Policy

1. Use a preset (**Allow all** / **Deny all** / **Web egress**) or edit tags.
2. Ports must look like `tcp/443` or `udp/53` (UI validates).
3. Set optional **Max egress Mbps** / **PPS** and **Sample rate** (≥1 for flows).
4. Click **Save policy**. Changes apply live (brief over-deny possible; never
   an allow-all gap).

### Stats

View allow vs drop packet/byte counters and drop rate. Use **Refresh counters**.

### Flows

Inspect the LRU flow table: **Identity**, family, source/destination, ports,
protocol, verdict, packets, bytes, last seen. Adjust limit or enable
auto-refresh.

## Related pages

- [Network](network.md) — NAT / bridge / port forwards
- [Net Security](network-security.md) — host SDN (orthogonal)
- [Virtual Machines](../core/vms.md)
- Operator guide: [VM edge dataplane](../../../guides/vm-drivers/fluxvm-dataplane.md)
- [Page index](../../PAGE_INDEX.md)
