# History

## Purpose

Migration History — a read-only log of completed and failed migration jobs, with status, timing, and where the output landed.

## When to use it

- To check whether a past migration succeeded or failed
- To read the error message left behind by a failed migration
- To see how long a migration took, or where its output disk was written

## How to get there

- Route / id: `/migration-history`
- Nav: **More — images, migrations & managers → History** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. The page loads history from the migrations API as soon as you open it; use the header **Refresh** control to reload.
2. Table columns: **Name**, **VM**, **Status** (completed / failed / running badge, with the error message shown inline under failed rows), **Started**, **Duration**, and **Output** (output path).
3. There are no filters, search, or per-row actions here — it's a plain historical log. If nothing has run yet, you'll see "No migration history yet."

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
