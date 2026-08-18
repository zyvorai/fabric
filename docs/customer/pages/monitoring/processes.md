# Processes

## Purpose

Processes — a live process monitor for the host: every OS process with its CPU and memory usage, refreshed every 3 seconds, with a per-process detail drill-down.

## When to use it

- Finding what's consuming CPU or memory on the host right now
- Spotting zombie or stopped processes, or an unexpectedly high process count
- Digging into a specific process's command line, I/O, open file descriptors, or context-switch activity

## How to get there

- Route / id: `/processes`
- Nav: **Monitoring → Processes** (sidebar, command palette, or desktop nav)

## What you can do

1. Summary cards show **Total Processes**, **Running**, and **Sleeping** counts.
2. Filter box matches by PID, process name, or state as you type.
3. The process table lists PID, name, CPU % (with a color bar — green under 20%, blue under 50%, amber under 80%, red at 80%+), memory in MB, a state badge (Running / Sleeping / Disk Wait / Zombie / Stopped), and thread count.
4. Click any row to open a **Process Detail** panel below the table — fetched per-PID — showing command line, IO read/write bytes, open file descriptors, and voluntary/involuntary context switches. **Close** collapses it.
5. The list auto-refreshes every 3 seconds; there's also a manual refresh button in the page header.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
