# Bulk Operations

## Purpose

Bulk Operations — select any number of VMs and start, stop, restart, or snapshot them together, with a per-VM progress log for the batch.

## When to use it

- To restart or stop a group of VMs at once (e.g. before a maintenance window) instead of one at a time
- To take a quick snapshot of several VMs together before a risky change
- To see which VMs in a batch action succeeded and which failed, with the specific error for each

## How to get there

- Route / id: `/bulk-operations`
- Nav: **Operations → Bulk Operations** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. Filter the VM list by name, then click rows to select VMs (or use **Select All** / **Deselect All** for whatever the current filter shows).
2. Once at least one VM is selected, an action bar appears with **Start**, **Stop**, **Restart**, and **Snapshot** — snapshot creates a timestamped snapshot (`bulk-snap-<timestamp>`) on each selected VM.
3. Each action runs sequentially across the selected VMs (no confirmation dialog — the action fires as soon as you click it), with **Batch Progress** showing a live per-VM status: pending → running → done/error, plus the specific error message if one VM fails while others succeed.
4. **Clear** deselects everything, and **Clear results** dismisses the batch progress log once a run finishes.
5. The VM table also shows each VM's state, CPU count, and memory as a quick reference while selecting.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
