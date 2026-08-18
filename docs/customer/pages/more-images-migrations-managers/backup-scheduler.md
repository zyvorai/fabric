# Backup Scheduler

## Purpose

Backup Scheduler — create and manage recurring, automated backup jobs that snapshot one or more VMs' disks to a directory on a schedule, with retention and format controls.

## When to use it

- To set up nightly or weekly backups for a group of VMs instead of exporting disks by hand
- To back up several VMs on a shared cadence (e.g. every 6 hours) with a single schedule
- To control how much backup history is kept, and in what disk format, without babysitting the job

## How to get there

- Route / id: `/backup-scheduler`
- Nav: **More — images, migrations & managers → Backup Scheduler** (sidebar, command palette, or desktop nav)

## What you can do

**Select VMs** — check the VMs you want the schedule to cover (each row shows its current state, e.g. `running`); **Select All** / **Deselect All** toggles the whole list at once.

**Schedule Configuration** — build the job:

- **Schedule Name** — a label for the job (e.g. `nightly-backup`).
- **Frequency** — pick a preset (**Daily 2 AM**, **Weekly Sun 3 AM**, **Every 6h**) or **Custom** to enter a raw cron expression; the page shows a plain-English readout of what the cron actually means (e.g. "Daily at 2:00 AM").
- **Output Directory** — where backups land on the host (defaults to `/var/lib/zyvor-fabricd/backups`).
- **Retention (keep last N)** — how many backups to retain before older ones are pruned (1–365).
- **Format** — QCOW2, RAW, or VMDK for the backup disk files.
- **Enable compression** — toggle to compress backup output.

Click **Create Schedule** to save it — you need at least one VM selected and a schedule name, or the page shows a validation error inline.

**Existing Schedules** — lists every configured schedule with its enabled/disabled state, cron expression (raw and human-readable), how many VMs it covers, and its next run time when available.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
