# Storage Mgr

## Purpose

Storage Manager — browse storage pools with their capacity and usage, and drill into a pool to see its volumes.

## When to use it

- To check how full a storage pool is before provisioning new disks on it
- To see what volumes live in a given pool, and their format and size
- To find a volume's on-disk path

## How to get there

- Route / id: `/storage-manager`
- Nav: **More — images, migrations & managers → Storage Mgr** (sidebar, command palette, or desktop nav)

## What you can do

1. Pools load on open; the header **Refresh** reloads them.
2. Each pool is a card showing its name, a type badge (dir / logical / netfs / disk / iscsi / rbd / zfs), a state badge, a usage bar (blue, turning amber above 70% and red above 90%), and used / capacity / available figures.
3. Click a pool card to select it and load its volumes.
4. The volumes table for the selected pool lists Name, Format, Capacity, Allocation, and Path.
5. This page is read-only — there's no create, resize, or delete action for pools or volumes here.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
