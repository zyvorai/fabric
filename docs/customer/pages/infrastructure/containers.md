# Containers

## Purpose

Containers — a read-only, auto-refreshing view of container workloads running on the host (Docker/Podman-style containers, distinct from VMs), showing per-container state, image, CPU/memory usage, and network I/O.

## When to use it

- To check whether container workloads on this host are running, restarting, or exited
- To spot a container consuming excessive CPU or memory before it starves VMs sharing the same host
- To confirm a container's network throughput (RX/TX)

## How to get there

- Route / id: `/app/containers`
- Nav: **Infrastructure → Containers** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. Review the summary cards: total containers, how many are running, total CPU%, and total memory across every container detected.
2. Scan the container grid — each card shows the container's name/ID, a state badge (running / exited / paused / restarting), its image, live CPU and memory usage bars, and RX/TX network counters when available.
3. Data refreshes automatically every 3 seconds; use the header refresh button to force an immediate reload.

This page is monitoring-only — there's no start/stop/restart or delete action for containers here.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
