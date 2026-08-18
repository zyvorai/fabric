# Snapshots

## Purpose

VM Snapshots — create point-in-time snapshots of a specific VM's disk (or disk + state), and revert or delete them. Unlike most Operations pages, this one is scoped to one VM at a time, entered by name.

## When to use it

- To capture a VM's disk state before a risky change, then roll back if needed
- To browse the snapshot history for a specific VM
- To revert a VM to an earlier snapshot
- To clean up old snapshots you no longer need

## How to get there

- Route / id: `/snapshots`
- Nav: **Operations → Snapshots** (sidebar, command palette, or desktop nav)

## What you can do

1. Type a VM name into the **VM Name** field and click **Load Snapshots** (or wait — snapshots load automatically once a name is entered) to see that VM's snapshot list. Nothing loads until a VM name is provided.
2. **Create** — opens a dialog for a snapshot name, an optional description, and a type: **Disk Only** or **Full (Disk + State)**.
3. The snapshot table lists each snapshot's name, type, description, and relative creation time.
4. Per-snapshot actions: **Revert to snapshot** (confirmation dialog warns the VM must be stopped first) and **Delete snapshot** (confirmation dialog).
5. If the VM has no snapshots yet, the table shows "No snapshots found for this VM."

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
