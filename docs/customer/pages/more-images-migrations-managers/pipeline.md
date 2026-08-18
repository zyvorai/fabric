# Pipeline

## Purpose

Pipeline Monitor — a live, auto-refreshing view of in-progress migration/conversion jobs, showing each job's percent complete and which of five stages it's currently in.

## When to use it

- To watch a migration or conversion in progress and see exactly which stage it's at
- To catch a failure as it happens instead of waiting for the history page to update
- To find a job's duration or output path as soon as it's available

## How to get there

- Route / id: `/pipeline`
- Nav: **More — images, migrations & managers → Pipeline** (sidebar, command palette, or desktop nav)

## What you can do

1. The page loads active jobs on open, then polls silently every 3 seconds; the header **Refresh** forces a manual reload.
2. Each job card shows the VM name, job ID, source, and a status badge (pending / running / completed / failed).
3. A progress bar shows percent complete.
4. A stage tracker walks through **inspect → prepare → convert → validate → deploy**: completed stages are green, the current stage pulses blue (red if the job failed), and remaining stages are grey.
5. Duration and output path appear once available; a failed job shows its error message in a red panel below.
6. This is a read-only monitor — there's no start, cancel, or retry action here.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
