# Report

## Purpose

Migration Report — a shareable summary of all migration jobs (totals by status, average duration) plus the full per-migration detail table, with copy and print actions.

## When to use it

- To get an at-a-glance count of successful, failed, and running migrations
- To copy a plain-text summary of migrations for a status update or ticket
- To print or save the report as a PDF for a record or audit

## How to get there

- Route / id: `/migration-report`
- Nav: **More — images, migrations & managers → Report** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. The page generates a report as soon as you open it; use the header **Refresh** control to regenerate it.
2. Once data loads, two header actions appear: **Copy Report** — copies a formatted plain-text summary (totals, average duration, and each migration's name/status/VM/duration/error) to your clipboard — and **Print** — opens the browser print dialog with a print-optimized layout.
3. Five summary tiles: **Total**, **Successful**, **Failed**, **Running**, **Avg Duration**.
4. A full table below lists every migration: Name, VM, Status badge, Duration, Output path, and Error. If nothing has run yet, you'll see "No migration data."

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
