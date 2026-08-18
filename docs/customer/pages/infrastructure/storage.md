# Storage

## Purpose

Storage — a consolidated view of every storage pool's capacity alongside every volume (VM disk image) across all pools, regardless of which pool it lives in. To create or manage a pool itself, use [Storage Pools](storage-pools.md); for replicated/policy-driven storage across hosts, see [Distributed Storage](distributed-storage.md).

## When to use it

- To see total capacity, used space, volume count, and pool count across the whole host in one place
- To find which VM a particular volume/disk is attached to, or confirm it's unattached
- To remove an orphaned or unused volume

## How to get there

- Route / id: `/storage`
- Nav: **Infrastructure → Storage** (sidebar, command palette, or desktop nav)

## What you can do

1. Review stat cards: total capacity, used space, volume count, and pool count.
2. Storage Pools panel — each pool's name, path, type badge, state, and a used/total usage bar color-coded by how full it is.
3. Volumes table — every volume across all pools: name, pool, size, format (qcow2 / raw / vmdk), the VM it's attached to (or "Not attached"), and a **Delete** action with a confirmation dialog.

Pool creation and lifecycle (start/stop) live on [Storage Pools](storage-pools.md) — from here you can browse and delete volumes, not create or clone them.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
