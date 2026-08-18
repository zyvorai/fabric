# System

## Purpose

System — the physical host's hardware topology (CPU sockets/cores/threads, NUMA nodes, hugepages) plus topology-aware optimization recommendations for individual VMs. This is distinct from [System Health](system-health.md), which tracks live utilization rather than hardware layout.

## When to use it

- To see the host's CPU socket/core/thread layout and NUMA node boundaries before pinning a VM's vCPUs
- To check how many hugepages (2MB/1GB) are allocated and free, or allocate more for a memory-intensive VM
- To review and apply topology-aware optimization recommendations (e.g. NUMA/CPU pinning) for a specific running VM

## How to get there

- Route / id: `/system`
- Nav: **Infrastructure → System** (sidebar, command palette, or desktop nav)

## What you can do

Four tabs — **CPU Topology, NUMA Topology, Memory & Hugepages, Optimization** (badged with the pending recommendation count) — plus stat cards for total CPUs (sockets × cores), NUMA node count, total/available memory, and 2MB hugepage total/free.

1. **CPU Topology** — CPUs grouped by socket, showing each CPU's online/offline status; hover a CPU for its core, thread, and NUMA node.
2. **NUMA Topology** — per-node CPU list, memory total/free with a usage bar, per-node hugepage counts, and an inter-node distance matrix.
3. **Memory & Hugepages** — system memory breakdown (total, available, usage bar, buffers, cached) plus 2MB and 1GB hugepage stats. **Allocate Hugepages** opens a dialog to pick a page size and count and apply it immediately.
4. **Optimization** — per-VM recommendations (resource, current → recommended value, reason, expected impact). **Apply** runs the recommended change against that VM right away.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
