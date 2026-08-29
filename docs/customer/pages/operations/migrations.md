# Migrations

## Purpose

VM Migrations — move a VM from its current host to a different target host, and track the migration from start to finish. The list auto-refreshes every 5 seconds so in-flight migrations update live.

## When to use it

- To move a VM off a host for maintenance or to rebalance load
- To watch the progress of a migration currently in flight (percent complete, bytes transferred)
- To cancel a migration that's stuck or no longer needed
- To review past migrations — which VM, which target host, which type, and how they ended

## How to get there

- Route / id: `/migrations`
- Nav: **Operations → Migrations** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. **Start Migration** — opens a dialog where you pick a VM from the dropdown (populated from your VM list), enter a target host (hostname or IP), and choose a migration type:
   - **Offline** — stop the VM, copy its data, then start it on the target
   - **Live** — migrate with minimal downtime
   - **Storage** — migrate storage volumes only
2. **Active Migrations** — each in-progress migration shows as a card with a live progress bar (percent complete), bytes transferred, its state badge (pending, precheck, syncing, switching), and a **Cancel** button. Any error from a failed migration is shown inline on the card.
3. **Migration History** — a table of completed, failed, and cancelled migrations showing VM, target host, migration type, final status, and start time.
4. **Refresh** — manually reload the list; the page also polls automatically every 5 seconds.
5. If there are no migrations at all, the page shows an empty state with a shortcut into the Start Migration dialog.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
