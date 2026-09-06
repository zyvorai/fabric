# Job Monitor

## Purpose

Job Monitor — a live view of background jobs (disk conversions, migrations, and other pipeline work), with per-job progress, pipeline stage, and streaming logs.

## When to use it

- To watch a long-running migration or conversion job progress in real time
- To find out why a job failed — the error detail and log output are right next to each other
- To check which pipeline stage a job is currently in (prepare, convert, validate, deploy)

## How to get there

- Route / id: `/job-monitor`
- Nav: **More — images, migrations & managers → Job Monitor** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. **Job list** (left) — every job as a card: name (or VM name), a status badge (pending, running, completed, failed, cancelled) with icon, and a progress bar with current step. The list polls every 3 seconds, so running jobs update live.
2. **Select a job** to open its detail panel on the right: Status, Progress, Phase, and Duration tiles, plus a pipeline-stage tracker (**prepare → convert → validate → deploy**) that highlights the completed stages in green and the current stage in blue (or red if the job failed). A failed job also shows its error message in a dedicated panel.
3. **Logs** — streams the selected job's log output, polling every 2 seconds. Toggle **Follow** to auto-scroll to the newest lines, or uncheck it to scroll back through earlier output without being pulled back down.
4. Use the header **refresh** control to force an immediate reload of the job list.
5. This page is read-only monitoring — there's no way to create, edit, retry, or cancel a job from here.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
