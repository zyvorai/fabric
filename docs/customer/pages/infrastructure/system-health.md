# System Health

## Purpose

System Health — a live, read-only dashboard of host resource utilization, refreshing every 2 seconds: CPU, memory, disk I/O, filesystems, network interfaces, and top processes, rolled up into a single health score.

## When to use it

- To get a fast, single-number (0–100) read on whether the host is under stress
- To find out what's bottlenecking the host — CPU, memory, disk, or network — before adding more VMs to it
- To identify the specific process consuming the most CPU or memory
- To check filesystem usage or per-disk I/O latency and queue depth on the physical host

## How to get there

- Route / id: `/system-health`
- Nav: **Infrastructure → System Health** (sidebar, command palette, or desktop nav)

## What you can do

1. Health score gauge (0–100, colored red/amber/green) with a status label and a summary panel calling out the current bottleneck, if any.
2. **CPU** panel — overall usage, core count, 1-minute and 5-minute load averages, and a per-core usage grid.
3. **Memory** panel — RAM and swap usage bars with used/total detail, plus total, available, and cached memory.
4. **Filesystems** — a usage bar per mounted filesystem (mountpoint, filesystem type, used/total), shown when data is available.
5. **Disk I/O** — per-device reads/writes completed, bytes read/written, average latency, and queue depth.
6. **Network** — per-interface RX/TX bytes and error counts, TCP connection-state counts, and host-wide RX/TX/retransmit totals.
7. **Top CPU** and **Top Memory** process tables — PID, name, CPU%, and memory (MB).

Entirely read-only monitoring — there's no create/edit/delete action here; data refreshes automatically every 2 seconds.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
