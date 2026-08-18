# Favorites

## Purpose

Favorites — a personal, starred shortlist of VMs pulled from your full VM list, so the machines you use most are one click away instead of buried in a longer list.

## When to use it

- To jump straight to the handful of VMs you check on or console into regularly
- To pin or unpin VMs as your day-to-day working set changes
- To search across every VM (not just the pinned ones) from a single search box

## How to get there

- Route / id: `/favorites`
- Nav: **Core → Favorites** (sidebar, command palette, or desktop nav)

## What you can do

1. Click the star next to any VM to pin or unpin it. Favorites are saved in your browser's local storage, not on the server — they don't follow you to a different browser or device.
2. The list splits into **Pinned VMs** (your favorites) and **All VMs** (everything else); the search box filters both by name or state.
3. Each row shows vCPU count, memory, and a state badge; click the name to open the VM's detail page, or **Console** to jump straight into its console tab.
4. **Refresh** reloads the underlying VM list from the server.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
