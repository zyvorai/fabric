# Quotas

## Purpose

Resource Quotas — cap CPU, memory, disk, and VM-count usage, applied either globally or to VMs matching specific tags, so a team or workload can't consume unlimited host resources.

## When to use it

- To limit how many CPUs, how much memory/disk, or how many VMs a team can create
- To scope a limit to a subset of VMs by tag, rather than the whole host
- To check whether a quota is currently exceeded and which resource pushed it over
- To temporarily disable a quota without deleting its configuration

## How to get there

- Route / id: `/quotas`
- Nav: **Operations → Quotas** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. **Create Quota** — opens a form for the quota name, four numeric limits (max CPUs, max memory in MB, max disk in GB, max VMs), and optional tags to scope it to tagged VMs only (leave tags empty to apply globally). A checkbox lets you enable the quota immediately on creation.
2. Each quota renders as a card with **Enabled/Disabled** and **Exceeded** badges, and four usage bars (CPUs, memory, disk, VMs) each showing used/limit and a percentage, colored green under 75%, yellow at 75–89%, and red at 90%+.
3. If a quota is exceeded, the card shows a warning listing which resources are over limit and notes that new VMs matching this quota can't be created until usage drops.
4. Per-quota actions: **Enable/Disable** (toggle without deleting), **Edit** (opens the same form pre-filled, showing current usage and warning if a new limit would go below what's already in use), and **Delete** (confirmation dialog, cannot be undone).
5. If no quotas exist yet, the page shows an empty state with a shortcut to create the first one.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
