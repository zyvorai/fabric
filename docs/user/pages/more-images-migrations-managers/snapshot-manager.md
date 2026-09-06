# Snapshot Mgr

## Purpose

Snapshot Manager — create, revert to, and delete disk-state snapshots for a selected VM.

## When to use it

- Before a risky change to a VM, to capture its disk state so you can roll back
- To revert a VM to an earlier snapshot after something went wrong
- To clean up old snapshots you no longer need, or check a snapshot's creation time and parent

## How to get there

- Route / id: `/snapshot-manager`
- Nav: **More — images, migrations & managers → Snapshot Mgr** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. **Select VM** — pick a VM from the dropdown to load its snapshots; the list auto-refreshes every 15 seconds while a VM is selected, or use **Refresh** to reload on demand.
2. **Create Snapshot** — enter a name, choose **Disk Only** (default) or **Full (disk + memory)**, and click **Create**. Full can take several minutes under load; the UI shows progress text and retries if the VM monitor is still starting. A success banner confirms create.
3. The snapshots table lists Name, Created timestamp, State, and Parent, with two actions per row:
   - **Revert** (circular arrow) — reverts the VM to that snapshot, behind a confirmation dialog
   - **Delete** (trash) — deletes the snapshot, behind a confirmation dialog
4. Empty states: no VM selected prompts "Select a VM"; a VM with no snapshots shows "No snapshots."

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
