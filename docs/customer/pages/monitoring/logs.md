# Logs

## Purpose

Logs — a searchable, filterable console view of Zyvor Fabric's audit log: every recorded action and event, level-coded and continuously refreshed.

## When to use it

- Investigating what changed and when — VM creates/deletes, config changes, and other recorded actions
- Filtering down to just `ERROR`/`WARN` entries to find what went wrong
- Searching by keyword or source, or exporting a filtered slice, before opening a support ticket

## How to get there

- Route / id: `/logs`
- Nav: **Monitoring → Logs** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. **Filter box** — matches against the log message and source as you type.
2. **Level dropdown** — narrow to `ALL`, `INFO`, `WARN`, `ERROR`, or `DEBUG`.
3. **Auto-scroll** checkbox — keeps the view pinned to the newest entry as new ones arrive (the feed polls every 5 seconds).
4. **Refresh** — manual reload in addition to the automatic poll.
5. **Export** — downloads the currently filtered entries as a plain-text `.txt` file (timestamp, level, source, message).
6. **Clear** (trash icon) — clears the log view locally only; it doesn't delete the underlying audit history, so the entries reappear on the next refresh or poll.
7. Each entry is color-coded by level (cyan info, yellow warn, red error/critical, slate debug) and shows timestamp, level, source, and message.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
