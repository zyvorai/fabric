# Analytics

## Purpose

Performance Analytics — fleet-wide resource utilization, trends over time, and per-VM performance insights, with exportable reports.

## When to use it

- To check overall CPU/memory/disk/network utilization across the fleet
- To find which VMs are consuming the most CPU, memory, or network right now
- To review flagged performance issues (e.g. a VM running hot on a resource) along with a recommendation
- To pull a PDF or CSV performance report for a stakeholder or an incident writeup

## How to get there

- Route / id: `/analytics`
- Nav: **Monitoring → Analytics** (sidebar, command palette, or desktop nav)

## What you can do

1. **Time range** — pick Last Hour, 6 Hours, 24 Hours, 7 Days, or 30 Days from the dropdown; it drives the performance chart and reloads all data on the page.
2. **Export** — the Export button opens a menu to download a performance report as PDF or CSV for the selected time range.
3. **Resource Utilization Overview** — four tiles (CPU, Memory, Disk, Network) show current utilization percentage with a color-coded bar (green under 50%, blue 50-75%, amber 75-90%, red 90%+).
4. **Performance Insights** — up to 5 flagged issues, each tagged critical/warning/info, naming the VM, the resource, its current value, and a written recommendation.
5. **Top VMs by Resource** — three ranked lists (by CPU, by Memory, by Network) showing the top 5 VMs each, with a bar and percentage (or Mbps for network).
6. **System Performance Over Time** — an area chart of total CPU% and memory% across the selected time range, plus summary figures below it: average CPU, average memory, total VMs, and running VMs for that window.

This page is read-only — it reports on performance, it doesn't let you act on a VM directly (use the VM detail page for that).

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
