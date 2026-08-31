# Dashboard

## Purpose

Dashboard — the fabric at a glance: how many VMs exist and in what state, live CPU/memory trends, and whether each backend subsystem is actually reachable.

## When to use it

- As your console landing page — it loads at `/app`
- To check overall health before digging into a specific VM or subsystem
- Start here if you're new to the product; a first-time install lands somewhere useful, not an empty table

## How to get there

- Route: `/app`
- Nav: **Core → Dashboard** (sidebar or command palette), or the wordmark in the top bar
- After sign-in at `/sign-in` you land here

## Operate from the console (UX)

1. Check subsystem status (VM driver, storage, network security, authentication, events) — each shows Live, Unreachable, or Off.
2. Read the stat cards: total VMs, running, stopped, and total allocated memory/vCPUs.
3. Watch live CPU and memory usage charts when VMs are running.
4. Scan the VM table, or open [Virtual Machines](vms.md).
5. **On a fresh install with no VMs yet**, use Getting Started links to create a VM, templates, API playground, or access control.

## Related pages

- [Virtual Machines](vms.md)
- [Create VM](create.md)
- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
