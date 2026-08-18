# VM Browser

## Purpose

VM Browser — a lightweight, read-only grid of every VM, for quickly scanning or searching without the bulk-action tooling of the full [Virtual Machines](vms.md) list.

## When to use it

- To browse or search VMs by name, state, or image in a compact card layout
- To jump straight to a single VM's detail page without needing selection, filtering by tag, or bulk actions

## How to get there

- Route / id: `/vm-browser`
- Nav: **Core → VM Browser** (sidebar, command palette, or desktop nav)

## What you can do

1. Search by name, state, or image — the header shows total VM count and how many are running.
2. Each card shows the VM's name, state badge, image, vCPU count, memory, and IP address (if assigned).
3. Click a card to open that VM's detail page.
4. **Refresh** reloads the list from the server.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
