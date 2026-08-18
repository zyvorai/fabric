# Timeline

## Purpose

Timeline — a single reverse-chronological activity feed that merges audit-log actions and system alerts, so you can see what happened and in what order without switching between Logs and Notifications.

## When to use it

- Reconstructing a sequence of events — what led up to an error, in order
- Getting a quick "what's happened lately" view of the whole system
- Filtering down to just deploys, or just errors, to review one class of events

## How to get there

- Route / id: `/timeline`
- Nav: **Monitoring → Timeline** (sidebar, command palette, or desktop nav)

## What you can do

1. Filter chips — **All**, **Actions**, **Alerts**, **Deploys**, **Errors** — filter the merged feed client-side.
2. Each entry is auto-classified and shown with an icon/color, description, relative timestamp, and type tag: audit entries with a failed/error status become **Error**, create/deploy-style actions become **Deploy**, other audit entries become **Action**; alerts become **Alert**, or **Error** if their severity is critical/error.
3. The feed auto-refreshes every 10 seconds; the header shows "Updated Xm ago," and there's also a manual refresh button.
4. If a background refresh fails after data has already loaded, an amber banner reports it while the last known feed stays on screen.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
