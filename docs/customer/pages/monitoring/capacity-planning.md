# Capacity

## Purpose

Capacity Planning — resource usage against total capacity per resource (memory, CPU, storage), with week-over-week trend, so you can see what's running out and when.

## When to use it

- To check whether the host is approaching a resource ceiling before it becomes an incident
- To see which resources are growing week over week and by how much
- To get a rough sense of how many active VMs are contributing to current usage

## How to get there

- Route / id: `/capacity-planning`
- Nav: **Monitoring → Capacity** (sidebar, command palette, or desktop nav)

## What you can do

1. **Capacity warning banner** — appears automatically whenever any tracked resource is above 75% usage, naming which ones.
2. **Summary tiles** — Active VMs (count), Resources Tracked, resources Over 75% Usage, and Growing Resources (trending upward).
3. **Per-resource cards** — one card per tracked resource (e.g. Memory, CPU Cores, Storage), each showing: an icon, used/total with units (auto-converts GB to TB past 1024 GB), current usage percentage, a color-coded progress bar (green/blue/amber/red by thresholds), the weekly trend (%/week, with an up/down arrow), how much capacity remains, and a projected-full date when the backend supplies one.
4. The page refreshes itself every 30 seconds; use the header refresh control to force an immediate reload.

This page is read-only reporting — there's nothing to configure or act on here directly.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
