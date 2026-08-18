# Storage

## Purpose

Storage — a consolidated view of every storage pool's capacity alongside a manual volume tracking ledger. To create or manage a pool itself, use [Storage Pools](storage-pools.md); for replicated/policy-driven storage across hosts, see [Distributed Storage](distributed-storage.md).

## When to use it

- To see total capacity, used space, and pool count across the whole host in one place
- To keep a manual record of volumes you've provisioned elsewhere (which pool, what size, which VM it's meant for) alongside their real-world lifecycle

## How to get there

- Route / id: `/storage`
- Nav: **Infrastructure → Storage** (sidebar, command palette, or desktop nav)

## What you can do

1. Review stat cards: total capacity, used space, volume count, and pool count.
2. Storage Pools panel — each pool's name, path, type badge, state, a used/total usage bar color-coded by how full it is, and an **Add Volume Record** button.
3. Volumes table — every volume record across all pools: name, pool, size, the VM it's marked attached to (or "Not attached"), and **Resize**, **Attach**/**Detach**, and **Delete** actions (delete has a confirmation dialog).

**Important:** the Volumes table is a manual tracking ledger, not live disk management — creating, resizing, attaching, or detaching a record here only updates that record. It does not provision, resize, or attach a real disk image, and does not change any VM's actual configuration. Use it to keep notes on volumes you provision through other means (e.g. directly on the pool, or via Storage Pools' RBD image management for Ceph). Pool creation and lifecycle (start/stop) live on [Storage Pools](storage-pools.md).

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
