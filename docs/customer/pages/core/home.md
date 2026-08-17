# Dashboard

## Purpose

Dashboard — the fabric at a glance: how many VMs exist and in what state, live CPU/memory trends, and whether each backend subsystem is actually reachable.

## When to use it

- As your landing page — it's what loads at `/`
- To check overall health before digging into a specific VM or subsystem
- Start here if you're new to the product; a first-time install lands somewhere useful, not an empty table

## How to get there

- Route / id: `/`
- Nav: **Core → Dashboard** (sidebar, command palette, or desktop nav), or the logo in the top left

## What you can do

1. Check subsystem status (VM driver, storage, network security, authentication, events) — each shows Live, Unreachable, or Off, with a short detail line.
2. Read the stat cards: total VMs, running, stopped, and total allocated memory/vCPUs.
3. Watch live CPU and memory usage charts, averaged across running VMs and updated continuously over WebSocket.
4. Scan the VM table for a quick status check, or click **View all** to go to the full [Virtual Machines](vms.md) list.
5. **On a fresh install with no VMs yet**, the empty table is replaced by a short "Getting Started" panel with direct links to the four places people usually go first: create your first VM, start from a template, try the API playground, or set up access control for your team.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Virtual Machines](vms.md)
- [Create VM](create.md)
- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
